# Relationship Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive force-directed graph view (`/graph`) showing every lore page as a node and every resolved link as an edge, filterable by category/tag, with hover highlight and click-to-navigate.

**Architecture:** A pure `buildGraphData()` helper in `db.ts` turns the page list into `{nodes, links}`. A `GraphRoute` owns the toolbar/filter state and feeds a filtered dataset to a `GraphView` component that wraps `react-force-graph-2d`. A new sidebar link and route wire it into the existing app shell.

**Tech Stack:** React 19, TypeScript, Dexie + `dexie-react-hooks` (`useLiveQuery`), `react-force-graph-2d` (Canvas + d3-force), Vite.

---

## Context for the implementer

This project has **no automated test framework** (no Jest/Vitest, no test script). Do **not** invent one. "Tests" in this plan are: `npm run build` (TypeScript type-check + bundle) must pass, `npm run lint` must pass, and manual verification in the browser via `npm run dev` (pinned to port 5174). Each task's verification step says exactly which to run.

Key existing APIs you will reuse (all in `src/db.ts`):
- `LorePage` interface — has `id`, `title`, `category`, `tags`, `content`, `infobox`.
- `linkedTitles(page: LorePage): Set<string>` — returns the lowercased titles a page links to (body wiki-links + infobox `[[…]]`).
- `categoryColor(name: string): string` — synchronous, returns a hex color for a category name.
- `db.pages` — Dexie table.

Conventions to follow: 2-space indent, no semicolons, single quotes, `type`-only imports where applicable (e.g. `import { db, type LorePage } from '../db'`). Comments are explanatory and sentence-style — match the surrounding tone.

---

## File Structure

- **Modify** `src/db.ts` — add `GraphNode`, `GraphLink`, `GraphData` interfaces and the pure `buildGraphData(pages)` helper, beside the existing backlink logic.
- **Create** `src/components/GraphView.tsx` — wraps `ForceGraph2D`; handles paint (color/size/label), hover highlight, click-to-navigate, arrow toggle.
- **Create** `src/routes/GraphRoute.tsx` — owns toolbar + filter state; computes filtered nodes/links and renders `GraphView`.
- **Modify** `src/App.tsx` — register the `/graph` route.
- **Modify** `src/components/Sidebar.tsx` — add the **Graph** nav link.
- **Modify** `src/index.css` (the project stylesheet) — graph page + toolbar + chip styles.
- **Modify** `package.json` / `package-lock.json` — via `npm install react-force-graph-2d`.

---

## Task 1: Install the graph dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the package**

Run:
```bash
npm install react-force-graph-2d
```
Expected: it adds to `dependencies`. If it fails with an `ERESOLVE` peer-dependency error against React 19, retry with:
```bash
npm install react-force-graph-2d --legacy-peer-deps
```
Expected: `package.json` now lists `react-force-graph-2d` under `dependencies`.

- [ ] **Step 2: Verify the build still works**

Run: `npm run build`
Expected: PASS (no TypeScript errors, bundle written to `dist/`). `react-force-graph-2d` ships its own types, so no `@types` package is needed.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add react-force-graph-2d dependency for relationship graph (#16)"
```

---

## Task 2: `buildGraphData()` helper in `db.ts`

**Files:**
- Modify: `src/db.ts` (add after `getBacklinks`, near line 531)

This is the data core. It must: include every page as a node; create one de-duplicated edge per connected pair of *existing* pages; drop self-links and links to non-existent titles; compute each node's `degree` (distinct neighbors).

- [ ] **Step 1: Add the interfaces and helper**

Add to `src/db.ts` immediately after the `getBacklinks` function (after line 531):

```ts
// ---------------------------------------------------------------------------
// Relationship graph — nodes (pages) and edges (resolved links between them)
// ---------------------------------------------------------------------------

/** One page as a graph node. `degree` is the number of distinct pages it is
 *  connected to (in either direction) and drives the node's drawn size. */
export interface GraphNode {
  id: string
  title: string
  category: string
  tags: string[]
  degree: number
}

/** One edge between two existing pages. `source`/`target` keep the original
 *  link direction so directional arrows can be drawn when enabled. */
export interface GraphLink {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

/** Build the relationship graph from the full page list.
 *
 *  Every page becomes a node (pages with no links show as lone dots, which is
 *  intentional — it surfaces isolated pages). Each page's linked titles are
 *  resolved against a title→id map; a link counts only when the target page
 *  exists. Self-links are dropped and A↔B collapses to a single edge regardless
 *  of direction. `degree` counts distinct neighbours. */
export function buildGraphData(pages: LorePage[]): GraphData {
  const idByTitle = new Map<string, string>()
  for (const p of pages) idByTitle.set(p.title.trim().toLowerCase(), p.id)

  const neighbours = new Map<string, Set<string>>()
  for (const p of pages) neighbours.set(p.id, new Set())

  const seen = new Set<string>() // de-dupe key "a|b" with a < b
  const links: GraphLink[] = []

  for (const page of pages) {
    for (const title of linkedTitles(page)) {
      const targetId = idByTitle.get(title)
      if (!targetId || targetId === page.id) continue // missing page or self-link
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

  return { nodes, links }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: PASS. (`linkedTitles` and `LorePage` are already defined above in the same file.)

- [ ] **Step 3: Commit**

```bash
git add src/db.ts
git commit -m "Add buildGraphData helper for relationship graph (#16)"
```

---

## Task 3: `GraphView` component

**Files:**
- Create: `src/components/GraphView.tsx`

Wraps `ForceGraph2D`. Receives an already-filtered `GraphData`, a `showArrows` flag, and renders nodes colored by category, sized by degree, with title labels, hover highlight, and click-to-navigate.

- [ ] **Step 1: Create the component**

Create `src/components/GraphView.tsx`:

```tsx
import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ForceGraph2D from 'react-force-graph-2d'
import { categoryColor, type GraphData, type GraphNode } from '../db'

// Node radius grows with connection count but stays within these bounds so a
// lone page is still visible and a hub does not swallow the screen.
const MIN_RADIUS = 4
const MAX_RADIUS = 16

function radiusFor(degree: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + degree * 1.5)
}

export default function GraphView({ data, showArrows }: { data: GraphData; showArrows: boolean }) {
  const navigate = useNavigate()
  const fgRef = useRef<any>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)

  // For the hovered node, the set of node ids that are it or a direct neighbour.
  // Everything else is dimmed while hovering.
  const neighbourIds = useMemo(() => {
    if (!hoverId) return null
    const set = new Set<string>([hoverId])
    for (const l of data.links) {
      const s = typeof l.source === 'object' ? (l.source as any).id : l.source
      const t = typeof l.target === 'object' ? (l.target as any).id : l.target
      if (s === hoverId) set.add(t)
      if (t === hoverId) set.add(s)
    }
    return set
  }, [hoverId, data.links])

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x: number; y: number }
      const dimmed = neighbourIds != null && !neighbourIds.has(n.id)
      const r = radiusFor(n.degree)

      ctx.globalAlpha = dimmed ? 0.15 : 1
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = categoryColor(n.category)
      ctx.fill()

      // Draw the title under the node once we are zoomed in enough to read it,
      // or always for the hovered/neighbour nodes.
      if (globalScale > 1.2 || (neighbourIds != null && !dimmed)) {
        const fontSize = 12 / globalScale
        ctx.font = `${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#cdd3de'
        ctx.fillText(n.title, n.x, n.y + r + 1)
      }
      ctx.globalAlpha = 1
    },
    [neighbourIds],
  )

  const linkColor = useCallback(
    (link: any) => {
      if (neighbourIds == null) return 'rgba(160,160,160,0.35)'
      const s = typeof link.source === 'object' ? link.source.id : link.source
      const t = typeof link.target === 'object' ? link.target.id : link.target
      const active = neighbourIds.has(s) && neighbourIds.has(t)
      return active ? 'rgba(180,200,255,0.9)' : 'rgba(160,160,160,0.08)'
    },
    [neighbourIds],
  )

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={data}
      nodeId="id"
      nodeCanvasObject={paintNode}
      nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
        const n = node as GraphNode & { x: number; y: number }
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(n.x, n.y, radiusFor(n.degree) + 2, 0, 2 * Math.PI)
        ctx.fill()
      }}
      linkColor={linkColor}
      linkDirectionalArrowLength={showArrows ? 4 : 0}
      linkDirectionalArrowRelPos={1}
      onNodeHover={(node: any) => setHoverId(node ? node.id : null)}
      onNodeClick={(node: any) => navigate(`/page/${node.id}`)}
      backgroundColor="#11141a"
    />
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: PASS. (`GraphData`/`GraphNode` come from Task 2; `categoryColor` already exists.)

- [ ] **Step 3: Commit**

```bash
git add src/components/GraphView.tsx
git commit -m "Add GraphView force-graph component (#16)"
```

---

## Task 4: `GraphRoute` with filter toolbar

**Files:**
- Create: `src/routes/GraphRoute.tsx`

Owns the page: loads pages reactively, builds graph data, derives the visible categories/tags, and filters the dataset before handing it to `GraphView`.

- [ ] **Step 1: Create the route**

Create `src/routes/GraphRoute.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, buildGraphData, categoryColor, type LorePage } from '../db'
import GraphView from '../components/GraphView'

const NO_PAGES: LorePage[] = []

export default function GraphRoute() {
  const pages = useLiveQuery(() => db.pages.toArray(), []) ?? NO_PAGES

  const full = useMemo(() => buildGraphData(pages), [pages])

  // All categories / tags present in the data, for the toolbar controls.
  const categories = useMemo(
    () => [...new Set(full.nodes.map((n) => n.category))].sort((a, b) => a.localeCompare(b)),
    [full],
  )
  const tags = useMemo(
    () => [...new Set(full.nodes.flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b)),
    [full],
  )

  // Hidden categories (empty = all visible). Selected tag ('' = any).
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [tag, setTag] = useState('')
  const [showArrows, setShowArrows] = useState(false)

  const filtered = useMemo(() => {
    const nodes = full.nodes.filter(
      (n) => !hidden.has(n.category) && (tag === '' || n.tags.includes(tag)),
    )
    const visible = new Set(nodes.map((n) => n.id))
    const links = full.links.filter((l) => visible.has(l.source) && visible.has(l.target))
    // Clone nodes/links: the force simulation mutates the objects it receives,
    // so we must not hand it our memoised source arrays.
    return {
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    }
  }, [full, hidden, tag])

  function toggleCategory(cat: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  if (pages.length === 0) {
    return (
      <div className="graph-empty">
        <h1>Graph</h1>
        <p className="muted">Create some pages and link them with [[wiki links]] to see your world take shape here.</p>
      </div>
    )
  }

  return (
    <div className="graph-page">
      <div className="graph-toolbar">
        <div className="graph-chips">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`graph-chip${hidden.has(cat) ? ' off' : ''}`}
              style={{ borderColor: categoryColor(cat), color: hidden.has(cat) ? undefined : categoryColor(cat) }}
              onClick={() => toggleCategory(cat)}
            >
              <span className="dot" style={{ background: categoryColor(cat) }} />
              {cat}
            </button>
          ))}
        </div>

        <select value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <button
          className={showArrows ? 'primary-btn' : 'ghost-btn'}
          onClick={() => setShowArrows((v) => !v)}
        >
          {showArrows ? '➜ Arrows on' : '➜ Arrows off'}
        </button>

        <span className="graph-hint">
          {filtered.nodes.length} pages · {filtered.links.length} links
          {filtered.nodes.length > 300 && ' — filter by type or tag to declutter'}
        </span>
      </div>

      <div className="graph-body">
        <GraphView data={filtered} showArrows={showArrows} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/GraphRoute.tsx
git commit -m "Add GraphRoute with category/tag filter toolbar (#16)"
```

---

## Task 5: Wire the route and sidebar link

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx:60-64`

- [ ] **Step 1: Register the route in `App.tsx`**

Add the import alongside the other route imports (after line 9, `import CategoryRoute ...`):

```tsx
import GraphRoute from './routes/GraphRoute'
```

Add the route inside `<Routes>` after the `/map` route (line 29):

```tsx
<Route path="/graph" element={<GraphRoute />} />
```

- [ ] **Step 2: Add the sidebar nav link**

In `src/components/Sidebar.tsx`, inside the `<nav className="top-nav">` block (lines 60-64), add a Graph link after the Maps link:

```tsx
<Link to="/graph" className={location.pathname.startsWith('/graph') ? 'nav-item active' : 'nav-item'}>Graph</Link>
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx
git commit -m "Wire /graph route and sidebar Graph link (#16)"
```

---

## Task 6: Styles

**Files:**
- Modify: `src/index.css` (confirm the filename first — it is the stylesheet imported in `src/main.tsx`)

- [ ] **Step 1: Confirm the stylesheet path**

Run: `grep -n "import './" src/main.tsx`
Expected: shows the CSS import (e.g. `import './index.css'`). Use that file in the next step.

- [ ] **Step 2: Append graph styles**

Append to the stylesheet identified above:

```css
/* ---- Relationship graph -------------------------------------------------- */
.graph-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 4px 12px;
}
.graph-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.graph-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border: 1px solid #444;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  font-size: 0.85rem;
}
.graph-chip .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.graph-chip.off {
  opacity: 0.4;
  border-color: #444 !important;
}
.graph-hint {
  color: #8a93a3;
  font-size: 0.85rem;
  margin-left: auto;
}
.graph-body {
  flex: 1;
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
}
.graph-empty {
  padding: 24px;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "Style the relationship graph page and toolbar (#16)"
```

---

## Task 7: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: serves on `http://localhost:5174`.

- [ ] **Step 2: Walk the acceptance criteria**

In the browser, confirm each:
- [ ] A **Graph** link appears in the sidebar and routes to `/graph`.
- [ ] Nodes are colored by category.
- [ ] More-linked pages render as larger nodes.
- [ ] Hovering a node highlights it + its direct connections and dims the rest.
- [ ] Clicking a node opens that page (`/page/:id`).
- [ ] Toggling a category chip removes/restores those nodes (and their now-dangling edges).
- [ ] Selecting a tag narrows the visible nodes.
- [ ] The arrows toggle shows/hides directional arrowheads.
- [ ] Mouse wheel zooms and drag pans.

- [ ] **Step 3: Stop the server**

Press Ctrl+C in the dev-server terminal.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Sidebar button (Task 5), color by category (Task 3 paint), size by connections (Task 3 `radiusFor` + Task 2 `degree`), click-to-navigate (Task 3 `onNodeClick`), hover highlight (Task 3 `neighbourIds`), filter by category/tag (Task 4), zoom/pan (built into `ForceGraph2D`), arrows toggle (Tasks 3+4) — all mapped.
- **Force-simulation mutation:** `GraphRoute` clones nodes/links before passing them down (Task 4, Step 1) because `react-force-graph` mutates the objects (adds `x`/`y`/`vx`/`vy` and replaces `source`/`target` with node refs). The link accessors in `GraphView` defensively handle both the raw-id and resolved-object forms.
- **No test framework:** verification is `npm run build`, `npm run lint`, and the manual checklist — consistent with the rest of this project.
