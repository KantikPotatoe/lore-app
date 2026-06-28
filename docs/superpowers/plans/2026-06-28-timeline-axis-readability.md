# Timeline Axis Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the timeline axis view (`TimelineHorizontal`) more readable — bigger type, roomier lanes, and lightweight zoom/fit/readout navigation controls.

**Architecture:** All changes are confined to `src/components/TimelineHorizontal.tsx` and its `.horiz-*` CSS block in `src/index.css`. Navigation math is extracted into two pure, exported helpers (`fitView`, `visibleYearRange`) so it can be unit-tested without simulating wheel/drag events. The component's initial-fit effect and the new "Fit all" button share `fitView`; the wheel handler and the +/− buttons share a `zoomAt` helper.

**Tech Stack:** React + TypeScript, Vitest + happy-dom, plain CSS. Calendar math from `src/calendar.ts` (`dateToAbsolute`, `absoluteToDate`, `yearLength`).

## Global Constraints

- TypeScript `strict` — no `any`, no unused vars.
- Before claiming done, all three must pass: `npm run lint`, `npm run build`, `npm run test:run`.
- Helpers are exported from `TimelineHorizontal.tsx` and imported by the test file.
- No data-model, route, or barrel (`src/db/index.ts`) changes.
- PR gets label `version:minor`.

---

### Task 1: Extract and test `fitView`

Pull the initial-fit math out of the `useEffect` into a pure exported function, cover it with tests, then make the effect call it. Behavior is unchanged — this is a refactor that unlocks the "Fit all" button (Task 3) and testability.

**Files:**
- Modify: `src/components/TimelineHorizontal.tsx` (the fit `useEffect` at lines ~39-48)
- Create: `src/components/TimelineHorizontal.test.ts`

**Interfaces:**
- Produces: `export function fitView(events: TimelineEvent[], width: number, displayCal: Calendar | null): { scale: number; offsetAbs: number }`
  - `width` is the container client width in px (the effect passes `containerRef.current.clientWidth`).
  - Empty `events` → returns `{ scale: 0.001, offsetAbs: 0 }` (safe default matching the component's initial state).

- [ ] **Step 1: Write the failing test**

Create `src/components/TimelineHorizontal.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Calendar, TimelineEvent } from '../db'
import { fitView } from './TimelineHorizontal'

function makeCalendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: 'cal-1',
    name: 'Test Reckoning',
    anchor: 0,
    months: [
      { name: 'Frostmoon', days: 10 },
      { name: 'Seedfall', days: 20 },
      { name: 'Highsun', days: 30 },
    ],
    weekdays: ['Sol', 'Lun', 'Ter', 'Mer', 'Jov', 'Ven', 'Sat'],
    eras: [
      { id: 'e1', name: 'First Age', startYear: 0 },
      { id: 'e2', name: 'Imperial Era', startYear: 100 },
    ],
    createdAt: 0,
    ...overrides,
  }
}

function makeEvent(startAbsolute: number, endAbsolute?: number): TimelineEvent {
  return {
    id: `ev-${startAbsolute}`,
    calendarId: 'cal-1',
    title: 'Event',
    description: '',
    category: '',
    pageId: null,
    startYear: 0, startMonth: 0, startDay: 1,
    startAbsolute,
    endAbsolute,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('fitView', () => {
  it('returns a safe default for no events', () => {
    expect(fitView([], 800, makeCalendar())).toEqual({ scale: 0.001, offsetAbs: 0 })
  })

  it('frames all events within the available width', () => {
    const events = [makeEvent(100), makeEvent(500, 700)]
    const width = 880 // usable = 880 - 80 = 800
    const { scale, offsetAbs } = fitView(events, width, makeCalendar())
    expect(scale).toBeGreaterThan(0)
    for (const e of events) {
      const startX = (e.startAbsolute - offsetAbs) * scale
      const endX = ((e.endAbsolute ?? e.startAbsolute) - offsetAbs) * scale
      expect(startX).toBeGreaterThanOrEqual(0)
      expect(endX).toBeLessThanOrEqual(width)
    }
  })

  it('handles a single event without a zero or infinite scale', () => {
    const { scale, offsetAbs } = fitView([makeEvent(1000)], 880, makeCalendar())
    expect(scale).toBeGreaterThan(0)
    expect(Number.isFinite(scale)).toBe(true)
    expect(Number.isFinite(offsetAbs)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/TimelineHorizontal.test.ts`
Expected: FAIL — `fitView` is not exported / not defined.

- [ ] **Step 3: Add the `fitView` helper**

In `src/components/TimelineHorizontal.tsx`, add after the imports (and `textColor` helper), at module scope:

```ts
export function fitView(
  events: TimelineEvent[],
  width: number,
  displayCal: Calendar | null,
): { scale: number; offsetAbs: number } {
  if (!events.length) return { scale: 0.001, offsetAbs: 0 }
  const minAbs = Math.min(...events.map((e) => e.startAbsolute))
  const maxAbs = Math.max(...events.map((e) => e.endAbsolute ?? e.startAbsolute))
  const range = Math.max(maxAbs - minAbs, displayCal ? yearLength(displayCal) * 10 : 3650)
  const w = Math.max(width - 80, 200)
  return { scale: w / range, offsetAbs: minAbs - range * 0.05 }
}
```

- [ ] **Step 4: Rewrite the initial-fit effect to call `fitView`**

Replace the body of the existing fit `useEffect` (lines ~39-48) with:

```ts
  useEffect(() => {
    if (!events.length || !containerRef.current || ready) return
    const { scale: s, offsetAbs: o } = fitView(events, containerRef.current.clientWidth, displayCal)
    setScale(s)
    setOffsetAbs(o)
    setReady(true)
  }, [events, ready, displayCal])
```

- [ ] **Step 5: Run tests and lint/build**

Run: `npm run test:run -- src/components/TimelineHorizontal.test.ts`
Expected: PASS (3 tests).
Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/TimelineHorizontal.tsx src/components/TimelineHorizontal.test.ts
git commit -m "refactor: extract fitView helper from TimelineHorizontal (#92)"
```

---

### Task 2: Extract and test `visibleYearRange`

A pure helper that maps the current viewport to in-world years, for the readout in Task 3.

**Files:**
- Modify: `src/components/TimelineHorizontal.tsx`
- Modify: `src/components/TimelineHorizontal.test.ts`

**Interfaces:**
- Consumes: `absoluteToDate` from `../calendar`.
- Produces: `export function visibleYearRange(offsetAbs: number, scale: number, viewWidth: number, displayCal: Calendar): { startYear: number; endYear: number }`
  - `startYear` = year at the left edge (`offsetAbs`), `endYear` = year at the right edge (`offsetAbs + viewWidth / scale`).

- [ ] **Step 1: Write the failing test**

Append to `src/components/TimelineHorizontal.test.ts`. Add `visibleYearRange` to the import from `./TimelineHorizontal`, then:

```ts
describe('visibleYearRange', () => {
  const cal = makeCalendar() // 60-day year, anchor 0

  it('maps a viewport spanning ~2 years to start/end years', () => {
    // left edge at absolute 0 (year 0), width/scale = 120 abs days (2 years)
    const r = visibleYearRange(0, 1, 120, cal)
    expect(r.startYear).toBe(0)
    expect(r.endYear).toBe(2)
  })

  it('keeps startYear <= endYear', () => {
    const r = visibleYearRange(0, 1, 120, cal)
    expect(r.startYear).toBeLessThanOrEqual(r.endYear)
  })

  it('yields equal start/end for a sub-year viewport', () => {
    // 30 abs days < one 60-day year, both edges in year 0
    const r = visibleYearRange(0, 1, 30, cal)
    expect(r.startYear).toBe(0)
    expect(r.endYear).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/TimelineHorizontal.test.ts`
Expected: FAIL — `visibleYearRange` is not defined.

- [ ] **Step 3: Add the helper**

In `src/components/TimelineHorizontal.tsx`, add `absoluteToDate` to the existing import from `../calendar`, then add at module scope:

```ts
export function visibleYearRange(
  offsetAbs: number,
  scale: number,
  viewWidth: number,
  displayCal: Calendar,
): { startYear: number; endYear: number } {
  const startYear = absoluteToDate(displayCal, offsetAbs).year
  const endYear = absoluteToDate(displayCal, offsetAbs + viewWidth / scale).year
  return { startYear, endYear }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:run -- src/components/TimelineHorizontal.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/components/TimelineHorizontal.tsx src/components/TimelineHorizontal.test.ts
git commit -m "refactor: add visibleYearRange helper to TimelineHorizontal (#92)"
```

---

### Task 3: Add navigation controls (zoom buttons, Fit all, readout)

Add a `zoomAt` helper shared by the wheel handler and the new +/− buttons, then render the floating control cluster and wire it up.

**Files:**
- Modify: `src/components/TimelineHorizontal.tsx`

**Interfaces:**
- Consumes: `fitView`, `visibleYearRange` (Tasks 1-2), `viewWidth`/`scale`/`offsetAbs` state, `displayCal`.
- Produces: nothing for later tasks (UI-only).

- [ ] **Step 1: Extract a `zoomAt` helper and use it in `handleWheel`**

Replace `handleWheel` (lines ~61-72) with a shared helper plus a thin wheel wrapper:

```ts
  function zoomAt(factor: number, cursorX: number) {
    const cursorAbs = offsetAbs + cursorX / scale
    setScale((s) => {
      const ns = Math.max(1e-6, Math.min(1, s * factor))
      setOffsetAbs(cursorAbs - cursorX / ns)
      return ns
    })
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.2 : 0.833
    const rect = containerRef.current?.getBoundingClientRect()
    const cursorX = rect ? e.clientX - rect.left : 0
    zoomAt(factor, cursorX)
  }
```

- [ ] **Step 2: Extend the pan guard to skip controls**

In `handlePointerDown` (line ~76), change the early-return guard so clicking a control never starts a drag:

```ts
    if ((e.target as HTMLElement).closest('.horiz-event, .horiz-controls')) return
```

- [ ] **Step 3: Add a Fit-all handler**

Add near the other handlers:

```ts
  function handleFitAll() {
    if (!containerRef.current) return
    const { scale: s, offsetAbs: o } = fitView(events, containerRef.current.clientWidth, displayCal)
    setScale(s)
    setOffsetAbs(o)
  }
```

- [ ] **Step 4: Render the control cluster**

Just before the existing `<div className="horiz-hint">…</div>` (line ~223), insert:

```tsx
      <div className="horiz-controls">
        <button className="horiz-ctl-btn" onClick={() => zoomAt(0.833, viewWidth / 2)} title="Zoom out" aria-label="Zoom out">−</button>
        <button className="horiz-ctl-btn" onClick={() => zoomAt(1.2, viewWidth / 2)} title="Zoom in" aria-label="Zoom in">+</button>
        <button className="horiz-ctl-btn horiz-ctl-fit" onClick={handleFitAll} title="Fit all events">⤢ Fit all</button>
        {displayCal && scale > 0 && (() => {
          const { startYear, endYear } = visibleYearRange(offsetAbs, scale, viewWidth, displayCal)
          return (
            <span className="horiz-ctl-readout">
              {startYear === endYear ? `Year ${startYear}` : `Years ${startYear}–${endYear}`}
            </span>
          )
        })()}
      </div>
```

- [ ] **Step 5: Verify in the dev server (manual)**

Run: `npm run dev`, open the Timeline → Axis view. Confirm: +/− zoom around center, "Fit all" frames every event, the readout updates while panning, and clicking the buttons does not pan the canvas. Stop the server.

- [ ] **Step 6: Lint, build, test, commit**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all clean.

```bash
git add src/components/TimelineHorizontal.tsx
git commit -m "feat: zoom/fit/readout controls for timeline axis view (#92)"
```

---

### Task 4: Typographic scale, roomier layout, simpler ticks

Bump the size constants, lower the label-visibility thresholds, simplify tick labels to the bare year, and update the CSS.

**Files:**
- Modify: `src/components/TimelineHorizontal.tsx` (constants, tick loop, visibility thresholds)
- Modify: `src/index.css` (`.horiz-*` block ~1712-1759)

**Interfaces:** none (presentational).

- [ ] **Step 1: Bump layout constants**

In `TimelineHorizontal.tsx`, change the three constants (lines ~13-15):

```ts
const LANE_H = 40
const HEADER_H = 56
const LANE_GAP = 6
```

- [ ] **Step 2: Simplify the tick label**

In the tick loop (lines ~127-137), drop the `eraForYear` lookup and the parenthetical. Replace the loop body's push with:

```ts
      for (let yr = Math.ceil(startYear / step) * step; yr <= endYear; yr += step) {
        const abs = dateToAbsolute(displayCal, yr, 0, 1)
        const x = (abs - offsetAbs) * scale
        if (x >= 0 && x <= viewWidth) {
          tickYears.push({
            abs,
            label: `${yr}`,
            major: eraStartYears.has(yr),
          })
        }
      }
```

Then remove the now-unused `eraForYear` import on line 2 (keep `dateToAbsolute`, `yearLength`). Verify `eraForYear` is not used elsewhere in the file before removing.

- [ ] **Step 3: Lower the event icon/label width thresholds**

In the `laid.map` render (lines ~213-218), change the two width gates:

```tsx
            {w > 32 && event.icon && (
              <span className="horiz-event-icon">{event.icon}</span>
            )}
            {w > 44 && (
              <span className="horiz-event-label">{event.title}</span>
            )}
```

- [ ] **Step 4: Update the CSS**

In `src/index.css`, edit the `.horiz-*` rules:

```css
.horiz-era-label {
  position: sticky; left: 8px; top: 6px; display: inline-block;
  font-family: var(--display); font-size: 11px; color: var(--ink-faint);
  letter-spacing: 1.2px; text-transform: uppercase;
  opacity: 0.45; pointer-events: none;
}
```

```css
.horiz-tick-label {
  font-size: 12px; color: var(--ink-faint); white-space: nowrap;
  position: absolute; top: 50%; transform: translateY(-50%);
  font-family: var(--display); letter-spacing: 0.4px;
}
.horiz-tick-label-major { color: rgba(201,162,75,0.8); font-size: 13px; font-weight: 600; }
```

```css
.horiz-event {
  border-radius: 6px; cursor: pointer; overflow: hidden;
  display: flex; align-items: center; padding: 0 8px; gap: 4px;
  transition: filter 0.1s; font-size: 13px; font-weight: 600; color: #1c160a;
  border-top: 1px solid rgba(255,255,255,0.18);
}
.horiz-event:hover { filter: brightness(1.15); }
.horiz-event-icon { font-size: 15px; line-height: 1; flex-shrink: 0; }
```

- [ ] **Step 5: Add control-cluster CSS**

Add to the `.horiz-*` block (after `.horiz-hint`):

```css
.horiz-controls {
  position: absolute; top: 8px; left: 12px; z-index: 3;
  display: flex; align-items: center; gap: 6px;
  pointer-events: auto;
}
.horiz-ctl-btn {
  font-family: var(--display); font-size: 13px; line-height: 1;
  color: var(--ink); background: var(--bg-2);
  border: 1px solid var(--border); border-radius: 5px;
  padding: 4px 9px; cursor: pointer;
}
.horiz-ctl-btn:hover { background: var(--bg); border-color: #5a4e35; }
.horiz-ctl-fit { letter-spacing: 0.3px; }
.horiz-ctl-readout {
  font-family: var(--display); font-size: 12px; color: var(--ink-faint);
  margin-left: 4px; white-space: nowrap;
}
```

- [ ] **Step 6: Manual check, then lint/build/test**

Run: `npm run dev`, open Timeline → Axis. Confirm: type is clearly larger, lanes are taller, ticks read as bare years with era-start years gold/bold, era name still shows in the band, short event bars still show labels sooner. Stop the server.

Run: `npm run lint && npm run build && npm run test:run`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/TimelineHorizontal.tsx src/index.css
git commit -m "feat: larger type, roomier lanes, simpler ticks for axis view (#92)"
```

---

### Task 5: Open the PR

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --title "Timeline axis-view readability pass (#92)" \
  --body "Closes #92. Bigger type, roomier lanes, simplified year ticks, and lightweight zoom/fit/year-range controls in the axis view. Adds pure fitView/visibleYearRange helpers with unit tests."
```

- [ ] **Step 2: Add the version label**

```bash
gh pr edit --add-label version:minor
```

- [ ] **Step 3: Confirm CI is green** (lint + build + test). If checks don't start, suspect a transient GitHub delivery incident (check githubstatus.com); an empty-commit push re-triggers.

---

## Notes for the implementer

- This work is on branch `feat/preview-before-edit` per the starting state — **create a fresh branch off `main` first** (`git checkout main && git pull && git checkout -b feat/timeline-axis-readability`) so the PR is scoped to issue #92 only.
- The `makeEvent` factory in Task 1 includes every required `TimelineEvent` field (`id, calendarId, title, description, category, pageId, startYear, startMonth, startDay, startAbsolute, endAbsolute?, createdAt, updatedAt`), verified against `src/db/types.ts`. Only `startAbsolute`/`endAbsolute` carry meaning for the helpers; the rest are filler to satisfy `strict`.
- `var(--display)`, `var(--bg)`, `var(--bg-2)`, `var(--border)`, `var(--ink)`, `var(--ink-faint)` are existing CSS variables used throughout `index.css`.
