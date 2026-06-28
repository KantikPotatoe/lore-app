# Timeline axis-view readability pass

Issue #92 (Roadmap #25). The axis view (`TimelineHorizontal`) is too small and hard
to navigate: tiny type, cramped lanes, and scroll/drag as the only way to move. This
pass improves the typographic scale, opens up the layout, and adds lightweight
navigation controls. No data-model or route changes — all work is confined to
`src/components/TimelineHorizontal.tsx` and its CSS block in `src/index.css`.

## Goals

1. **Bigger, clearer type** for ticks, event labels, and era labels.
2. **Roomier layout** — taller lanes, more spacing, labels visible at smaller bar widths.
3. **Lightweight navigation** — zoom +/− buttons, a "Fit all" reset, and a live
   year-range readout. No minimap.

Non-goals: keyboard navigation, minimap/overview strip, vertical-view changes,
calendar/event data changes.

## 1. Typographic scale & layout

Constants in `TimelineHorizontal.tsx`:

| Constant | Now | New |
|---|---|---|
| `LANE_H` | 30 | **40** |
| `LANE_GAP` | 4 | **6** |
| `HEADER_H` | 48 | **56** |

CSS (`index.css`, `.horiz-*` block):

| Element | Now | New |
|---|---|---|
| `.horiz-event` font-size | 11px | **13px** |
| `.horiz-event` padding | `0 6px` | `0 8px` |
| `.horiz-event-icon` font-size | 13px | **15px** |
| `.horiz-tick-label` font-size | 10px | **12px** |
| `.horiz-tick-label-major` | (color only) | + **13px, font-weight 600** |
| `.horiz-era-label` font-size | 10px | **11px** |

Event-label/icon visibility thresholds (in render):

- Show icon: `w > 40` → **`w > 32`**
- Show label: `w > 50` → **`w > 44`**

### Tick label simplification

Tick labels currently read `Year 1204 (Era Name)`. The era name is already rendered
in the era band behind the ticks, so it is redundant and consumes horizontal space.
Simplify the tick label to the bare year number, e.g. `1204`. Era-start years remain
visually distinguished as **major ticks** (gold, bold, larger) — that styling already
exists; we keep it. This drops the `eraForYear` lookup inside the tick loop.

The `major` flag stays driven by `eraStartYears.has(yr)`.

## 2. Navigation controls

A floating control cluster anchored top-left of the canvas, mirroring the existing
bottom-right `.horiz-hint`. Markup (new `.horiz-controls` container, `pointer-events:
auto`, `z-index` above the header):

```
[ − ] [ + ]  [ ⤢ Fit all ]   Years 1204–1389
```

- **− / +** buttons: zoom out/in by the same factor the wheel uses (`1.2` / `0.833`),
  anchored to the **viewport center** (`cursorX = viewWidth / 2`). Reuse the existing
  zoom math from `handleWheel` by extracting a `zoomAt(factor, cursorX)` helper that
  both the wheel handler and the buttons call.
- **⤢ Fit all** button: recompute `scale` and `offsetAbs` to frame all events, using
  the extracted `fitView()` helper (same math as today's initial-fit effect).
- **Year-range readout**: a live `Years {start}–{end}` label from `visibleYearRange()`.
  When there is a single year in view, render just `Year {start}`.

### Pan guard

`handlePointerDown` currently skips starting a drag only when the target is inside
`.horiz-event`. Extend the guard to also skip `.horiz-controls`, so clicking a button
never begins a pan.

## 3. Extracted pure helpers (testability)

happy-dom can't exercise wheel/drag, so the navigation math moves into pure functions
that are unit-tested directly. Place them at module scope in `TimelineHorizontal.tsx`
(no new file needed; they're small and local):

```ts
// Frame all events within `width` px. Mirrors the current initial-fit effect.
export function fitView(
  events: TimelineEvent[],
  width: number,
  displayCal: Calendar | null,
): { scale: number; offsetAbs: number }

// Map the current viewport to in-world years for the readout.
export function visibleYearRange(
  offsetAbs: number,
  scale: number,
  viewWidth: number,
  displayCal: Calendar,
): { startYear: number; endYear: number }
```

`fitView` returns the same `scale`/`offsetAbs` the existing effect computes (range =
`max(maxAbs - minAbs, yearLength*10 or 3650)`, width padding `-80`, offset
`minAbs - range*0.05`). The initial-fit `useEffect` is rewritten to call `fitView`, and
the **Fit all** button calls it too, so initial framing and reset share one code path.

`visibleYearRange` converts `offsetAbs` and `offsetAbs + viewWidth/scale` to years via
`absoluteToDate(displayCal, abs).year` (from `src/calendar.ts`).

## Testing

New `TimelineHorizontal.test.ts` (or extend an existing timeline test file) covering
the pure helpers:

- `fitView`: empty events → safe default; single event → centered, non-zero scale;
  multi-event span → all events fall within `[0, width]` at the returned scale/offset.
- `visibleYearRange`: known offset/scale yields expected start/end years; start ≤ end;
  single-year viewport yields `startYear === endYear`.

Run `npm run lint`, `npm run build`, `npm run test:run` before claiming done (CI gate).

## PR

Label `version:minor` (a user-facing enhancement).
