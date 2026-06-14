# Graph: search + focus/ego mode + hubs/orphans panel

**Date:** 2026-06-14
**Status:** Approved (design)
**Area:** `src/routes/GraphRoute.tsx`, `src/components/GraphView.tsx`, `src/index.css`

## Goal

Turn the relationship graph from "a picture of links" into something you actively
navigate. Three features, unified by a single concept, plus tasteful motion:

1. **Node search** — find a page and jump the camera to it.
2. **Focus / ego mode** — isolate a node's 1-hop neighbourhood in place.
3. **Hubs / orphans panel** — surface the most-connected and the disconnected pages.

## Unifying concept: "select a node"

Search results, hubs/orphans panel entries, and a single canvas click all do the **same
thing** — they *select* a node:

- pan + zoom the camera to center it (animated), and
- enter 1-hop focus: the node and its direct neighbours render fully, everything else
  dims to ~0.15 alpha.

Double-click navigates to the page. Clicking empty canvas clears the selection. One
concept, three entry points.

## Feature 1 — Node search (toolbar)

- A search `<input>` in `.graph-toolbar`.
- As the user types, a type-ahead dropdown lists matching page **titles**
  (case-insensitive substring match) from the currently filtered nodes, capped at ~8
  results.
- Selecting a result (click or Enter) **selects** that node (camera glide + focus).
- `Esc` or clearing the field closes the dropdown. Enter with one match selects it.
- State lives in `GraphRoute`; selection drives `GraphView` via a `selectedId` prop and
  an imperative center call on the force-graph ref.

## Feature 2 — Focus / ego mode (canvas)

- `selectedId: string | null` lifted to `GraphRoute` so search and panel can drive it.
- **Single-click** a node → sets `selectedId`. **Double-click** → `navigate('/page/' +
  id)`. `react-force-graph` only fires single clicks, so `onNodeClick` uses a manual
  ~250ms timer: a second click within the window cancels the pending focus and navigates
  instead.
- Focus reuses the existing neighbour-set logic (the current hover `neighbourIds` memo,
  generalised to take an id): non-neighbours dim to ~0.15, neighbour links brighten.
- **Hover still works** on top of focus — hover is the transient version, focus is the
  sticky version. When a node is selected, hover may still highlight; selection persists
  until cleared.
- `onBackgroundClick` clears `selectedId`.

## Feature 3 — Hubs / orphans panel (collapsible, right)

- A docked panel on the **right** edge of `.graph-body`, toggled by a `.ghost-btn` in
  the toolbar. Default **closed**. When open, the canvas shrinks to make room; when
  closed, the graph is full-bleed.
- **Hubs:** top **10** nodes by `degree` (already computed in `buildGraphData`),
  descending, each showing its title and degree count.
- **Orphans:** all nodes with `degree === 0`, with a total count in the section header.
- Both lists are computed from the **filtered** node set, so hiding a category/tag
  updates them live.
- Clicking an entry **selects** that node (camera glide + focus) — identical to search.
  An orphan simply centers with nothing else lit, which is the point (it shows the lone
  dot). The panel does not navigate; double-clicking the canvas node still opens the page.

## Animations

Scope: **camera glide + selection pulse + dim-fade**. All ease-out, ≤600ms, tuned to
read as responsive.

- **Camera glide (built-in).** On select, call `centerAt(x, y, ms)` and `zoom(k, ms)`
  on the force-graph ref with ~450ms duration, so the camera eases to the node instead
  of jumping.
- **Selection pulse (custom).** On select, the chosen node briefly pops — a radius
  scale to ~1.4× that settles back, or an expanding ring — over ~300ms, drawing the eye
  after the camera lands.
- **Dim-fade (custom).** Entering/leaving focus tweens the non-neighbour alpha between
  1 and ~0.15 over ~200ms instead of snapping. Interpolates the existing alpha value in
  `paintNode`.

**Repaint driver.** `react-force-graph` only repaints continuously while the simulation
is warm; after it cools the canvas is static. The pulse and dim-fade therefore run via a
small self-contained `requestAnimationFrame` tween that nudges the graph to repaint for
the animation's duration (e.g. holding an easing value in a ref and calling the ref's
refresh each frame), then stops. The camera glide does not need this — `centerAt`/`zoom`
drive their own repaints.

## Component boundaries

- **`GraphRoute`** owns: filters (existing), `selectedId`, search query + results, panel
  open state, and the derived hubs/orphans lists. It passes `selectedId`,
  `onSelect(id)`, and the imperative-center handle down.
- **`GraphView`** owns: canvas rendering, the focus neighbour-set computation, the
  click/double-click disambiguation, hover, and the animation tweens. It exposes a way
  for the route to trigger camera centering (forwarded ref or callback prop).
- **Panel** can be a small presentational subcomponent (`HubsOrphansPanel`) taking the
  two lists + an `onSelect` callback, to keep `GraphRoute` focused.

## Out of scope (parked in `docs/graph-improvement-ideas.md`)

Adjustable hop depth, persisting view/zoom/filter state, ghost nodes for missing links,
coloring by status/tag, reciprocity styling, islands detection, shortest-path, mini-map,
multi-tag filtering, status filtering, timeline layout, PNG/SVG export, 3D toggle, heavy
link/particle animations.
