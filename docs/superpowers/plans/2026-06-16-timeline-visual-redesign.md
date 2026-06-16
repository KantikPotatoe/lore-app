# Timeline Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Timeline's List view (Chronicle Cards) and Axis view (Ruler + Glow), add an optional emoji icon field to events, and pull linked-page infobox images into list cards.

**Architecture:** Pure visual layer — no routing changes, no new dependencies, no Dexie schema version bump. `icon?: string` is added to `TimelineEvent` (optional field, old rows read as `undefined`). All visual work is split between component TSX and `src/index.css`.

**Tech Stack:** React + TypeScript, Dexie (IndexedDB), plain CSS variables, Vite dev server on port 5174.

---

## File Map

| File | What changes |
|---|---|
| `src/db.ts` | Add `icon?: string` to `TimelineEvent` interface |
| `src/components/EventEditor.tsx` | Add `icon` to `Draft`, `initDraft`, `handleSave`, and UI row |
| `src/components/TimelineVertical.tsx` | Chronicle Cards: era dividers, card header strips, body layout |
| `src/components/TimelineHorizontal.tsx` | Ruler header (major/minor ticks), era band gradients, lane strips, glow events, luminance helper, icon in blocks |
| `src/index.css` | Remove old `.tl-era-header`; add `.tl-era-divider`, `.tl-card-*`, `.tl-card-thumb`; update `.horiz-header`, `.horiz-tick`, `.horiz-event`; add `.horiz-lane-strip` |

---

## Task 1: Add `icon` field to `TimelineEvent`

**Files:**
- Modify: `src/db.ts:100-125`

- [ ] **Step 1: Add the field to the interface**

In `src/db.ts`, add one line after `color?: string` (line 109):

```ts
export interface TimelineEvent {
  id: string
  calendarId: string
  title: string
  /** Rich-text HTML from LoreEditor. */
  description: string
  /** Free-form category label (e.g. "Battle", "Birth", "Founding"). */
  category: string
  /** Optional hex color for the event accent. Falls back to --accent. */
  color?: string
  /** Optional single emoji shown in the card header and axis block. */
  icon?: string
  /** Linked lore page stored id, like MapPin.pageId. Null if unlinked. */
  pageId: string | null
  startYear: number
  /** 0-based month index into the calendar's months array. */
  startMonth: number
  /** 1-based day within the month. */
  startDay: number
  endYear?: number
  endMonth?: number
  endDay?: number
  /** Cached absolute-day for sorting and horizontal positioning. Computed on every write. */
  startAbsolute: number
  endAbsolute?: number
  createdAt: number
  updatedAt: number
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no type errors. (The field is optional, so existing rows that lack it read as `undefined` — no migration needed.)

- [ ] **Step 3: Commit**

```bash
git add src/db.ts
git commit -m "feat(timeline): add icon field to TimelineEvent"
```

---

## Task 2: Add icon input to EventEditor

**Files:**
- Modify: `src/components/EventEditor.tsx`

- [ ] **Step 1: Add `icon` to the Draft interface and `initDraft`**

Replace the `Draft` interface (lines 14–28) and `initDraft` function (lines 30–47) with:

```ts
interface Draft {
  calendarId: string
  title: string
  description: string
  category: string
  color: string
  icon: string
  pageId: string | null
  startYear: number
  startMonth: number
  startDay: number
  hasEnd: boolean
  endYear: number
  endMonth: number
  endDay: number
}

function initDraft(event: TimelineEvent | undefined, calendars: Calendar[]): Draft {
  const defaultCalId = calendars[0]?.id ?? ''
  return {
    calendarId:  event?.calendarId ?? defaultCalId,
    title:       event?.title ?? '',
    description: event?.description ?? '',
    category:    event?.category ?? '',
    color:       event?.color ?? '',
    icon:        event?.icon ?? '',
    pageId:      event?.pageId ?? null,
    startYear:   event?.startYear ?? 0,
    startMonth:  event?.startMonth ?? 0,
    startDay:    event?.startDay ?? 1,
    hasEnd:      event?.endYear != null,
    endYear:     event?.endYear ?? 0,
    endMonth:    event?.endMonth ?? 0,
    endDay:      event?.endDay ?? 1,
  }
}
```

- [ ] **Step 2: Pass `icon` in `handleSave`**

Inside `handleSave`, the `data` object (lines 79–92) becomes:

```ts
const data = {
  calendarId:  draft.calendarId,
  title:       draft.title.trim(),
  description: draft.description,
  category:    draft.category.trim(),
  color:       draft.color || undefined,
  icon:        draft.icon || undefined,
  pageId:      draft.pageId,
  startYear:   draft.startYear,
  startMonth:  draft.startMonth,
  startDay:    Math.min(draft.startDay, maxDay),
  endYear:     draft.hasEnd ? draft.endYear : undefined,
  endMonth:    draft.hasEnd ? draft.endMonth : undefined,
  endDay:      draft.hasEnd ? Math.min(draft.endDay, maxEndDay) : undefined,
}
```

- [ ] **Step 3: Add the Icon input row to the UI**

In the JSX, after the Color `field-row` div (after line 244, before the "Linked page" label), insert:

```tsx
<div className="field-row" style={{ marginTop: 4 }}>
  <label className="field-label" style={{ minWidth: 60 }}>Icon</label>
  <input
    value={draft.icon}
    onChange={(e) => set('icon', e.target.value)}
    placeholder="emoji · optional"
    maxLength={2}
    style={{ width: 60, textAlign: 'center', fontSize: 18 }}
    className="tpl-name-input"
  />
</div>
```

- [ ] **Step 4: Start the dev server and verify**

```bash
npm run dev
```

Open http://localhost:5174, go to Timeline, open any event editor. The "Icon" row should appear between Color and Linked page. Type an emoji — it saves and re-opens with the emoji.

- [ ] **Step 5: Commit**

```bash
git add src/components/EventEditor.tsx
git commit -m "feat(timeline): add emoji icon input to EventEditor"
```

---

## Task 3: List view — Chronicle Cards (era dividers + card structure)

**Files:**
- Modify: `src/components/TimelineVertical.tsx`
- Modify: `src/index.css` (Timeline Vertical section, lines ~1238–1269)

- [ ] **Step 1: Replace the `TimelineVertical` return statement**

Replace the entire `return (...)` in `src/components/TimelineVertical.tsx` (lines 59–119) with:

```tsx
  return (
    <div className="tl-vert">
      {groups.map((group, gi) => (
        <div key={group.era?.id ?? `pre-${gi}`} className="tl-era-group">
          <div className="tl-era-divider">
            <span
              className="tl-era-divider-text"
              style={{ color: group.era?.color ?? 'var(--ink-faint)' }}
            >
              {group.era ? group.era.name : 'Before recorded history'}
            </span>
          </div>

          <div className="tl-era-events">
            {group.events.map((event) => {
              const { year: sy, month: sm, day: sd } = absoluteToDate(displayCal, event.startAbsolute)
              const startLabel = formatDate(displayCal, sy, sm, sd, { showEra: false })
              const endLabel = event.endAbsolute != null
                ? (() => {
                    const { year: ey, month: em, day: ed } = absoluteToDate(displayCal, event.endAbsolute)
                    return formatDate(displayCal, ey, em, ed, { showEra: false })
                  })()
                : null
              const dateLabel = endLabel ? `${startLabel} — ${endLabel}` : startLabel
              const linkedPage = event.pageId ? pageById.get(event.pageId) : null
              const accent = event.color ?? 'var(--accent)'
              const thumbImage = linkedPage?.infobox?.image

              return (
                <div
                  key={event.id}
                  className="tl-event-card"
                  onClick={() => onEdit(event)}
                >
                  <div className="tl-card-header" style={{ background: accent + '22' }}>
                    <div className="tl-card-header-left">
                      {event.icon && <span className="tl-card-icon">{event.icon}</span>}
                      {event.category && (
                        <span className="tl-card-cat" style={{ color: accent }}>
                          {event.category}
                        </span>
                      )}
                    </div>
                    <span className="tl-card-date">{dateLabel}</span>
                  </div>

                  <div className="tl-card-body">
                    <div className="tl-card-body-text">
                      <div className="tl-event-title">{event.title}</div>
                      {event.description && (
                        <div
                          className="tl-event-desc"
                          dangerouslySetInnerHTML={{ __html: event.description }}
                        />
                      )}
                      {linkedPage && (
                        <button
                          className="ghost-btn tl-page-link"
                          onClick={(e) => { e.stopPropagation(); navigate(`/page/${linkedPage.id}`) }}
                        >
                          → {linkedPage.title}
                        </button>
                      )}
                    </div>
                    {thumbImage && (
                      <img src={thumbImage} alt="" className="tl-card-thumb" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
```

- [ ] **Step 2: Replace the TimelineVertical CSS block in `src/index.css`**

Find the `/* --- TimelineVertical --- */` section (around line 1238) and replace everything from `.tl-vert` through `.tl-page-link` with:

```css
/* --- TimelineVertical ------------------------------------------------------ */
.tl-vert { padding: 24px 32px 60px; max-width: 800px; }
.tl-vert-empty { display: flex; align-items: center; justify-content: center; height: 200px; }

.tl-era-group { margin-bottom: 40px; }

.tl-era-divider {
  position: relative; text-align: center;
  padding: 6px 0; margin-bottom: 16px;
}
.tl-era-divider::before {
  content: ''; position: absolute; left: 0; right: 0; top: 50%;
  height: 1px; background: var(--border);
}
.tl-era-divider-text {
  position: relative; display: inline-block;
  background: var(--bg); padding: 0 14px;
  font-family: var(--display); font-size: 11px;
  letter-spacing: 1.5px; text-transform: uppercase;
}

.tl-era-events { display: flex; flex-direction: column; gap: 10px; padding-left: 0; }

.tl-event-card {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer; transition: background 0.15s;
  overflow: hidden;
}
.tl-event-card:hover { background: var(--panel-2); }

.tl-card-header {
  padding: 6px 12px;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.tl-card-header-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tl-card-icon { font-size: 14px; line-height: 1; flex-shrink: 0; }
.tl-card-cat {
  font-size: 10px; font-weight: 700; letter-spacing: 0.8px;
  text-transform: uppercase; font-family: var(--sans);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tl-card-date {
  font-size: 10px; color: rgba(255,255,255,0.45); font-family: var(--sans);
  white-space: nowrap; flex-shrink: 0;
}

.tl-card-body { padding: 8px 12px 10px; display: flex; gap: 10px; }
.tl-card-body-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

.tl-event-title { font-family: var(--display); font-size: 14px; color: var(--ink); letter-spacing: 0.2px; }
.tl-event-desc {
  font-size: 13px; color: var(--ink-dim); line-height: 1.5; font-family: var(--serif); font-style: italic;
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
}
.tl-event-desc p { margin: 0; }
.tl-page-link { font-size: 12px; align-self: flex-start; padding: 3px 8px; margin-top: 2px; }

.tl-card-thumb {
  width: 52px; height: 52px; flex-shrink: 0;
  border-radius: 5px; object-fit: cover;
  border: 1px solid rgba(255,255,255,0.1);
  align-self: flex-start;
}
```

- [ ] **Step 3: Verify in browser**

With `npm run dev` running, open http://localhost:5174/timeline (list view). Confirm:
- Era headers are centered dividers with era-colored text and a horizontal line
- Cards have a tinted header strip (event color at ~13% opacity) with category + date
- Card body has title in Cinzel, italic serif description
- Cards without category/description are compact but clean

- [ ] **Step 4: Commit**

```bash
git add src/components/TimelineVertical.tsx src/index.css
git commit -m "feat(timeline): Chronicle Cards — era dividers + card header strips"
```

---

## Task 4: List view — linked page thumbnail

*(Task 3 already included the `thumbImage` logic and `.tl-card-thumb` CSS. This task verifies it works end-to-end.)*

**Files:**
- No code changes — this verifies the work from Task 3.

- [ ] **Step 1: Test with a linked page that has an infobox image**

1. Go to any lore page (e.g. a Character page)
2. Upload an infobox image on that page (the image upload button in the right sidebar)
3. Go to Timeline → List view
4. Open any event, link it to that page via "Linked page", save
5. The 52×52 thumbnail should appear flush-right in the card body

- [ ] **Step 2: Verify graceful absence**

Events with no linked page, or a linked page with no infobox image, show no thumbnail — card body renders with just text.

*(If the thumbnail does not appear, check that `linkedPage?.infobox?.image` is returning a value — `LorePage.infobox` is optional, and `Infobox.image` is `string | null`. Only a non-null/non-empty string renders the `<img>`.)*

---

## Task 5: Axis view — ruler header + era band gradients + lane strips

**Files:**
- Modify: `src/components/TimelineHorizontal.tsx`
- Modify: `src/index.css` (TimelineHorizontal section, lines ~1271–1311)

- [ ] **Step 1: Update `HEADER_H` and add major-tick logic**

At the top of `TimelineHorizontal.tsx`, change the constant:

```ts
const LANE_H = 30
const HEADER_H = 48   // was 44
const LANE_GAP = 4
```

Before the `tickYears` array declaration (around line 94), add:

```ts
const eraStartYears = new Set(displayCal?.eras.map((e) => e.startYear) ?? [])
```

Change the `tickYears` type to include `major`:

```ts
const tickYears: { abs: number; label: string; major: boolean }[] = []
```

Inside the loop that pushes to `tickYears`, add the `major` property:

```ts
tickYears.push({
  abs,
  label: `Year ${yr}${eraName ? ` (${eraName})` : ''}`,
  major: eraStartYears.has(yr),
})
```

- [ ] **Step 2: Add lane strips render + update era bands + update tick render**

Replace the `return (...)` in `TimelineHorizontal.tsx` with:

```tsx
  return (
    <div
      ref={containerRef}
      className="tl-horiz"
      style={{ height: totalH }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {eraBands.map(({ era, x, w }) => (
        <div
          key={era.id}
          className="horiz-era-band"
          style={{
            left: x, width: w, height: totalH,
            background: era.color
              ? `linear-gradient(to right, ${era.color}06, ${era.color}14, ${era.color}06)`
              : 'transparent',
          }}
        >
          <span className="horiz-era-label">{era.name}</span>
        </div>
      ))}

      {Array.from({ length: numLanes }, (_, i) => (
        <div
          key={`lane-${i}`}
          className={i % 2 === 1 ? 'horiz-lane-strip horiz-lane-strip-alt' : 'horiz-lane-strip'}
          style={{ top: HEADER_H + i * (LANE_H + LANE_GAP), height: LANE_H + LANE_GAP }}
        />
      ))}

      <div className="horiz-header" style={{ height: HEADER_H }}>
        {tickYears.map(({ abs, label, major }) => (
          <div
            key={abs}
            className={major ? 'horiz-tick horiz-tick-major' : 'horiz-tick'}
            style={{ left: (abs - offsetAbs) * scale }}
          >
            <span className={major ? 'horiz-tick-label horiz-tick-label-major' : 'horiz-tick-label'}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {laid.map(({ event, lane, x, w }) => {
        const accent = event.color ?? 'var(--accent)'
        const top = HEADER_H + lane * (LANE_H + LANE_GAP)
        const linkedPage = event.pageId ? pageById.get(event.pageId) : undefined
        return (
          <div
            key={event.id}
            className="horiz-event"
            style={{ left: x, top, width: w, height: LANE_H, background: accent, position: 'absolute' }}
            title={linkedPage ? `${event.title} → ${linkedPage.title}` : event.title}
            onClick={() => onEdit(event)}
          >
            {w > 50 && (
              <span className="horiz-event-label">{event.title}</span>
            )}
          </div>
        )
      })}

      <div className="horiz-hint">Scroll to zoom · drag to pan</div>
    </div>
  )
```

*(Note: the glow and icon logic are added in Task 6 — the event block above is a stepping stone.)*

- [ ] **Step 3: Replace the TimelineHorizontal CSS block in `src/index.css`**

Find the `/* --- TimelineHorizontal --- */` section (around line 1271) and replace everything from `.tl-horiz` through `.horiz-hint` with:

```css
/* --- TimelineHorizontal ---------------------------------------------------- */
.tl-horiz {
  position: relative; overflow: hidden; cursor: grab; user-select: none;
  background: var(--bg); width: 100%;
}
.tl-horiz:active { cursor: grabbing; }

.horiz-era-band { position: absolute; top: 0; }
.horiz-era-label {
  position: sticky; left: 8px; top: 6px; display: inline-block;
  font-family: var(--display); font-size: 10px; color: var(--ink-faint);
  letter-spacing: 1.2px; text-transform: uppercase;
  opacity: 0.45; pointer-events: none;
}

.horiz-lane-strip {
  position: absolute; left: 0; right: 0;
  border-bottom: 1px solid rgba(255,255,255,0.025);
  pointer-events: none; z-index: 0;
}
.horiz-lane-strip-alt { background: rgba(255,255,255,0.012); }

.horiz-header {
  position: sticky; top: 0; z-index: 2;
  background: linear-gradient(to bottom, var(--bg-2), var(--bg));
  border-bottom: 2px solid #5a4e35;
  pointer-events: none;
}
.horiz-tick {
  position: absolute; top: 0; bottom: 0;
  border-left: 1px solid #3a3328;
  padding-left: 4px;
}
.horiz-tick-major { border-left-color: rgba(201,162,75,0.55); }
.horiz-tick-label {
  font-size: 10px; color: var(--ink-faint); white-space: nowrap;
  position: absolute; top: 50%; transform: translateY(-50%);
  font-family: var(--display); letter-spacing: 0.4px;
}
.horiz-tick-label-major { color: rgba(201,162,75,0.8); }

.horiz-event {
  border-radius: 6px; cursor: pointer; overflow: hidden;
  display: flex; align-items: center; padding: 0 6px; gap: 4px;
  transition: filter 0.1s; font-size: 11px; font-weight: 600;
  border-top: 1px solid rgba(255,255,255,0.18);
}
.horiz-event:hover { filter: brightness(1.15); }
.horiz-event-icon { font-size: 13px; line-height: 1; flex-shrink: 0; }
.horiz-event-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.horiz-hint {
  position: absolute; bottom: 8px; right: 12px;
  font-size: 11px; color: var(--ink-faint); pointer-events: none;
}
```

- [ ] **Step 4: Verify in browser**

Switch to Axis view. Confirm:
- Ruler header has a warm gold-brown bottom border, gradient background
- Era start year ticks are gold-tinted; other ticks are subtler
- Era bands are gradient fades (not flat fills)
- Alternating lane rows are barely visible as a subtle texture

- [ ] **Step 5: Commit**

```bash
git add src/components/TimelineHorizontal.tsx src/index.css
git commit -m "feat(timeline): Ruler+Glow — header, era bands, lane strips"
```

---

## Task 6: Axis view — glow events + luminance helper + icon

**Files:**
- Modify: `src/components/TimelineHorizontal.tsx`

- [ ] **Step 1: Add the `textColor` helper function**

Add this function just above the `export default function TimelineHorizontal` line in `TimelineHorizontal.tsx`:

```ts
function textColor(hex: string | undefined): string {
  if (!hex) return 'rgba(0,0,0,0.75)'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return r * 0.299 + g * 0.587 + b * 0.114 < 128
    ? 'rgba(255,255,255,0.85)'
    : 'rgba(0,0,0,0.75)'
}
```

- [ ] **Step 2: Update the event block render to add glow + icon**

Find the `laid.map(...)` section inside the `return (...)` (added in Task 5) and replace it with:

```tsx
      {laid.map(({ event, lane, x, w }) => {
        const accent = event.color ?? '#c9a24b'
        const top = HEADER_H + lane * (LANE_H + LANE_GAP)
        const linkedPage = event.pageId ? pageById.get(event.pageId) : undefined
        const glowAlpha = event.color
          ? (parseInt(event.color.slice(1, 3), 16) * 0.299
            + parseInt(event.color.slice(3, 5), 16) * 0.587
            + parseInt(event.color.slice(5, 7), 16) * 0.114 < 128 ? '55' : '33')
          : '33'
        const glow = event.color ? `0 0 14px ${event.color}${glowAlpha}` : 'none'
        return (
          <div
            key={event.id}
            className="horiz-event"
            style={{
              left: x, top, width: w, height: LANE_H,
              background: accent, position: 'absolute',
              color: textColor(event.color),
              boxShadow: glow,
            }}
            title={linkedPage ? `${event.title} → ${linkedPage.title}` : event.title}
            onClick={() => onEdit(event)}
          >
            {w > 40 && event.icon && (
              <span className="horiz-event-icon">{event.icon}</span>
            )}
            {w > 50 && (
              <span className="horiz-event-label">{event.title}</span>
            )}
          </div>
        )
      })}
```

- [ ] **Step 3: Verify in browser**

Open Axis view. Confirm:
- Events have a soft glow matching their color
- Dark-background events (red, deep purple) show white text; light-background events show dark text
- Events that have an emoji icon show it at the left edge when wide enough (> 40 px)
- The gold default-colored events (`#c9a24b`) show dark text

- [ ] **Step 4: Commit**

```bash
git add src/components/TimelineHorizontal.tsx
git commit -m "feat(timeline): glow events, luminance-based text color, icon in axis blocks"
```

---

## Done

All six tasks complete. The Timeline now has:
- **List view**: Chronicle Cards with era-colored centered dividers, colored header strips, optional emoji icon, optional linked-page thumbnail
- **Axis view**: Cinzel ruler with major/minor ticks, gradient era bands, subtle lane strips, glowing events with luminance-aware text color and optional emoji icon
- **EventEditor**: new Icon field (emoji text input)
