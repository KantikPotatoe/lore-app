# Graph Quick Wins — Design

**Date:** 2026-06-29 · **Status:** approved, pre-implementation

Three graph quality-of-life features from `docs/remaining-roadmap.md` ("Quick wins"):
ghost nodes for broken links, drag-to-pin node positions, and persisted view state.

## Goals

1. **Ghost nodes** — surface `[[links]]` to non-existent pages as dashed-outline nodes,
   turning the graph into a built-in worldbuilding to-do list. Clicking one offers to
   create the page. Shown by default, with a toolbar toggle to hide them.
2. **Drag-to-pin** — drag a node and have it stay put; pinned positions persist across
   visits so the user's arranged layout survives reloads.
3. **Persist view state** — remember hidden categories and the arrows / ghosts / panel
   toggles across visits. Camera (zoom/pan) and the tag filter stay ephemeral by choice.

## Non-goals

- Persisting camera zoom/pan or the selected-tag filter (deliberately ephemeral).
- Pinning ghost nodes across visits (their ids are ephemeral; session-only stick is fine).
- Any change to the force-simulation itself, link bundling, or the possible future
  graph rework. These three are scoped as standalone, low-risk additions.

## Architecture

Pure data → rendering → persistence, mirroring the codebase's "pure core + thin wiring":

- **Pure data:** ghost computation is a pure addition to `buildGraphData` (`src/db/graph.ts`).
- **Rendering / interaction:** dashed ghost painting, ghost-click, and drag-to-pin wiring
  live in `GraphView.tsx`.
- **Persistence:** a focused `useGraphPrefs` hook (`src/useGraphPrefs.ts`) owns the two
  meta rows and the hydration/write logic — isolated where it is testable, keeping
  `GraphRoute` readable (aligns with the roadmap's "move route logic into hooks" item).

### 1. Ghost nodes — `src/db/graph.ts` (pure)

- `GraphNode` gains an optional `ghost?: boolean`.
- `buildGraphData` no longer silently drops links whose target title fails to resolve;
  it accumulates them into ghost nodes:
  - **Ghost id:** `ghost:<lowercased-trimmed-title>`.
  - **Display title:** derived from the link text. `linkedTitles` lowercases every
    title (the only exposed extractor), so original casing isn't recoverable without a
    more invasive change that would ripple into backlinks/degree. Accepted simplification:
    prettify the lowercased title to title case for display (`mordor` → `Mordor`,
    `the shire` → `The Shire`); minor mis-casings (acronyms, small words) are tolerable
    on a to-do marker.
  - **Category:** a private `GHOST_CATEGORY` sentinel (e.g. `'__ghost__'`), kept internal
    to `graph.ts` — the view branches on the `ghost` flag, not the category.
  - **Tags:** `[]`.
- **Degree is split** so toggling ghosts never resizes real nodes:
  - Real-node `degree` stays *distinct real neighbours only* (unchanged behavior).
  - A ghost's `degree` = number of distinct real pages linking to it (drives its size),
    tracked in a separate `ghostLinkers: Map<ghostId, Set<pageId>>`.
- Ghost links (`page → ghost`) are de-duped independently of the existing real-link
  `seen` set (key `${pageId}|${ghostId}`).
- `buildGraphData` **always** computes ghosts; visibility is a `GraphRoute` filter concern.

### 2. `GraphRoute.tsx` wiring

- Derive **categories** and **tags** lists from real nodes only (`full.nodes` filtered by
  `!n.ghost`), so ghosts never pollute the chips or tag dropdown.
- `filtered` node predicate adds `&& (showGhosts || !n.ghost)`. The existing `visible`-set
  link filter already drops ghost links when ghosts are hidden, and ghosts (untagged) drop
  out naturally when a tag filter is active — both acceptable/expected.
- `filtered` clone seeds pinned positions declaratively:
  `{ ...n, fx: pins[n.id]?.x, fy: pins[n.id]?.y }`.
- New ephemeral state `pendingGhost: string | null`; a `ConfirmDialog` ("Create page?")
  reused exactly as in `PageRoute.followWikiLink` — on confirm,
  `createPage({ title, status: 'Stub' })` then `navigate('/page/:id')`.
- "Reset layout" toolbar button, shown only when `Object.keys(pins).length > 0`, calls
  `clearPins()`.
- Call `prunePins(new Set(full.nodes.map(n => n.id)))` once when `full` loads, to drop
  pins for deleted pages.
- Consumes `useGraphPrefs` for `hidden` / `toggleCategory` / the three toggles / pins;
  `tag`, `query`, `selectedId` remain local `useState`.

### 3. Rendering & interaction — `GraphView.tsx`

- `paintNode`: when `node.ghost`, draw a **dashed muted outline** (`ctx.setLineDash`,
  stroke `#8a8270`, faint or no fill) at `radiusFor(node.degree)`, label in the same muted
  tone, reusing the existing zoom/focus label-visibility rule; reset `setLineDash([])`
  afterward. Ghosts participate in focus-dimming normally (they are real links).
- `onNodeClick`: branch at the top — `if (node.ghost) { onGhostClick(node.title); return }`,
  bypassing the single/double-click navigate timer.
- `onNodeDragEnd={(node) => { node.fx = node.x; node.fy = node.y;
  if (!node.ghost) onPinNode(String(node.id), node.x, node.y) }}` — sticks the node and
  persists real pages only (ghosts stick for the session but are not saved).
- New props: `onGhostClick(title: string)`, `onPinNode(id: string, x: number, y: number)`.

### 4. Persistence — `src/useGraphPrefs.ts` (new hook)

Owns two per-lore meta rows (same store as `home-config`; carried in backups
automatically — no Dexie schema or `CURRENT_SCHEMA_VERSION` bump):

- `graph-view` → `{ hidden: string[]; showArrows: boolean; showGhosts: boolean; panelOpen: boolean }`
- `graph-pins` → `{ [pageId: string]: { x: number; y: number } }`

**Load-race defeat:** read with `useLiveQuery(async () => ({ v: await getMeta(KEY) }), [])`
so "still loading" (outer `undefined`) is distinguishable from "loaded, no row"
(`{ v: undefined }`). A `hydrated` ref hydrates React state exactly once on first resolve;
a separate effect persists on change **only after** hydration, so defaults never clobber a
stored row on first paint.

State held: `hidden: Set<string>`, `showArrows`, `showGhosts` (default `true`),
`panelOpen`, `pins: Record<string, {x,y}>`. Defaults match today's behavior
(`hidden` empty, arrows off, panel closed) plus ghosts on.

Exposes:
`{ hidden, toggleCategory, showArrows, setShowArrows, showGhosts, setShowGhosts,
panelOpen, setPanelOpen, pins, pinNode, clearPins, prunePins }`.

- `pinNode(id, x, y)` merges one coord; persisted after hydration.
- `clearPins()` empties the pin map.
- `prunePins(validIds: Set<string>)` drops pins whose id is not a current node.

## Testing

- **`src/db/graph.test.ts`** (new — also closes a roadmap residual-coverage gap for
  `buildGraphData`):
  - link to a missing title → one ghost node (`ghost: true`, id `ghost:<lower>`, correct
    title, `degree` = 1);
  - two pages linking the same missing title → one ghost, `degree` 2;
  - the lowercased link text is prettified to title case for the display title
    (`mordor` → `Mordor`);
  - a title that *does* resolve is never a ghost; self-links and existing real-link
    de-duplication behavior unchanged;
  - real-node `degree` is unaffected by outgoing ghost links.
- **`src/useGraphPrefs.test.ts`** (new): hydrates view + pins from meta; persists on change;
  does **not** clobber a stored row with defaults on first load; `pinNode` / `clearPins` /
  `prunePins` behave. Uses fake-indexeddb and `afterEach(cleanup)` (the `useLiveQuery`
  teardown caveat).
- Canvas rendering in `GraphView` stays untested, consistent with the codebase.

## Verification

`npm run lint && npm run build && npm run test:run` all green before claiming done.
PR carries a `version:minor` label (new feature).
