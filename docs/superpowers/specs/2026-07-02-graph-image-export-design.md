# Graph image export (PNG / SVG) — design

**Issue:** #133 — Export the graph as PNG / SVG (Graph & Relationships milestone)
**Date:** 2026-07-02

## Goal

Let the user export the relationship graph as a shareable image — PNG for quick
pasting into notes/docs, SVG for crisp, editable vector output. Fits the
local-first, off-device ethos: the export is generated entirely in-browser and
downloaded, nothing leaves the machine.

## Scope

- **2D graph only.** The 3D WebGL view (`GraphView3D`) is out of scope; the
  Export control is unavailable while 3D mode is on. A future issue can add
  WebGL capture.
- Exports the **current filter state** — whatever nodes/links are visible in
  `GraphRoute.filtered` — fit to frame, **all labels**, **solid dark
  background** (`#15130f`). No per-export options dialog.
- Pins/positions are read as-is from the live simulation; export never reheats,
  moves, or re-fits the live graph.

## Architecture — one scene, two renderers

A new pure module **`src/graphExport.ts`** builds an intermediate **scene** from
the already-positioned filtered graph, then renders that scene to either format.
Both outputs derive from the *same* scene, so PNG and SVG are equivalent.

```
GraphRoute.filtered (nodes carry x/y, populated in place by the sim)
        │  + colorBy, highlightTag, islandColors
        ▼
buildScene()  ──►  { viewBox, background, nodes[], links[] }
        │
        ├──► sceneToSvg(scene)   → string        (Blob "image/svg+xml")
        └──► sceneToPng(scene)   → Promise<Blob>  (offscreen canvas → toBlob)
```

### Scene model

`buildScene(data, { colorBy, highlightTag, islandColors })` returns a plain,
serialisable description:

- **viewBox / bounds**: bounding box over all visible nodes, padded (enough for
  the largest node radius + its label), giving `{ minX, minY, width, height }`.
- **background**: `#15130f`.
- **nodes[]**: `{ x, y, r, fill | ghost, title, labelColor }` where
  - `r = radiusFor(degree)` (shared geometry, below),
  - non-ghost `fill = nodeFill(node, colorBy, highlightTag, islandColors)`
    (reused directly from `src/graphColor.ts` — already pure),
  - ghosts carry no fill and render as a dashed `#8a8270` stroke (matching the
    live "page doesn't exist yet" marker),
  - every node gets a label (`#e9e1d2`, ghosts `#8a8270`).
- **links[]**: `{ x1, y1, x2, y2, color, width }` using the same **rest-state**
  styling as the live view (`GraphView.linkColor` / `linkWidth`): mutual (A↔B)
  links read thicker and bluer (`rgba(150,180,255,0.5)`, width 2.5), one-way
  links greyer/thinner (`rgba(160,160,160,0.28)`, width 1). No focus/dim state
  is applied — a static export has no hover/selection.

Nodes lacking `x`/`y` (sim not yet settled) are **skipped**; a link to a skipped
node is dropped. If **no** node has coordinates, `buildScene` returns a sentinel
(`null` / empty flag) so callers can no-op with a message instead of emitting an
empty image.

### Renderers

- **`sceneToSvg(scene): string`** — emits `<svg viewBox="...">` with a
  background `<rect>`, one `<line>` per link, one `<circle>` per node (ghosts as
  dashed-stroke circles with no fill), one `<text>` per label. Title text is
  XML-escaped. Returned as a string; the caller wraps it in a
  `Blob(['...'], { type: 'image/svg+xml' })`.
- **`sceneToPng(scene): Promise<Blob>`** — creates an offscreen `<canvas>` sized
  to the viewBox at ~2× device scale (retina-crisp), paints background → links →
  nodes → labels with the same coordinates, and resolves `canvas.toBlob(...,
  'image/png')`. Rejects (caught by caller) if `toBlob` yields null.

### Shared geometry — `src/graphGeometry.ts`

Extract `MIN_RADIUS`, `MAX_RADIUS`, and `radiusFor(degree)` out of
`GraphView.tsx` into a new `src/graphGeometry.ts`. `GraphView` and `graphExport`
both import from it, so node sizing has one source of truth. Pure refactor — no
behaviour change to the live renderer.

## UI & download

- A single **`⬇ Export`** button in the graph toolbar (near "Hubs & orphans"),
  opening a small inline menu with two choices: **PNG** and **SVG**.
- Selecting a format builds the scene, produces a Blob, and triggers a download
  via an object-URL `<a>` — the same idiom as `src/backup.ts`'s
  `downloadBackup` (create URL → click → revoke).
- **Filename:** `graph-<loreName>-<yyyy-mm-dd>.png` / `.svg`. Lore name is
  slugified; date via the existing date helper (no literal `new Date()` in
  render — see repo lint rule).
- The button is **hidden/disabled** when there are **0 visible nodes** and when
  **3D mode is on**.
- No new persisted prefs — export is a one-shot action.

## Error handling

Export is best-effort and must never crash the graph:

- **Sim not settled** (no node coordinates yet): no-op, with a brief inline
  "Graph still settling — try again" note in the menu instead of an empty image.
- **`canvas.toBlob` failure / download error**: caught and surfaced as a small
  inline message in the menu; no unhandled rejection escapes.

## Testing (Vitest + happy-dom)

- **`graphGeometry.test.ts`** — `radiusFor` honours the min floor and max clamp.
- **`graphExport.test.ts`** — the pure core:
  - `buildScene` computes a correct padded bounding box; colours map via
    `nodeFill` across type/status/tag/island; ghosts get stroke-not-fill; every
    node yields a label; mutual vs one-way link styling is applied.
  - Nodes missing coordinates are skipped (and their links dropped); the
    all-missing case returns the no-op sentinel.
  - `sceneToSvg` output contains the expected count of `<circle>` / `<line>` /
    `<text>`, a `viewBox` matching the bbox, and a dashed stroke for ghosts;
    title text is XML-escaped.
  - `sceneToPng` resolves to a non-empty `image/png` Blob (guard/skip this one
    assertion if happy-dom's canvas can't produce a blob).

The real logic lives in the pure, well-tested `buildScene` / `sceneToSvg`; the
DOM/canvas/download glue stays thin.

## Out of scope / future

- 3D (WebGL) capture.
- Export options dialog (custom background, label toggle, viewport-only export,
  resolution/scale picker).
- Copy-to-clipboard as an alternative to download.
