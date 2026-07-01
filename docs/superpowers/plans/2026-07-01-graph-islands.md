# Graph Islands (Connected-Components) Colour Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Island" Color-by mode to the relationship graph that paints each connected component of the visible graph in its own distinct colour, so disconnected sub-regions are obvious at a glance.

**Architecture:** A pure `connectedComponents()` in the data layer (`src/db/graph.ts`) groups the visible nodes into size-ranked components. `src/graphColor.ts` maps those ranks to a palette (`islandColorOf`) and `nodeFill` gains an optional island-colour lookup. `GraphRoute` computes the map from the already-filtered graph (only in island mode) and threads it into the 2D and 3D renderers. `colorBy` persistence already covers the new value for free.

**Tech Stack:** TypeScript (strict), React, Vitest + happy-dom, Dexie (unaffected here), react-force-graph 2D/3D.

## Global Constraints

- TypeScript `strict` — no `any`, all new exports fully typed.
- **No literal `Date.now()` / `Math.random()` in render or in pure helpers** (react-hooks/purity lint rule) — `connectedComponents` must be deterministic via id-based tie-break, not randomness.
- Always import shared API from `'../db'` (the barrel); **re-export any new public `db/` API from `src/db/index.ts`** or `barrel.test.ts` fails.
- Run `npm run lint`, `npm run build`, and `npm run test:run` before claiming done (CI runs all three).
- Tests are Vitest (`*.test.ts`), happy-dom environment by default.

---

### Task 1: `connectedComponents` in the data layer

**Files:**
- Modify: `src/db/graph.ts` (add function + export at end of file, after `nodesWithinHops`)
- Modify: `src/db/index.ts` (re-export `connectedComponents`)
- Test: `src/db/graph.test.ts` (add a `describe('connectedComponents', …)` block)

**Interfaces:**
- Consumes: existing `GraphLink` type from `src/db/graph.ts` (`{ source: string; target: string; mutual: boolean }`).
- Produces:
  ```ts
  export function connectedComponents(
    nodeIds: string[],
    links: Pick<GraphLink, 'source' | 'target'>[],
  ): { componentOf: Map<string, number>; sizes: number[] }
  ```
  `componentOf` maps each node id → its component rank (0 = largest component). `sizes[rank]` = that component's node count. Components ranked by size descending; ties broken by the component's smallest node id (ascending string compare). Link endpoints not in `nodeIds` are ignored.

- [ ] **Step 1: Write the failing tests**

Add to `src/db/graph.test.ts` (keep existing imports; extend the import from `./graph` to include `connectedComponents`):

```ts
describe('connectedComponents', () => {
  it('groups two disjoint clusters plus a singleton', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const links = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'd', target: 'e' },
    ]
    const { componentOf, sizes } = connectedComponents(ids, links)
    // Largest component (a,b,c) ranks 0; (d,e) ranks 1; nothing left over here.
    expect(componentOf.get('a')).toBe(0)
    expect(componentOf.get('b')).toBe(0)
    expect(componentOf.get('c')).toBe(0)
    expect(componentOf.get('d')).toBe(1)
    expect(componentOf.get('e')).toBe(1)
    expect(sizes).toEqual([3, 2])
  })

  it('ranks a lone node as its own component after the clusters', () => {
    const { componentOf, sizes } = connectedComponents(
      ['x', 'a', 'b'],
      [{ source: 'a', target: 'b' }],
    )
    expect(componentOf.get('a')).toBe(0)
    expect(componentOf.get('b')).toBe(0)
    expect(componentOf.get('x')).toBe(1)
    expect(sizes).toEqual([2, 1])
  })

  it('breaks equal-size ties by smallest node id', () => {
    // Two size-2 components: {m,n} and {c,d}. {c,d} has the smaller min id → rank 0.
    const { componentOf } = connectedComponents(
      ['m', 'n', 'c', 'd'],
      [{ source: 'm', target: 'n' }, { source: 'c', target: 'd' }],
    )
    expect(componentOf.get('c')).toBe(0)
    expect(componentOf.get('d')).toBe(0)
    expect(componentOf.get('m')).toBe(1)
    expect(componentOf.get('n')).toBe(1)
  })

  it('treats links as undirected and lets a shared node bridge two chains', () => {
    const { sizes } = connectedComponents(
      ['a', 'b', 'g', 'c'],
      // a→g and c→g (g is e.g. a ghost id both link to): all one component.
      [{ source: 'a', target: 'g' }, { source: 'c', target: 'g' }, { source: 'a', target: 'b' }],
    )
    expect(sizes).toEqual([4])
  })

  it('ignores link endpoints not present in nodeIds', () => {
    const { componentOf, sizes } = connectedComponents(
      ['a'],
      [{ source: 'a', target: 'missing' }],
    )
    expect(componentOf.get('a')).toBe(0)
    expect(componentOf.has('missing')).toBe(false)
    expect(sizes).toEqual([1])
  })

  it('returns empty results for no nodes', () => {
    const { componentOf, sizes } = connectedComponents([], [])
    expect(componentOf.size).toBe(0)
    expect(sizes).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/db/graph.test.ts`
Expected: FAIL — `connectedComponents is not a function` / not exported.

- [ ] **Step 3: Implement `connectedComponents`**

Append to `src/db/graph.ts` (after `nodesWithinHops`):

```ts
/** Partition the given node ids into connected components, treating links as
 *  undirected. Returns `componentOf` (node id → component rank) and `sizes`
 *  (rank → node count). Components are ranked by size descending; equal-size
 *  components are ordered by their smallest member id (ascending), so the result
 *  is deterministic — no dependence on iteration order or randomness. Link
 *  endpoints absent from `nodeIds` are ignored, so callers can pass filtered
 *  links without pre-scrubbing them. Used by the graph's "island" colour mode to
 *  give each disconnected sub-region its own colour. */
export function connectedComponents(
  nodeIds: string[],
  links: Pick<GraphLink, 'source' | 'target'>[],
): { componentOf: Map<string, number>; sizes: number[] } {
  const present = new Set(nodeIds)
  const adj = new Map<string, Set<string>>()
  for (const id of nodeIds) adj.set(id, new Set())
  for (const l of links) {
    if (!present.has(l.source) || !present.has(l.target)) continue
    adj.get(l.source)!.add(l.target)
    adj.get(l.target)!.add(l.source)
  }

  // Flood-fill each unvisited node into a component (list of member ids).
  const seen = new Set<string>()
  const groups: string[][] = []
  for (const start of nodeIds) {
    if (seen.has(start)) continue
    const members: string[] = []
    const stack = [start]
    seen.add(start)
    while (stack.length > 0) {
      const id = stack.pop()!
      members.push(id)
      for (const nb of adj.get(id)!) {
        if (!seen.has(nb)) {
          seen.add(nb)
          stack.push(nb)
        }
      }
    }
    groups.push(members)
  }

  // Rank by size desc, then by smallest member id asc for a stable tie-break.
  const minId = (g: string[]) => g.reduce((m, id) => (id < m ? id : m), g[0])
  groups.sort((a, b) => b.length - a.length || (minId(a) < minId(b) ? -1 : 1))

  const componentOf = new Map<string, number>()
  const sizes: number[] = []
  groups.forEach((g, rank) => {
    sizes.push(g.length)
    for (const id of g) componentOf.set(id, rank)
  })
  return { componentOf, sizes }
}
```

- [ ] **Step 4: Re-export from the barrel**

In `src/db/index.ts`, find the line re-exporting from `./graph` (it exports `buildGraphData`, `nodesWithinHops`, and the graph types) and add `connectedComponents` to that export list. Example (match the existing style — it may be a `export { … } from './graph'` list or `export * from './graph'`; if it's `export *`, no change is needed, but verify `connectedComponents` resolves via `'../db'`):

```ts
export { buildGraphData, nodesWithinHops, connectedComponents } from './graph'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:run -- src/db/graph.test.ts`
Expected: PASS (all `connectedComponents` cases green, existing graph tests still green).

- [ ] **Step 6: Verify barrel + lint**

Run: `npm run test:run -- src/db/barrel.test.ts && npm run lint`
Expected: PASS / no lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/db/graph.ts src/db/index.ts src/db/graph.test.ts
git commit -m "feat: connectedComponents helper for graph island detection (#126)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Island palette + `nodeFill` island mode in `graphColor.ts`

**Files:**
- Modify: `src/graphColor.ts`
- Test: `src/graphColor.test.ts`

**Interfaces:**
- Consumes: `MUTED` (already exported from `src/graphColor.ts`), `GraphNode` (from `../db`).
- Produces:
  - `ColorBy` union now includes `'island'`.
  - `export const ISLAND_PALETTE: string[]` — distinct hues for clusters.
  - `export function islandColorOf(componentOf: Map<string, number>, sizes: number[]): Map<string, string>` — node id → colour: `MUTED` for size-1 components, else `ISLAND_PALETTE[rank % ISLAND_PALETTE.length]`.
  - `nodeFill(node, colorBy, highlightTag, islandColors?: Map<string, string>)` — in `'island'` mode returns `islandColors?.get(node.id) ?? MUTED`.

- [ ] **Step 1: Write the failing tests**

Add to `src/graphColor.test.ts` (extend the import from `./graphColor` to include `ISLAND_PALETTE` and `islandColorOf`):

```ts
describe('nodeFill island mode', () => {
  it('returns the mapped island colour for a clustered node', () => {
    const colors = new Map([['p1', ISLAND_PALETTE[1]]])
    expect(nodeFill(node({ id: 'p1' }), 'island', '', colors)).toBe(ISLAND_PALETTE[1])
  })

  it('mutes a node whose id is not in the island map', () => {
    expect(nodeFill(node({ id: 'p1' }), 'island', '', new Map())).toBe(MUTED)
  })

  it('mutes when no island map is provided', () => {
    expect(nodeFill(node({ id: 'p1' }), 'island', '')).toBe(MUTED)
  })
})

describe('islandColorOf', () => {
  it('assigns palette colours by rank and mutes singletons', () => {
    const componentOf = new Map([
      ['a', 0], ['b', 0], // rank 0, size 3
      ['c', 0],
      ['d', 1], ['e', 1], // rank 1, size 2
      ['x', 2],           // rank 2, size 1 → muted
    ])
    const sizes = [3, 2, 1]
    const colors = islandColorOf(componentOf, sizes)
    expect(colors.get('a')).toBe(ISLAND_PALETTE[0])
    expect(colors.get('d')).toBe(ISLAND_PALETTE[1])
    expect(colors.get('x')).toBe(MUTED)
  })

  it('cycles the palette when there are more clusters than colours', () => {
    const rank = ISLAND_PALETTE.length // one past the end
    const componentOf = new Map([['z', rank]])
    const sizes = new Array(rank + 1).fill(2) // all clusters (size >= 2)
    const colors = islandColorOf(componentOf, sizes)
    expect(colors.get('z')).toBe(ISLAND_PALETTE[rank % ISLAND_PALETTE.length])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/graphColor.test.ts`
Expected: FAIL — `ISLAND_PALETTE`/`islandColorOf` not exported; `nodeFill` ignores 4th arg.

- [ ] **Step 3: Implement palette, `islandColorOf`, and extend `nodeFill`**

Edit `src/graphColor.ts`:

Change the `ColorBy` type:

```ts
/** Which dimension drives a graph node's fill colour. */
export type ColorBy = 'type' | 'status' | 'tag' | 'island'
```

Add the palette after the `MUTED` export:

```ts
// Distinct hues for connected-component ("island") colouring, ordered so the
// first few are the most visually separable. Chosen to read on the #15130f
// canvas; colours cycle when a world has more clusters than entries.
export const ISLAND_PALETTE = [
  '#4fc3d9', // cyan
  '#e0607e', // rose
  '#7bd672', // green
  '#e8a13a', // amber
  '#9b8cf0', // violet
  '#e57ac0', // magenta
  '#d9c04f', // gold
  '#5b9bd9', // blue
  '#7bd6a8', // teal
  '#c98a5a', // clay
]

/** Map each node id to its island colour: MUTED for lone pages (size-1
 *  components) so clusters stand out, otherwise a palette colour keyed by the
 *  component's size rank (0 = largest). */
export function islandColorOf(
  componentOf: Map<string, number>,
  sizes: number[],
): Map<string, string> {
  const colors = new Map<string, string>()
  for (const [id, rank] of componentOf) {
    colors.set(id, sizes[rank] === 1 ? MUTED : ISLAND_PALETTE[rank % ISLAND_PALETTE.length])
  }
  return colors
}
```

Extend `nodeFill`:

```ts
export function nodeFill(
  node: GraphNode,
  colorBy: ColorBy,
  highlightTag: string,
  islandColors?: Map<string, string>,
): string {
  if (colorBy === 'status') return statusColor(node.status)
  if (colorBy === 'tag') {
    return highlightTag !== '' && node.tags.includes(highlightTag) ? TAG_ACCENT : MUTED
  }
  if (colorBy === 'island') return islandColors?.get(node.id) ?? MUTED
  return categoryColor(node.category)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/graphColor.test.ts`
Expected: PASS (new island tests + existing nodeFill tests green).

- [ ] **Step 5: Commit**

```bash
git add src/graphColor.ts src/graphColor.test.ts
git commit -m "feat: island palette and nodeFill island mode (#126)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Thread `islandColors` through the 2D and 3D renderers

**Files:**
- Modify: `src/components/GraphView.tsx`
- Modify: `src/components/GraphView3D.tsx`

**Interfaces:**
- Consumes: `nodeFill(node, colorBy, highlightTag, islandColors?)` from `../graphColor` (Task 2).
- Produces: both components accept a new required prop `islandColors: Map<string, string>`. (Required, not optional — `GraphRoute` always passes it in Task 4, even if empty.)

No new unit tests here (canvas painting isn't unit-tested in this repo); correctness is covered by the pure `nodeFill`/`islandColorOf` tests plus the build/lint gate and manual verification in Task 5. This task is a compile-time wiring change.

- [ ] **Step 1: Add the prop to `GraphView` (2D)**

In `src/components/GraphView.tsx`, add `islandColors` to the destructured props and its type in the function signature:

```ts
export default function GraphView({
  data,
  showArrows,
  colorBy,
  highlightTag,
  islandColors,
  selectedId,
  onSelect,
  onGhostClick,
  onPinNode,
  initialCam,
  onCamChange,
}: {
  data: GraphData
  showArrows: boolean
  colorBy: ColorBy
  highlightTag: string
  islandColors: Map<string, string>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onGhostClick: (title: string) => void
  onPinNode: (id: string, x: number, y: number) => void
  initialCam: GraphCam | null
  onCamChange: (cam: GraphCam) => void
}) {
```

- [ ] **Step 2: Pass `islandColors` into the paint call and its deps (2D)**

In `paintNode`, update the fill line:

```ts
        ctx.fillStyle = nodeFill(node, colorBy, highlightTag, islandColors)
```

And add `islandColors` to the `paintNode` `useCallback` dependency array (currently `[neighbourIds, colorBy, highlightTag]`):

```ts
    [neighbourIds, colorBy, highlightTag, islandColors],
```

- [ ] **Step 3: Add the prop to `GraphView3D` and use it**

In `src/components/GraphView3D.tsx`, add `islandColors` to the destructured props and type:

```ts
export default function GraphView3D({
  data,
  showArrows,
  colorBy,
  highlightTag,
  islandColors,
  onGhostClick,
}: {
  data: GraphData
  showArrows: boolean
  colorBy: ColorBy
  highlightTag: string
  islandColors: Map<string, string>
  onGhostClick: (title: string) => void
}) {
```

Update `nodeColor` and its deps:

```ts
  const nodeColor = useCallback(
    (node: GNode) => (node.ghost ? GHOST_COLOR : nodeFill(node, colorBy, highlightTag, islandColors)),
    [colorBy, highlightTag, islandColors],
  )
```

- [ ] **Step 4: Verify it compiles (expected to fail at the call sites)**

Run: `npm run build`
Expected: FAIL — `GraphRoute.tsx` does not yet pass `islandColors` to `<GraphView>` / `<GraphView3D>`. This is fine; Task 4 fixes the call sites. (If you prefer a green build between tasks, do Task 4 immediately after; they are commit-paired.)

- [ ] **Step 5: Commit**

```bash
git add src/components/GraphView.tsx src/components/GraphView3D.tsx
git commit -m "feat: accept islandColors prop in graph renderers (#126)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Wire island mode into `GraphRoute` (dropdown, colour map, hint)

**Files:**
- Modify: `src/routes/GraphRoute.tsx`

**Interfaces:**
- Consumes: `connectedComponents` (from `../db`, Task 1), `islandColorOf` (from `../graphColor`, Task 2), and the `islandColors` props on `GraphView`/`GraphView3D` (Task 3).
- Produces: user-visible "Island" colour mode. No new exported API.

- [ ] **Step 1: Import the new helpers**

In `src/routes/GraphRoute.tsx`, add `connectedComponents` to the existing `'../db'` import, and `islandColorOf` to the existing `'../graphColor'` import:

```ts
import { db, buildGraphData, categoryColor, statusColor, STATUSES, nodesWithinHops, connectedComponents, createPage, type GraphNode, type LorePage } from '../db'
import { islandColorOf, type ColorBy } from '../graphColor'
```

- [ ] **Step 2: Add a stable empty-map fallback (module scope)**

Near the top of the file, next to `const NO_PAGES: LorePage[] = []`, add:

```ts
const EMPTY_ISLAND_COLORS = new Map<string, string>()
```

- [ ] **Step 3: Compute the island colours + cluster count**

After the `orphans` memo (around line 122), add:

```ts
  // Connected-component colouring for island mode. Computed over the *filtered*
  // graph (what's actually drawn) so it respects ghost/category/tag/degree
  // filters, and only when island mode is active — other modes get a stable
  // empty map so the renderer prop identity doesn't churn.
  const { islandColors, clusterCount } = useMemo(() => {
    if (colorBy !== 'island') return { islandColors: EMPTY_ISLAND_COLORS, clusterCount: 0 }
    const { componentOf, sizes } = connectedComponents(filtered.nodes.map((n) => n.id), filtered.links)
    return {
      islandColors: islandColorOf(componentOf, sizes),
      clusterCount: sizes.filter((s) => s >= 2).length,
    }
  }, [colorBy, filtered])
```

- [ ] **Step 4: Add the dropdown option**

In the Color-by `<select>` (around line 203), add the Island option after Tag:

```tsx
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            <option value="type">Type</option>
            <option value="status">Status</option>
            <option value="tag">Tag</option>
            <option value="island">Island</option>
          </select>
```

- [ ] **Step 5: Pass `islandColors` to both views**

In the `threeD ?` block, add the prop to `<GraphView3D>`:

```tsx
              <GraphView3D
                data={filtered}
                showArrows={showArrows}
                colorBy={colorBy}
                highlightTag={tag}
                islandColors={islandColors}
                onGhostClick={setPendingGhost}
              />
```

And to `<GraphView>`:

```tsx
            <GraphView
              data={filtered}
              showArrows={showArrows}
              colorBy={colorBy}
              highlightTag={tag}
              islandColors={islandColors}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onGhostClick={setPendingGhost}
              onPinNode={pinNode}
              initialCam={cam}
              onCamChange={setCam}
            />
```

- [ ] **Step 6: Add the island count to the hint line**

In the `graph-hint` span (around line 291), add an island clause alongside the existing tag hint:

```tsx
        <span className="graph-hint">
          {filtered.nodes.length} pages · {filtered.links.length} links
          {depth > 0 && !selectedId && ' — select a node to apply depth'}
          {filtered.nodes.length > 300 && ' — filter by type or tag to declutter'}
          {colorBy === 'tag' && tag === '' && ' — select a tag to highlight'}
          {colorBy === 'island' && ` — ${clusterCount} island${clusterCount === 1 ? '' : 's'}`}
        </span>
```

- [ ] **Step 7: Verify build, lint, and full test suite**

Run: `npm run build && npm run lint && npm run test:run`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/routes/GraphRoute.tsx
git commit -m "feat: island colour mode in graph toolbar and views (#126)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the dev server and exercise the feature**

Run: `npm run dev` and open http://localhost:5174/#/graph

Verify:
- The Color-by dropdown now has an **Island** option.
- Selecting **Island** paints each connected cluster a distinct colour; lone pages render grey.
- The hint line shows `— N islands` and N matches the number of multi-page clusters.
- Toggling **Ghosts off** re-splits pages that were only joined through a shared missing page (island count/colours update accordingly).
- Switching to **3D on** keeps the same island colouring.
- Reloading the page preserves Island as the selected mode (persistence via existing `colorBy`).

- [ ] **Step 2: Final gate before wrap-up**

Run: `npm run build && npm run lint && npm run test:run`
Expected: all PASS. (No commit — this task changes no files.)

---

## Self-Review

**Spec coverage:**
- §1 `connectedComponents` (pure, size-ranked, deterministic tie-break, ignores foreign endpoints, barrel export) → Task 1. ✓
- §2 `'island'` in `ColorBy`, `ISLAND_PALETTE`, `islandColorOf`, `nodeFill` 4th arg → Task 2. ✓
- §3 dropdown option, filtered-scope `useMemo` gated on island mode, stable empty map, pass to both views, cluster-count hint → Task 4. ✓
- §4 renderers accept `islandColors` prop + dep arrays → Task 3. ✓
- §5 persistence: no change needed → covered (no task), verified in Task 5 Step 1. ✓
- Ghost behaviour (bridge when shown, split when hidden) → verified in Task 5. ✓
- Testing plan (graph.test.ts + graphColor.test.ts cases) → Tasks 1 & 2. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `connectedComponents` return shape `{ componentOf: Map<string, number>; sizes: number[] }` used identically in Tasks 1, 2 (`islandColorOf` args), and 4. `islandColors: Map<string, string>` consistent across Tasks 2–4. `ColorBy` includes `'island'` before it's used in the `<select>` cast. ✓
