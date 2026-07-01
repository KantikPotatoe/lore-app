# Graph islands (connected-components) colour mode — design

_Issue #126 (Graph & Relationships milestone). Date: 2026-07-01._

## Problem

The relationship graph can't tell you when part of your world is entirely
disconnected from the rest — a cluster of pages that link among themselves but
share no link with the main body (often a sub-region developed in isolation).
These "islands" are invisible in the current force layout, which just floats
them wherever the sim settles.

## Goal

Add an **Island** colour mode: every connected component of the visible graph is
drawn in its own distinct colour, so disconnected sub-regions pop apart at a
glance. It slots into the existing Color-by pipeline (dropdown → `nodeFill` →
2D + 3D renderers → persisted in view prefs) built for type/status/tag colouring.

## Decisions

- **Surfacing:** a new value in the existing Color-by dropdown (not a separate
  panel or isolate interaction). Reuses everything already in place.
- **Lone pages (single-node components):** rendered in the neutral `MUTED` grey,
  not a distinct colour. Only clusters (size ≥ 2) get palette colours — a world
  of 30 unconnected stubs would otherwise become confetti, drowning out the real
  sub-regions. Orphans are already surfaced in the Hubs & Orphans panel.
- **Scope of computation:** components are computed over the **filtered** graph
  (what's currently drawn), not the full graph. This respects the ghost toggle
  and every active filter and keeps the colouring consistent with what the user
  sees — the same way hubs/orphans derive from `filtered`.

## Architecture

### 1. Structure computation — `src/db/graph.ts`

New pure function alongside `nodesWithinHops`:

```ts
export function connectedComponents(
  nodeIds: string[],
  links: Pick<GraphLink, 'source' | 'target'>[],
): { componentOf: Map<string, number>; sizes: number[] }
```

- Treats links as undirected; groups nodes into connected components (BFS/flood
  over an adjacency map, or union-find — either is fine).
- Components are **ranked by size descending** (rank 0 = the largest). Ties are
  broken by the component's smallest node id (string compare), so the output is
  fully deterministic — no `Date.now()`/`Math.random()`, satisfying the
  react-hooks/purity lint rule and making the function trivially testable.
- `componentOf` maps each node id → its component's rank; `sizes[rank]` is that
  component's node count.
- A link endpoint id not present in `nodeIds` is ignored defensively (callers
  pass matching sets, but this keeps the function total).
- Exported through the `db` barrel (`src/db/index.ts`) — `barrel.test.ts`
  enforces re-export of new public API.

### 2. Colour resolution — `src/graphColor.ts`

- Add `'island'` to the `ColorBy` union.
- Add `ISLAND_PALETTE: string[]` — ~10 distinct hues chosen to read on the
  `#15130f` graph canvas.
- Add:

  ```ts
  export function islandColorOf(
    componentOf: Map<string, number>,
    sizes: number[],
  ): Map<string, string>
  ```

  For each `[id, rank]`: `sizes[rank] === 1 ? MUTED : ISLAND_PALETTE[rank % ISLAND_PALETTE.length]`.
  Colours cycle if there are more clusters than palette entries — acceptable, and
  the same behaviour category colours already have.

- Extend `nodeFill`:

  ```ts
  export function nodeFill(
    node: GraphNode,
    colorBy: ColorBy,
    highlightTag: string,
    islandColors?: Map<string, string>,
  ): string
  ```

  In `'island'` mode return `islandColors?.get(node.id) ?? MUTED`. The 4th
  argument is optional, so existing three-argument callers and tests are
  unaffected.

### 3. Wiring — `src/routes/GraphRoute.tsx`

- Add an **Island** `<option>` to the Color-by `<select>`.
- A `useMemo` that builds `islandColors: Map<string, string>` from `filtered`
  nodes + links, **only when `colorBy === 'island'`** (otherwise an empty map, so
  no work in the other modes):

  ```ts
  const islandColors = useMemo(() => {
    if (colorBy !== 'island') return EMPTY_ISLAND_COLORS
    const { componentOf, sizes } = connectedComponents(
      filtered.nodes.map((n) => n.id),
      filtered.links,
    )
    return islandColorOf(componentOf, sizes)
  }, [colorBy, filtered])
  ```

  (`EMPTY_ISLAND_COLORS` is a module-level stable empty `Map` so the prop
  identity doesn't churn in non-island modes.)

- Pass `islandColors` to both `<GraphView>` and `<GraphView3D>`.
- Hint line: when `colorBy === 'island'`, append the cluster count —
  `sizes.filter((s) => s >= 2).length` islands (lone pages excluded, since they
  render muted and appear in the Hubs & Orphans panel). Mirrors the existing
  `colorBy === 'tag'` hint. The count is derived from the same
  `connectedComponents` result (compute once, reuse for both the colour map and
  the hint).

### 4. Renderers — `GraphView.tsx` + `GraphView3D.tsx`

Each gains an `islandColors: Map<string, string>` prop, threaded into its
`nodeFill(...)` call and added to the relevant `useCallback` dependency array
(`paintNode` in 2D, `nodeColor` in 3D). Ghost rendering is untouched: ghosts keep
their dashed muted outline (2D) / `GHOST_COLOR` sphere (3D) and never call
`nodeFill`.

### 5. Persistence — `src/useGraphPrefs.ts`

No change. `colorBy` is already persisted as a string in the saved view;
`'island'` is a valid value for free.

## Ghost behaviour

A ghost node shown on screen bridges the real pages that link to it into one
island — its links are part of `filtered.links`. Hiding ghosts removes those
links from `filtered`, so the pages separate into their own islands. This is the
intuitive "what you see is what's connected" result and needs no special-casing.

## Testing

- `src/db/graph.test.ts` — `connectedComponents`:
  - two disjoint clusters plus a singleton → correct grouping and sizes.
  - ranking is size-descending; deterministic tie-break by smallest id for
    equal-size components.
  - a ghost id bridging two real pages puts them in one component.
  - empty input → empty map / empty sizes.
- `src/graphColor.test.ts`:
  - `nodeFill` island mode returns the palette colour for a clustered node and
    `MUTED` for a singleton / when the map lacks the id.
  - `islandColorOf` maps rank→palette by size and rank 0 = first palette entry;
    size-1 components map to `MUTED`.

## Out of scope

- No islands list/panel or click-to-isolate interaction (that was approach B; we
  chose the colour mode).
- No change to the force layout to physically separate islands.
- No export/legend UI for island colours (they're positional, not semantic).
