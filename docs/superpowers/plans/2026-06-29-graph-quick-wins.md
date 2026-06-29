# Graph Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three graph quality-of-life features — ghost nodes for broken links (clickable to create the page), drag-to-pin node positions, and persisted view state.

**Architecture:** Pure ghost computation in `buildGraphData` (`src/db/graph.ts`); a focused `useGraphPrefs` hook (`src/useGraphPrefs.ts`) owning two per-lore `meta` rows (view prefs + pinned positions) with a load-race-safe hydrate-once / persist-after pattern; thin rendering, ghost-click, and drag wiring in `GraphView.tsx`; consumption + a "Create page?" confirm + "Reset layout" in `GraphRoute.tsx`.

**Tech Stack:** React + TypeScript (strict), Dexie + `useLiveQuery` (dexie-react-hooks), react-force-graph-2d, Vitest + happy-dom + fake-indexeddb, `@testing-library/react`.

## Global Constraints

- TypeScript `strict` — no `any`, no unused symbols (build runs `tsc -b`).
- Always import db API from `'../db'` (the barrel); re-export any new public API from `src/db/index.ts` or `barrel.test.ts` fails. (No new db export is required by this plan — `buildGraphData`/`GraphNode` are already exported; the `ghost` field is an additive change to the existing `GraphNode` interface.)
- `useLiveQuery`-based tests must `import { cleanup } from '@testing-library/react'` and call `afterEach(cleanup)`, else teardown throws "window is not defined".
- Per-lore `meta` rows follow the `home-config` precedent (`getMeta`/`setMeta` from `'../db'`); the `meta` store already exists — **no Dexie schema version bump and no `CURRENT_SCHEMA_VERSION` change**.
- Verify before done: `npm run lint && npm run build && npm run test:run` all green.
- PR label: `version:minor` (new feature).

---

### Task 1: Ghost nodes in `buildGraphData`

**Files:**
- Modify: `src/db/graph.ts`
- Create: `src/db/graph.test.ts`

**Interfaces:**
- Consumes: `linkedTitles(page)` from `./pages` (returns `Set<string>` of **lowercased, trimmed** titles); `LorePage` from `./types`.
- Produces:
  - `GraphNode` gains `ghost?: boolean` (absent/false on real pages, `true` on ghosts).
  - Ghost node shape: `{ id: 'ghost:' + lower, title: <title-cased>, category: '__ghost__', tags: [], degree: <distinct real linkers>, ghost: true }`.
  - `buildGraphData(pages)` now also emits ghost nodes + `page → ghost` links. Real-node `degree` is unchanged (distinct real neighbours only).

- [ ] **Step 1: Write the failing tests**

Create `src/db/graph.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildGraphData, type LorePage } from '../db'

// Minimal page factory — only the fields buildGraphData reads.
function page(partial: Partial<LorePage> & { id: string; title: string }): LorePage {
  return {
    category: 'General',
    content: '',
    summary: '',
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as LorePage
}

/** A body anchor linking to `title` (matches what the editor emits). */
function link(title: string): string {
  return `<a data-wikilink data-title="${title}">${title}</a>`
}

describe('buildGraphData ghost nodes', () => {
  it('turns a link to a missing page into one ghost node', () => {
    const pages = [page({ id: 'a', title: 'Sam', content: `<p>${link('Mordor')}</p>` })]
    const { nodes, links } = buildGraphData(pages)

    const ghost = nodes.find((n) => n.ghost)
    expect(ghost).toBeDefined()
    expect(ghost!.id).toBe('ghost:mordor')
    expect(ghost!.degree).toBe(1)
    expect(links).toContainEqual({ source: 'a', target: 'ghost:mordor' })
  })

  it('collapses two linkers to the same missing title into one ghost (degree 2)', () => {
    const pages = [
      page({ id: 'a', title: 'Sam', content: `<p>${link('Mordor')}</p>` }),
      page({ id: 'b', title: 'Frodo', content: `<p>${link('Mordor')}</p>` }),
    ]
    const ghosts = buildGraphData(pages).nodes.filter((n) => n.ghost)
    expect(ghosts).toHaveLength(1)
    expect(ghosts[0].degree).toBe(2)
  })

  it('prettifies the lowercased link text to a title-cased label', () => {
    const pages = [page({ id: 'a', title: 'Sam', content: `<p>${link('the shire')}</p>` })]
    const ghost = buildGraphData(pages).nodes.find((n) => n.ghost)!
    expect(ghost.title).toBe('The Shire')
  })

  it('does not create a ghost when the target page exists', () => {
    const pages = [
      page({ id: 'a', title: 'Sam', content: `<p>${link('Frodo')}</p>` }),
      page({ id: 'b', title: 'Frodo' }),
    ]
    expect(buildGraphData(pages).nodes.some((n) => n.ghost)).toBe(false)
  })

  it('leaves real-node degree unaffected by outgoing ghost links', () => {
    const pages = [
      page({ id: 'a', title: 'Sam', content: `<p>${link('Frodo')} ${link('Mordor')}</p>` }),
      page({ id: 'b', title: 'Frodo' }),
    ]
    const sam = buildGraphData(pages).nodes.find((n) => n.id === 'a')!
    expect(sam.degree).toBe(1) // only the real Frodo edge counts
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/db/graph.test.ts`
Expected: FAIL — ghost nodes not produced (`ghost` is `undefined`, no `ghost:mordor` node/link).

- [ ] **Step 3: Implement ghost computation**

In `src/db/graph.ts`, add `ghost?: boolean` to the `GraphNode` interface:

```ts
export interface GraphNode {
  id: string
  title: string
  category: string
  tags: string[]
  degree: number
  /** True for synthetic nodes standing in for links to pages that don't exist yet. */
  ghost?: boolean
}
```

Add a sentinel + prettifier near the top of the file (after the interfaces):

```ts
// Category sentinel for ghost nodes — they branch on the `ghost` flag, not this,
// so it stays internal and is excluded from the toolbar's category list.
const GHOST_CATEGORY = '__ghost__'

// linkedTitles() lowercases every title, so a ghost's display label is recovered
// by title-casing the link text (mordor → Mordor, the shire → The Shire).
function prettyTitle(lower: string): string {
  return lower.replace(/\b\w/g, (c) => c.toUpperCase())
}
```

Replace the body of `buildGraphData` (keep the signature and doc comment) with:

```ts
export function buildGraphData(pages: LorePage[]): GraphData {
  const idByTitle = new Map<string, string>()
  for (const p of pages) idByTitle.set(p.title.trim().toLowerCase(), p.id)

  const neighbours = new Map<string, Set<string>>()
  for (const p of pages) neighbours.set(p.id, new Set())

  // Distinct real pages linking to each unresolved title → drives ghost size.
  const ghostLinkers = new Map<string, Set<string>>()

  const seen = new Set<string>() // de-dupe real edge key "a|b" with a < b
  const links: GraphLink[] = []

  for (const page of pages) {
    for (const title of linkedTitles(page)) {
      const targetId = idByTitle.get(title)
      if (targetId === page.id) continue // self-link
      if (!targetId) {
        // Missing page → ghost edge (page → ghost), one ghost per lowercased title.
        const ghostId = `ghost:${title}`
        let linkers = ghostLinkers.get(ghostId)
        if (!linkers) {
          linkers = new Set()
          ghostLinkers.set(ghostId, linkers)
        }
        if (!linkers.has(page.id)) {
          linkers.add(page.id)
          links.push({ source: page.id, target: ghostId })
        }
        continue
      }
      const key = page.id < targetId ? `${page.id}|${targetId}` : `${targetId}|${page.id}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ source: page.id, target: targetId })
      neighbours.get(page.id)!.add(targetId)
      neighbours.get(targetId)!.add(page.id)
    }
  }

  const nodes: GraphNode[] = pages.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    tags: p.tags,
    degree: neighbours.get(p.id)!.size,
  }))

  for (const [ghostId, linkers] of ghostLinkers) {
    nodes.push({
      id: ghostId,
      title: prettyTitle(ghostId.slice('ghost:'.length)),
      category: GHOST_CATEGORY,
      tags: [],
      degree: linkers.size,
      ghost: true,
    })
  }

  return { nodes, links }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/db/graph.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add src/db/graph.ts src/db/graph.test.ts
git commit -m "feat: ghost nodes for links to missing pages in buildGraphData"
```

---

### Task 2: `useGraphPrefs` persistence hook

**Files:**
- Create: `src/useGraphPrefs.ts`
- Create: `src/useGraphPrefs.test.ts`

**Interfaces:**
- Consumes: `getMeta`/`setMeta` from `'./db'`.
- Produces the hook return type:

```ts
interface GraphPrefs {
  hidden: Set<string>
  toggleCategory: (cat: string) => void
  showArrows: boolean
  setShowArrows: (v: boolean) => void
  showGhosts: boolean
  setShowGhosts: (v: boolean) => void
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void
  pins: Record<string, { x: number; y: number }>
  pinNode: (id: string, x: number, y: number) => void
  clearPins: () => void
  prunePins: (validIds: Set<string>) => void
}
```

- Meta keys/shapes: `graph-view` → `{ hidden: string[]; showArrows: boolean; showGhosts: boolean; panelOpen: boolean }`; `graph-pins` → `Record<string, { x: number; y: number }>`.
- Defaults: `hidden` empty, `showArrows` false, `showGhosts` **true**, `panelOpen` false, `pins` `{}`.

- [ ] **Step 1: Write the failing tests**

Create `src/useGraphPrefs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { db, setMeta, getMeta } from './db'
import { useGraphPrefs } from './useGraphPrefs'

afterEach(cleanup)

beforeEach(async () => {
  await db.meta.clear()
})

describe('useGraphPrefs', () => {
  it('uses defaults when no meta row exists', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    // Wait past the hydration tick.
    await waitFor(() => expect(result.current).toBeTruthy())
    expect(result.current.showGhosts).toBe(true)
    expect(result.current.showArrows).toBe(false)
    expect(result.current.panelOpen).toBe(false)
    expect([...result.current.hidden]).toEqual([])
    expect(result.current.pins).toEqual({})
  })

  it('hydrates view + pins from existing meta rows', async () => {
    await setMeta('graph-view', { hidden: ['Character'], showArrows: true, showGhosts: false, panelOpen: true })
    await setMeta('graph-pins', { p1: { x: 10, y: 20 } })

    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current.showArrows).toBe(true))
    expect([...result.current.hidden]).toEqual(['Character'])
    expect(result.current.showGhosts).toBe(false)
    expect(result.current.panelOpen).toBe(true)
    expect(result.current.pins).toEqual({ p1: { x: 10, y: 20 } })
  })

  it('does not clobber a stored row with defaults on first load', async () => {
    await setMeta('graph-view', { hidden: ['Item'], showArrows: false, showGhosts: false, panelOpen: false })
    const { unmount } = renderHook(() => useGraphPrefs())
    // Give effects time to run; the stored row must survive untouched.
    await waitFor(async () => {
      const v = await getMeta<{ showGhosts: boolean }>('graph-view')
      expect(v?.showGhosts).toBe(false)
    })
    unmount()
  })

  it('persists a toggle change to meta', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.setShowArrows(true))
    await waitFor(async () => {
      const v = await getMeta<{ showArrows: boolean }>('graph-view')
      expect(v?.showArrows).toBe(true)
    })
  })

  it('pinNode adds a pin and clearPins empties them', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.pinNode('p1', 5, 6))
    await waitFor(() => expect(result.current.pins).toEqual({ p1: { x: 5, y: 6 } }))
    act(() => result.current.clearPins())
    await waitFor(() => expect(result.current.pins).toEqual({}))
  })

  it('prunePins drops pins whose id is not in the valid set', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.pinNode('keep', 1, 1))
    act(() => result.current.pinNode('drop', 2, 2))
    await waitFor(() => expect(Object.keys(result.current.pins)).toHaveLength(2))
    act(() => result.current.prunePins(new Set(['keep'])))
    await waitFor(() => expect(result.current.pins).toEqual({ keep: { x: 1, y: 1 } }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/useGraphPrefs.test.ts`
Expected: FAIL — `Cannot find module './useGraphPrefs'` / `useGraphPrefs is not a function`.

- [ ] **Step 3: Implement the hook**

Create `src/useGraphPrefs.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta, setMeta } from './db'

const VIEW_KEY = 'graph-view'
const PINS_KEY = 'graph-pins'

interface SavedView {
  hidden: string[]
  showArrows: boolean
  showGhosts: boolean
  panelOpen: boolean
}

type Pins = Record<string, { x: number; y: number }>

export interface GraphPrefs {
  hidden: Set<string>
  toggleCategory: (cat: string) => void
  showArrows: boolean
  setShowArrows: (v: boolean) => void
  showGhosts: boolean
  setShowGhosts: (v: boolean) => void
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void
  pins: Pins
  pinNode: (id: string, x: number, y: number) => void
  clearPins: () => void
  prunePins: (validIds: Set<string>) => void
}

export function useGraphPrefs(): GraphPrefs {
  // Wrap the read so "still loading" (outer undefined) is distinguishable from
  // "loaded, no row" (inner undefined) — otherwise defaults could clobber a row.
  const savedView = useLiveQuery(async () => ({ v: await getMeta<SavedView>(VIEW_KEY) }), [])
  const savedPins = useLiveQuery(async () => ({ v: await getMeta<Pins>(PINS_KEY) }), [])

  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showArrows, setShowArrows] = useState(false)
  const [showGhosts, setShowGhosts] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pins, setPins] = useState<Pins>({})

  const viewHydrated = useRef(false)
  const pinsHydrated = useRef(false)

  useEffect(() => {
    if (viewHydrated.current || savedView === undefined) return
    viewHydrated.current = true
    const v = savedView.v
    if (v) {
      setHidden(new Set(v.hidden ?? []))
      setShowArrows(v.showArrows ?? false)
      setShowGhosts(v.showGhosts ?? true)
      setPanelOpen(v.panelOpen ?? false)
    }
  }, [savedView])

  useEffect(() => {
    if (pinsHydrated.current || savedPins === undefined) return
    pinsHydrated.current = true
    if (savedPins.v) setPins(savedPins.v)
  }, [savedPins])

  // Persist only after hydration, so initial defaults never overwrite a stored row.
  useEffect(() => {
    if (!viewHydrated.current) return
    setMeta(VIEW_KEY, { hidden: [...hidden], showArrows, showGhosts, panelOpen } satisfies SavedView)
  }, [hidden, showArrows, showGhosts, panelOpen])

  useEffect(() => {
    if (!pinsHydrated.current) return
    setMeta(PINS_KEY, pins)
  }, [pins])

  const toggleCategory = useCallback((cat: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  const pinNode = useCallback((id: string, x: number, y: number) => {
    setPins((prev) => ({ ...prev, [id]: { x, y } }))
  }, [])

  const clearPins = useCallback(() => setPins({}), [])

  const prunePins = useCallback((validIds: Set<string>) => {
    setPins((prev) => {
      const next: Pins = {}
      let changed = false
      for (const [id, pos] of Object.entries(prev)) {
        if (validIds.has(id)) next[id] = pos
        else changed = true
      }
      return changed ? next : prev
    })
  }, [])

  return {
    hidden, toggleCategory,
    showArrows, setShowArrows,
    showGhosts, setShowGhosts,
    panelOpen, setPanelOpen,
    pins, pinNode, clearPins, prunePins,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/useGraphPrefs.test.ts`
Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add src/useGraphPrefs.ts src/useGraphPrefs.test.ts
git commit -m "feat: add useGraphPrefs hook for persisted graph view state and pins"
```

---

### Task 3: Ghost rendering, ghost-click, and drag-to-pin in `GraphView`

**Files:**
- Modify: `src/components/GraphView.tsx`

**Interfaces:**
- Consumes: `GraphNode.ghost` (Task 1).
- Produces: `GraphView` gains two props — `onGhostClick: (title: string) => void` and `onPinNode: (id: string, x: number, y: number) => void`. Existing props (`data`, `showArrows`, `selectedId`, `onSelect`) unchanged.

> No standalone test — GraphView is canvas-rendered and untested in this codebase (consistent with existing practice). Verification is `tsc -b` (build) + manual.

- [ ] **Step 1: Extend the prop signature**

In `src/components/GraphView.tsx`, update the destructured props and type:

```tsx
export default function GraphView({
  data,
  showArrows,
  selectedId,
  onSelect,
  onGhostClick,
  onPinNode,
}: {
  data: GraphData
  showArrows: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onGhostClick: (title: string) => void
  onPinNode: (id: string, x: number, y: number) => void
}) {
```

- [ ] **Step 2: Paint ghost nodes as dashed muted outlines**

In `paintNode`, replace the fill block (the `ctx.beginPath()` … `ctx.fill()` for the node circle, plus the label `fillStyle`) with a ghost-aware branch. Locate:

```tsx
      ctx.globalAlpha = baseAlpha
      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      ctx.fillStyle = categoryColor(node.category)
      ctx.fill()

      // Draw the title under the node once zoomed in, or for focused nodes.
      if (globalScale > 1.2 || (neighbourIds != null && !isDim)) {
        const fontSize = 12 / globalScale
        ctx.font = `${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#e9e1d2'
        ctx.fillText(node.title, x, y + r + 1)
      }
      ctx.globalAlpha = 1
```

Replace with:

```tsx
      ctx.globalAlpha = baseAlpha
      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      if (node.ghost) {
        // Dashed muted outline, no fill — a "page doesn't exist yet" marker.
        ctx.setLineDash([3 / globalScale, 3 / globalScale])
        ctx.lineWidth = 1.5 / globalScale
        ctx.strokeStyle = '#8a8270'
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.fillStyle = categoryColor(node.category)
        ctx.fill()
      }

      // Draw the title under the node once zoomed in, or for focused nodes.
      if (globalScale > 1.2 || (neighbourIds != null && !isDim)) {
        const fontSize = 12 / globalScale
        ctx.font = `${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = node.ghost ? '#8a8270' : '#e9e1d2'
        ctx.fillText(node.title, x, y + r + 1)
      }
      ctx.globalAlpha = 1
```

- [ ] **Step 3: Branch ghost clicks and add drag-to-pin**

In the `<ForceGraph2D>` JSX, update `onNodeClick` to short-circuit ghosts, and add `onNodeDragEnd`. Locate `onNodeClick={(node: GNode) => {` and replace its opening so the handler begins:

```tsx
      onNodeClick={(node: GNode) => {
        if (node.ghost) {
          onGhostClick(node.title)
          return
        }
        const id = String(node.id)
```

(The rest of the existing `onNodeClick` body — the click-timer navigate/focus logic — stays unchanged.)

Immediately after the `onNodeClick={...}` prop, add:

```tsx
      onNodeDragEnd={(node: GNode) => {
        // Stick the node where it was dropped; persist real pages only
        // (ghost ids are ephemeral, so their pins would not survive a rebuild).
        node.fx = node.x
        node.fy = node.y
        if (!node.ghost && node.x != null && node.y != null) {
          onPinNode(String(node.id), node.x, node.y)
        }
      }}
```

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: PASS — `tsc -b` clean (new props typed; `node.ghost`/`node.x`/`node.y` resolve). No new test.

- [ ] **Step 5: Commit**

```bash
git add src/components/GraphView.tsx
git commit -m "feat: render ghost nodes, create-on-ghost-click, and drag-to-pin in GraphView"
```

---

### Task 4: Wire `GraphRoute` — consume the hook, seed pins, ghost-create, reset layout

**Files:**
- Modify: `src/routes/GraphRoute.tsx`

**Interfaces:**
- Consumes: `useGraphPrefs` (Task 2); `GraphView`'s new `onGhostClick`/`onPinNode` props (Task 3); `GraphNode.ghost` (Task 1); `createPage` from `'../db'`; `ConfirmDialog` from `'../components/ConfirmDialog'`.
- Produces: no new exports. `GraphRoute` no longer owns `hidden`/`showArrows`/`panelOpen` local state (moved to the hook); keeps `tag`, `query`, `selectedId` local.

> No standalone test — route is integration-tested manually; covered by build + the unit tests in Tasks 1–2. Verification is `tsc -b` + manual.

- [ ] **Step 1: Swap toolbar state for the hook and add ghost state**

In `src/routes/GraphRoute.tsx`, add imports:

```tsx
import { db, buildGraphData, categoryColor, createPage, type LorePage } from '../db'
import { useGraphPrefs } from '../useGraphPrefs'
import ConfirmDialog from '../components/ConfirmDialog'
import { useNavigate } from 'react-router-dom'
```

Replace these existing `useState` lines:

```tsx
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [tag, setTag] = useState('')
  const [showArrows, setShowArrows] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
```

with:

```tsx
  const navigate = useNavigate()
  const {
    hidden, toggleCategory,
    showArrows, setShowArrows,
    showGhosts, setShowGhosts,
    panelOpen, setPanelOpen,
    pins, pinNode, clearPins, prunePins,
  } = useGraphPrefs()
  const [tag, setTag] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [pendingGhost, setPendingGhost] = useState<string | null>(null)
```

Delete the now-duplicated local `toggleCategory` function:

```tsx
  function toggleCategory(cat: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }
```

- [ ] **Step 2: Exclude ghosts from chips/tags, filter + seed pins, prune on load**

Update the `categories` and `tags` memos to ignore ghost nodes:

```tsx
  const categories = useMemo(
    () => [...new Set(full.nodes.filter((n) => !n.ghost).map((n) => n.category))].sort((a, b) => a.localeCompare(b)),
    [full],
  )
  const tags = useMemo(
    () => [...new Set(full.nodes.filter((n) => !n.ghost).flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b)),
    [full],
  )
```

Replace the `filtered` memo so it honours the ghost toggle and seeds pinned coordinates:

```tsx
  const filtered = useMemo(() => {
    const nodes = full.nodes.filter(
      (n) =>
        (showGhosts || !n.ghost) &&
        !hidden.has(n.category) &&
        (tag === '' || n.tags.includes(tag)),
    )
    const visible = new Set(nodes.map((n) => n.id))
    const links = full.links.filter((l) => visible.has(l.source) && visible.has(l.target))
    // Clone nodes/links: the force simulation mutates the objects it receives.
    // Seed fx/fy from saved pins so a pinned layout is restored on load.
    return {
      nodes: nodes.map((n) => {
        const pin = pins[n.id]
        return pin ? { ...n, fx: pin.x, fy: pin.y } : { ...n }
      }),
      links: links.map((l) => ({ ...l })),
    }
  }, [full, hidden, tag, showGhosts, pins])
```

Add a prune effect after the memos (drops pins for deleted pages once data loads). Add `useEffect` to the React import if not already present:

```tsx
  // Drop saved pins for pages that no longer exist.
  useEffect(() => {
    if (full.nodes.length > 0) prunePins(new Set(full.nodes.map((n) => n.id)))
  }, [full, prunePins])
```

- [ ] **Step 3: Add the ghost-create handler and confirm dialog**

Add a handler near `selectNode`:

```tsx
  async function createGhost(title: string) {
    setPendingGhost(null)
    const id = await createPage({ title, status: 'Stub' })
    navigate(`/page/${id}`)
  }
```

Before the closing `</div>` of the `graph-page` wrapper (after `graph-body`), add the dialog:

```tsx
      <ConfirmDialog
        open={pendingGhost !== null}
        title="Create page?"
        confirmLabel="Create"
        onConfirm={() => pendingGhost && createGhost(pendingGhost)}
        onCancel={() => setPendingGhost(null)}
      >
        “{pendingGhost}” doesn’t exist yet. Create it?
      </ConfirmDialog>
```

- [ ] **Step 4: Add the ghosts toggle + reset-layout buttons and wire GraphView props**

In the toolbar, after the existing arrows toggle button, add a ghosts toggle and a conditional reset button:

```tsx
        <button
          className={`ghost-btn${showGhosts ? ' active' : ''}`}
          onClick={() => setShowGhosts(!showGhosts)}
        >
          {showGhosts ? '👻 Ghosts on' : '👻 Ghosts off'}
        </button>

        {Object.keys(pins).length > 0 && (
          <button className="ghost-btn" onClick={clearPins}>
            ⤺ Reset layout
          </button>
        )}
```

Update the `<GraphView>` usage to pass the new props:

```tsx
          <GraphView
            data={filtered}
            showArrows={showArrows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onGhostClick={setPendingGhost}
            onPinNode={pinNode}
          />
```

- [ ] **Step 5: Build, lint, full test run**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all PASS. Confirm `GraphRoute` has no unused imports (e.g. `useNavigate` is now used; `setHidden` is gone).

- [ ] **Step 6: Commit**

```bash
git add src/routes/GraphRoute.tsx
git commit -m "feat: wire graph ghost toggle, create-on-click, drag-pin persistence, reset layout"
```

---

### Task 5: Manual verification & PR

**Files:** none (verification + integration).

- [ ] **Step 1: Run the full gate**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all green.

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`, open the pinned port, go to `/graph`. Verify:
- A page that links a non-existent title shows a dashed grey ghost node; clicking it prompts "Create page?", and confirming opens a new Stub page.
- Toggling "Ghosts off" hides ghost nodes (and their edges); the choice survives a reload.
- Hiding a category chip and toggling arrows/panel survive a reload; the tag filter and camera reset on reload (by design).
- Dragging a node makes it stay put; reloading restores the pinned positions; "Reset layout" clears them and the layout re-simulates.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin <branch>
gh pr create --title "Graph quick wins: ghost nodes, drag-to-pin, persisted view state" \
  --body "Implements docs/superpowers/specs/2026-06-29-graph-quick-wins-design.md" \
  --label version:minor
```

Expected: CI (lint + build + test) green on the PR.

---

## Self-Review

- **Spec coverage:** Ghost nodes (data) → Task 1; ghost render + click + create → Tasks 3–4; drag-to-pin + seed + persist → Tasks 2–4; persisted view state (hidden + 3 toggles) → Tasks 2, 4; ghost toggle on-by-default → Task 2 default + Task 4 button; reset layout → Task 4; tests (graph.test.ts, useGraphPrefs.test.ts) → Tasks 1–2; no schema bump → Global Constraints. Camera/tag deliberately ephemeral → Task 4 (`tag`/`selectedId` stay local, no camera persistence). All covered.
- **Type consistency:** `GraphNode.ghost?: boolean` (Task 1) consumed in Tasks 3–4. Hook return names (`hidden`, `toggleCategory`, `showArrows`, `setShowArrows`, `showGhosts`, `setShowGhosts`, `panelOpen`, `setPanelOpen`, `pins`, `pinNode`, `clearPins`, `prunePins`) defined Task 2, consumed verbatim Task 4. `GraphView` props `onGhostClick(title)`, `onPinNode(id,x,y)` defined Task 3, passed Task 4. Meta keys `graph-view`/`graph-pins` consistent across Task 2 and tests.
- **Placeholder scan:** none — every code/step is concrete.
