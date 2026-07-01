# Color Graph Nodes by Type/Status/Tag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Color by" control to the relationship graph that recolors nodes by page type (default), status, or a highlighted tag, persisting the choice and applying in both 2D and 3D views.

**Architecture:** A new pure helper `src/graphColor.ts` maps a node + color mode → fill color. Both `GraphView` (2D) and `GraphView3D` call it in place of `categoryColor(...)`; ghost rendering is untouched. The active mode is a new `colorBy` field on the persisted graph view prefs. In `GraphRoute`, a `<select>` sets the mode and — in tag mode — the existing tag dropdown drives a highlight instead of filtering.

**Tech Stack:** React + TypeScript (strict), Vite, Dexie (IndexedDB via meta store), Vitest + happy-dom + fake-indexeddb, react-force-graph-2d / -3d.

## Global Constraints

- TypeScript `strict` — no `any`, no unused imports (build fails otherwise).
- Always import shared API from the `../db` barrel; **new module `graphColor.ts` is a UI helper, not db public API — do NOT add it to the db barrel** (`barrel.test.ts` only governs `src/db`).
- Run `npm run lint`, `npm run build`, and `npm run test:run` before claiming done — all three must pass (CI runs them).
- Port pinned to 5174; do not change it.
- Actual page statuses are **Stub / Draft / Complete** (`STATUSES` in `src/db/schema.ts`); "WIP" is retired. Do not reference "WIP".
- Existing color helpers (import from `../db`): `categoryColor(name)` and `statusColor(name)`, both return a color string synchronously.

---

### Task 1: Pure `nodeFill` color helper

**Files:**
- Create: `src/graphColor.ts`
- Test: `src/graphColor.test.ts`

**Interfaces:**
- Consumes: `categoryColor`, `statusColor`, `GraphNode` from `../db`.
- Produces:
  - `type ColorBy = 'type' | 'status' | 'tag'`
  - `const TAG_ACCENT: string` (`'#4fc3d9'`), `const MUTED: string` (`'#4a463d'`)
  - `function nodeFill(node: GraphNode, colorBy: ColorBy, highlightTag: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/graphColor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nodeFill, TAG_ACCENT, MUTED } from './graphColor'
import { categoryColor, statusColor, type GraphNode } from './db'

function node(overrides: Partial<GraphNode> = {}): GraphNode {
  return { id: 'p1', title: 'Page', category: 'Character', tags: [], status: 'Draft', degree: 0, ...overrides }
}

describe('nodeFill', () => {
  it('colours by category in type mode', () => {
    expect(nodeFill(node({ category: 'Character' }), 'type', '')).toBe(categoryColor('Character'))
  })

  it('colours by status in status mode', () => {
    expect(nodeFill(node({ status: 'Complete' }), 'status', '')).toBe(statusColor('Complete'))
  })

  it('accents a node carrying the highlighted tag', () => {
    expect(nodeFill(node({ tags: ['Faction', 'Magic'] }), 'tag', 'Magic')).toBe(TAG_ACCENT)
  })

  it('mutes a node without the highlighted tag', () => {
    expect(nodeFill(node({ tags: ['Faction'] }), 'tag', 'Magic')).toBe(MUTED)
  })

  it('mutes every node when no tag is chosen in tag mode', () => {
    expect(nodeFill(node({ tags: ['Faction'] }), 'tag', '')).toBe(MUTED)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/graphColor.test.ts`
Expected: FAIL — cannot resolve `./graphColor` / `nodeFill is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/graphColor.ts`:

```ts
import { categoryColor, statusColor, type GraphNode } from './db'

/** Which dimension drives a graph node's fill colour. */
export type ColorBy = 'type' | 'status' | 'tag'

// Accent for nodes carrying the highlighted tag; muted grey for the rest (and
// for tag mode with no tag chosen). Both read against the #15130f graph canvas.
export const TAG_ACCENT = '#4fc3d9'
export const MUTED = '#4a463d'

/** Fill colour for a NON-ghost graph node under the active colour mode. Ghost
 *  nodes keep their own dashed/muted rendering in the callers, so this is only
 *  ever called for real pages. */
export function nodeFill(node: GraphNode, colorBy: ColorBy, highlightTag: string): string {
  if (colorBy === 'status') return statusColor(node.status)
  if (colorBy === 'tag') {
    return highlightTag !== '' && node.tags.includes(highlightTag) ? TAG_ACCENT : MUTED
  }
  return categoryColor(node.category)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/graphColor.test.ts`
Expected: PASS — 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/graphColor.ts src/graphColor.test.ts
git commit -m "feat: nodeFill helper for graph node colour modes (#121)"
```

---

### Task 2: Persist the `colorBy` mode in graph prefs

**Files:**
- Modify: `src/useGraphPrefs.ts`
- Test: `src/useGraphPrefs.test.ts`

**Interfaces:**
- Consumes: `ColorBy` from `./graphColor` (Task 1).
- Produces (added to `GraphPrefs`): `colorBy: ColorBy`, `setColorBy: (v: ColorBy) => void`. Default `'type'`. Persisted in the `graph-view` meta row alongside the other view fields.

- [ ] **Step 1: Write the failing tests**

In `src/useGraphPrefs.test.ts`, add an assertion to the existing `'uses defaults when no meta row exists'` test (after the `depth` assertion, ~line 24):

```ts
    expect(result.current.colorBy).toBe('type')
```

Then add a new test after the `'persists the selected tag to meta'` test:

```ts
  it('persists the colour-by mode to meta', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.setColorBy('status'))
    await waitFor(() => expect(result.current.colorBy).toBe('status'))
    const v = await getMeta<{ colorBy: string }>('graph-view')
    expect(v?.colorBy).toBe('status')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/useGraphPrefs.test.ts`
Expected: FAIL — `colorBy` is `undefined` / `setColorBy is not a function`.

- [ ] **Step 3: Implement the pref**

In `src/useGraphPrefs.ts`:

Add the import near the top (after the existing imports):

```ts
import type { ColorBy } from './graphColor'
```

In the `SavedView` interface, add the field (after `depth`):

```ts
  /** Which dimension drives node colour: page type, status, or a highlighted tag. */
  colorBy: ColorBy
```

In `DEFAULT_VIEW`, add (after `depth: 0,`):

```ts
  colorBy: 'type',
```

In the `GraphPrefs` interface, add (after the `depth`/`setDepth` pair):

```ts
  colorBy: ColorBy
  setColorBy: (v: ColorBy) => void
```

Add the setter alongside the other `setX` callbacks (e.g. after `setDepth`):

```ts
  const setColorBy = useCallback((v: ColorBy) => writeView({ ...view, colorBy: v }), [view, writeView])
```

In the returned object, add (after the `depth: view.depth, setDepth,` line):

```ts
    colorBy: view.colorBy, setColorBy,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/useGraphPrefs.test.ts`
Expected: PASS — including the new mode test and the updated defaults test. (The existing `'backfills tag/cam defaults for older view rows'` test still passes because `view` is built as `{ ...DEFAULT_VIEW, ...savedView }`, so an old row without `colorBy` hydrates to `'type'`.)

- [ ] **Step 5: Commit**

```bash
git add src/useGraphPrefs.ts src/useGraphPrefs.test.ts
git commit -m "feat: persist graph colour-by mode in view prefs (#121)"
```

---

### Task 3: Apply `nodeFill` in the 2D and 3D graph views

**Files:**
- Modify: `src/components/GraphView.tsx`
- Modify: `src/components/GraphView3D.tsx`

**Interfaces:**
- Consumes: `nodeFill`, `ColorBy` from `../graphColor` (Task 1).
- Produces: both components gain two props — `colorBy: ColorBy` and `highlightTag: string` — consumed by `GraphRoute` in Task 4.

No automated test (canvas/WebGL rendering isn't unit-testable here); correctness is covered by `npm run build` (types) + manual verification in Task 4.

- [ ] **Step 1: Update `GraphView.tsx` (2D)**

Change the import on line 8 from:

```ts
import { categoryColor, type GraphData, type GraphNode, type GraphLink } from '../db'
```

to (drop `categoryColor` — it becomes unused here — and import the helper):

```ts
import { type GraphData, type GraphNode, type GraphLink } from '../db'
import { nodeFill, type ColorBy } from '../graphColor'
```

Add the two props to the component's prop type and destructuring. Change the signature from:

```ts
export default function GraphView({
  data,
  showArrows,
  selectedId,
  onSelect,
  onGhostClick,
  onPinNode,
  initialCam,
  onCamChange,
}: {
  data: GraphData
  showArrows: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onGhostClick: (title: string) => void
  onPinNode: (id: string, x: number, y: number) => void
  initialCam: GraphCam | null
  onCamChange: (cam: GraphCam) => void
}) {
```

to (add `colorBy` and `highlightTag`):

```ts
export default function GraphView({
  data,
  showArrows,
  colorBy,
  highlightTag,
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
  selectedId: string | null
  onSelect: (id: string | null) => void
  onGhostClick: (title: string) => void
  onPinNode: (id: string, x: number, y: number) => void
  initialCam: GraphCam | null
  onCamChange: (cam: GraphCam) => void
}) {
```

In `paintNode`, change the fill line (currently `ctx.fillStyle = categoryColor(node.category)`) to:

```ts
        ctx.fillStyle = nodeFill(node, colorBy, highlightTag)
```

Update the `paintNode` `useCallback` dependency array (currently `[neighbourIds]`) to:

```ts
    [neighbourIds, colorBy, highlightTag],
```

- [ ] **Step 2: Update `GraphView3D.tsx` (3D)**

Change the import on line 7 from:

```ts
import { categoryColor, type GraphData, type GraphNode, type GraphLink } from '../db'
```

to:

```ts
import { type GraphData, type GraphNode, type GraphLink } from '../db'
import { nodeFill, type ColorBy } from '../graphColor'
```

Add the props. Change the signature from:

```ts
export default function GraphView3D({
  data,
  showArrows,
  onGhostClick,
}: {
  data: GraphData
  showArrows: boolean
  onGhostClick: (title: string) => void
}) {
```

to:

```ts
export default function GraphView3D({
  data,
  showArrows,
  colorBy,
  highlightTag,
  onGhostClick,
}: {
  data: GraphData
  showArrows: boolean
  colorBy: ColorBy
  highlightTag: string
  onGhostClick: (title: string) => void
}) {
```

Change the `nodeColor` callback from:

```ts
  const nodeColor = useCallback(
    (node: GNode) => (node.ghost ? GHOST_COLOR : categoryColor(node.category)),
    [],
  )
```

to:

```ts
  const nodeColor = useCallback(
    (node: GNode) => (node.ghost ? GHOST_COLOR : nodeFill(node, colorBy, highlightTag)),
    [colorBy, highlightTag],
  )
```

- [ ] **Step 3: Verify the project builds**

Run: `npm run build`
Expected: PASS (tsc + vite). No "unused `categoryColor`" or missing-prop errors. (`GraphRoute` will report the two missing props on `GraphView`/`GraphView3D` — that is expected and fixed in Task 4. If `npm run build` fails only on those two call sites in `GraphRoute.tsx`, proceed to Task 4; otherwise fix the reported error here.)

- [ ] **Step 4: Commit**

```bash
git add src/components/GraphView.tsx src/components/GraphView3D.tsx
git commit -m "feat: colour graph nodes via nodeFill in 2D and 3D views (#121)"
```

---

### Task 4: "Color by" toolbar control + tag-filter suspension

**Files:**
- Modify: `src/routes/GraphRoute.tsx`

**Interfaces:**
- Consumes: `colorBy`, `setColorBy` from `useGraphPrefs` (Task 2); `ColorBy` from `../graphColor` (Task 1); the `colorBy`/`highlightTag` props on `GraphView`/`GraphView3D` (Task 3).

- [ ] **Step 1: Import the `ColorBy` type**

In `src/routes/GraphRoute.tsx`, add after the existing import block (near line 5):

```ts
import type { ColorBy } from '../graphColor'
```

- [ ] **Step 2: Pull `colorBy`/`setColorBy` from prefs**

In the `useGraphPrefs()` destructuring (starts ~line 23), add after the `tag, setTag,` line:

```ts
    colorBy, setColorBy,
```

- [ ] **Step 3: Suspend the tag filter in tag mode**

In the `filtered` `useMemo` (starts ~line 64), change the tag clause from:

```ts
        (tag === '' || n.tags.includes(tag)) &&
```

to:

```ts
        (colorBy === 'tag' || tag === '' || n.tags.includes(tag)) &&
```

Add `colorBy` to that memo's dependency array (currently ends `..., depth, depthFocus]`):

```ts
  }, [full, hidden, hiddenStatuses, tag, showGhosts, minDegree, depth, depthFocus, colorBy])
```

- [ ] **Step 4: Add the "Color by" control**

In the toolbar JSX, immediately after the closing `</select>` of the existing tag dropdown (the `<select value={tag} ...>` block, ~line 197), add:

```tsx
        <label className="graph-slider" title="Colour nodes by page type, status, or a highlighted tag">
          Color by
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            <option value="type">Type</option>
            <option value="status">Status</option>
            <option value="tag">Tag</option>
          </select>
        </label>
```

(Reuses the existing `.graph-slider` label styling — an inline label + control — so no CSS change is needed.)

- [ ] **Step 5: Nudge when tag mode has no tag chosen**

In the `.graph-hint` span (~line 280), add a line after the existing `filtered.nodes.length > 300` hint:

```tsx
          {colorBy === 'tag' && tag === '' && ' — select a tag to highlight'}
```

- [ ] **Step 6: Pass the new props to both views**

Change the `<GraphView3D ... />` element (~line 291) to include the props:

```tsx
              <GraphView3D
                data={filtered}
                showArrows={showArrows}
                colorBy={colorBy}
                highlightTag={tag}
                onGhostClick={setPendingGhost}
              />
```

Change the `<GraphView ... />` element (~line 298) to include the props:

```tsx
            <GraphView
              data={filtered}
              showArrows={showArrows}
              colorBy={colorBy}
              highlightTag={tag}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onGhostClick={setPendingGhost}
              onPinNode={pinNode}
              initialCam={cam}
              onCamChange={setCam}
            />
```

- [ ] **Step 7: Verify build + lint + full test run**

Run: `npm run build && npm run lint && npm run test:run`
Expected: all PASS — no type errors, no lint errors, all tests green (including Tasks 1 & 2).

- [ ] **Step 8: Manual verification**

Run `npm run dev`, open `http://localhost:5174/#/graph` on a world with several linked, tagged pages of mixed status, and confirm:
- "Color by → Type" matches today's colors.
- "Color by → Status" recolors nodes by Stub/Draft/Complete (status chips act as the legend).
- "Color by → Tag" with a tag selected: tagged nodes show the cyan accent, others go muted grey, and **all** nodes stay visible (tag filtering suspended).
- "Color by → Tag" with "All tags": every node muted + the "select a tag to highlight" hint shows.
- Toggle 3D on: colors match the 2D view in every mode.
- Reload the page: the chosen mode persists.

- [ ] **Step 9: Commit**

```bash
git add src/routes/GraphRoute.tsx
git commit -m "feat: add Color by control and tag-highlight mode to graph (#121)"
```

---

## Self-Review Notes

- **Spec coverage:** three color modes (Task 1 `nodeFill`), persistence + default `'type'` (Task 2), 2D/3D parity (Task 3), toolbar control + tag-filter suspension + no-tag hint (Task 4), tests for `nodeFill` and `colorBy` persistence (Tasks 1–2). Ghosts untouched (Task 3 keeps the ghost branches). Chips keep their own colors (unchanged). All spec sections map to a task.
- **Out of scope confirmed absent:** no palette-per-tag, no legend component, no Hubs/Orphans dot recoloring.
- **Type consistency:** `ColorBy`, `nodeFill(node, colorBy, highlightTag)`, `TAG_ACCENT`, `MUTED`, prop names `colorBy`/`highlightTag`, pref `colorBy`/`setColorBy` are used identically across Tasks 1–4.
- **PR note:** label the PR `version:minor` (new feature) per CLAUDE.md.
