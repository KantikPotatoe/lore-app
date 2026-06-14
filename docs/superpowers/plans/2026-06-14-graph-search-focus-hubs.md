# Graph Search + Focus + Hubs/Orphans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add node search, single-click focus/ego mode, and a collapsible hubs/orphans panel to the relationship graph, unified by a single "select a node" action with a camera glide and a selection pulse.

**Architecture:** `GraphRoute` owns selection (`selectedId`), search state, and panel open state, and derives hubs/orphans from the already-filtered node set. `GraphView` owns canvas rendering, the focus neighbour-set, click/double-click disambiguation, the imperative camera glide (via the force-graph ref), and the time-based pulse/dim animations painted in `nodeCanvasObject`. A small presentational `HubsOrphansPanel` renders the two lists.

**Tech Stack:** React + TypeScript, Vite, `react-force-graph-2d@^1.29.1`, Dexie (unchanged here). No test framework exists in this repo, so each task is verified with `npm run build` (type-check + bundle) and a manual check in the dev server (`npm run dev`, port 5174).

---

## Testing Note

There is no unit-test harness in this project. "Verify" steps therefore use:
- **`npm run build`** — runs `tsc` then Vite bundle; this is the type-check gate and must pass.
- **Manual check** — exact click-by-click steps in the running dev server.

Commit after each task once both gates pass.

## File Structure

- **Modify** `src/components/GraphView.tsx` — selection-driven focus, click/double-click split, camera glide, pulse + dim-fade animations. New props: `selectedId`, `onSelect`.
- **Modify** `src/routes/GraphRoute.tsx` — lift `selectedId`, add search input + type-ahead, panel toggle, derive hubs/orphans, lay out canvas + panel side by side.
- **Create** `src/components/HubsOrphansPanel.tsx` — presentational list of hubs and orphans with an `onSelect` callback.
- **Modify** `src/index.css` — `.graph-body` becomes a flex row wrapper; add `.graph-canvas`, `.graph-panel`, `.graph-search` styles.

---

## Task 1: Selection-driven focus + click/double-click split

**Files:**
- Modify: `src/components/GraphView.tsx`
- Modify: `src/routes/GraphRoute.tsx`

Generalise the existing hover neighbour-set so it also serves a sticky `selectedId`, and split single-click (focus) from double-click (navigate).

- [ ] **Step 1: Add a reusable neighbour helper in `GraphView.tsx`**

Replace the `endId` helper region by adding, just below it, a function that returns the id + direct neighbours of a given id:

```tsx
// The focus id (hover or selection) plus its direct neighbours. Everything else
// is dimmed.
function neighboursOf(id: string, links: GLink[]): Set<string> {
  const set = new Set<string>([id])
  for (const l of links) {
    const s = endId(l.source)
    const t = endId(l.target)
    if (s === id) set.add(t)
    if (t === id) set.add(s)
  }
  return set
}
```

- [ ] **Step 2: Accept `selectedId` / `onSelect` props and merge hover + selection**

Change the component signature and replace the `neighbourIds` memo:

```tsx
export default function GraphView({
  data,
  showArrows,
  selectedId,
  onSelect,
}: {
  data: GraphData
  showArrows: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const navigate = useNavigate()
  const [hoverId, setHoverId] = useState<string | null>(null)

  // Hover takes precedence over the sticky selection for what gets highlighted.
  const focusId = hoverId ?? selectedId
  const neighbourIds = useMemo(
    () => (focusId ? neighboursOf(focusId, data.links as GLink[]) : null),
    [focusId, data.links],
  )
```

(The rest of `paintNode` / `linkColor` already read `neighbourIds` and need no change yet.)

- [ ] **Step 3: Split single-click (focus) from double-click (navigate)**

Add a click-timer ref near the top of the component body:

```tsx
  // react-force-graph only emits single clicks; disambiguate a double-click
  // (navigate) from a single click (focus) with a short timer.
  const clickTimer = useRef<number | null>(null)
```

Replace the `onNodeClick` prop on `<ForceGraph2D>` and add `onBackgroundClick`:

```tsx
      onNodeClick={(node: GNode) => {
        const id = String(node.id)
        if (clickTimer.current != null) {
          window.clearTimeout(clickTimer.current)
          clickTimer.current = null
          navigate(`/page/${id}`)
        } else {
          clickTimer.current = window.setTimeout(() => {
            clickTimer.current = null
            onSelect(id)
          }, 250)
        }
      }}
      onBackgroundClick={() => onSelect(null)}
```

Add `useRef` to the React import at the top:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
```

(`useEffect` is added now; it is used in Task 2.)

- [ ] **Step 4: Pass selection state from `GraphRoute.tsx`**

Add state below the existing `showArrows` state:

```tsx
  const [selectedId, setSelectedId] = useState<string | null>(null)
```

Update the render to pass it down:

```tsx
        <GraphView
          data={filtered}
          showArrows={showArrows}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
```

- [ ] **Step 5: Verify type-check + build**

Run: `npm run build`
Expected: completes with no TypeScript errors, `dist/` written.

- [ ] **Step 6: Manual check**

Run: `npm run dev`, open `http://localhost:5174/#/` (or navigate to the Graph). With a few linked pages:
- Single-click a node → it stays put and its neighbours stay bright while the rest dim (sticky focus); no navigation.
- Double-click a node → navigates to that page.
- Click empty space → focus clears (all nodes bright again).

- [ ] **Step 7: Commit**

```bash
git add src/components/GraphView.tsx src/routes/GraphRoute.tsx
git commit -m "feat(graph): single-click focus, double-click navigate"
```

---

## Task 2: Camera glide to the selected node

**Files:**
- Modify: `src/components/GraphView.tsx`

When `selectedId` changes, ease the camera to center the node.

- [ ] **Step 1: Add a ref to the force graph**

Add the import for the ref type and a ref. Update the import line:

```tsx
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from 'react-force-graph-2d'
```

Inside the component body, add:

```tsx
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined)
```

Attach it to the element:

```tsx
    <ForceGraph2D<GraphNode, GraphLink>
      ref={fgRef}
      graphData={data}
```

- [ ] **Step 2: Glide the camera on selection change**

Add this effect (uses the `useEffect` imported in Task 1). The simulation mutates nodes in place with `x`/`y`, so read coordinates off `data.nodes`:

```tsx
  // Ease the camera to the selected node. Coordinates are populated on the
  // node objects by the running simulation.
  useEffect(() => {
    if (!selectedId || !fgRef.current) return
    const node = (data.nodes as GNode[]).find((n) => String(n.id) === selectedId)
    if (node?.x == null || node?.y == null) return
    fgRef.current.centerAt(node.x, node.y, 450)
    fgRef.current.zoom(2.5, 450)
  }, [selectedId, data.nodes])
```

- [ ] **Step 3: Verify type-check + build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. On the Graph, single-click a node away from center → the camera smoothly pans and zooms to center it over ~0.45s (not an instant jump).

- [ ] **Step 5: Commit**

```bash
git add src/components/GraphView.tsx
git commit -m "feat(graph): glide camera to selected node"
```

---

## Task 3: Selection pulse + dim-fade animation

**Files:**
- Modify: `src/components/GraphView.tsx`

`react-force-graph`'s render loop repaints every frame, so animate by reading elapsed time inside `paintNode`. Both animations are driven by timestamps held in refs.

- [ ] **Step 1: Track animation timestamps**

Add refs in the component body (below `fgRef`):

```tsx
  // Timestamp of the most recent selection, for the one-shot pulse.
  const pulseStart = useRef<number>(0)
  const pulseId = useRef<string | null>(null)
  // Eased focus strength 0..1 and the last frame time, for the dim fade.
  const focusAmt = useRef<number>(0)
  const lastFrame = useRef<number>(0)
```

Add an effect to arm the pulse when the selection changes:

```tsx
  useEffect(() => {
    if (selectedId) {
      pulseId.current = selectedId
      pulseStart.current = performance.now()
    }
  }, [selectedId])
```

- [ ] **Step 2: Animate the dim-fade**

Replace the `dimmed`/`globalAlpha` lines in `paintNode`. Compute an eased focus amount that ramps toward 1 while a focus exists and back to 0 when it clears, then use it to interpolate the dim alpha:

```tsx
  const paintNode = useCallback(
    (node: GNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0

      // Ease focusAmt toward 1 when something is focused, else back to 0.
      const now = performance.now()
      const dt = lastFrame.current ? now - lastFrame.current : 16
      lastFrame.current = now
      const target = neighbourIds != null ? 1 : 0
      const step = dt / 200 // ~200ms full fade
      focusAmt.current += Math.sign(target - focusAmt.current) * step
      focusAmt.current = Math.max(0, Math.min(1, focusAmt.current))

      const isDim = neighbourIds != null && !neighbourIds.has(String(node.id))
      const baseAlpha = isDim ? 1 - 0.85 * focusAmt.current : 1

      let r = radiusFor(node.degree)
      // One-shot pop on the just-selected node.
      if (pulseId.current === String(node.id)) {
        const t = (now - pulseStart.current) / 300
        if (t < 1) {
          const ease = 1 - Math.pow(1 - t, 3) // easeOutCubic
          r *= 1 + 0.4 * (1 - ease) // starts ~1.4x, settles to 1x
        }
      }

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
    },
    [neighbourIds],
  )
```

- [ ] **Step 3: Verify type-check + build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. On the Graph:
- Single-click a node → it briefly pops larger then settles (~0.3s), and the rest of the graph fades down rather than snapping.
- Click empty space → the dimmed nodes fade back up smoothly.

- [ ] **Step 5: Commit**

```bash
git add src/components/GraphView.tsx
git commit -m "feat(graph): selection pulse and dim-fade animation"
```

---

## Task 4: Node search in the toolbar

**Files:**
- Modify: `src/routes/GraphRoute.tsx`
- Modify: `src/index.css`

A type-ahead that selects (focuses + glides to) a matching page.

- [ ] **Step 1: Add search state and matches**

In `GraphRoute`, add state below `selectedId`:

```tsx
  const [query, setQuery] = useState('')
```

Add a memo for matches (below the `filtered` memo), matching titles in the filtered set:

```tsx
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return filtered.nodes
      .filter((n) => n.title.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, filtered])
```

- [ ] **Step 2: Add the search UI to the toolbar**

Insert this just before the tag `<select>` in the toolbar JSX. Selecting a match focuses the node and clears the field:

```tsx
        <div className="graph-search">
          <input
            type="text"
            placeholder="Search pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('')
              if (e.key === 'Enter' && matches.length > 0) {
                setSelectedId(matches[0].id)
                setQuery('')
              }
            }}
          />
          {matches.length > 0 && (
            <ul className="graph-search-results">
              {matches.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setSelectedId(n.id)
                      setQuery('')
                    }}
                  >
                    <span className="dot" style={{ background: categoryColor(n.category) }} />
                    {n.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
```

- [ ] **Step 3: Re-trigger glide when re-selecting the same node**

Selecting a node that is already `selectedId` would not change state, so the camera would not re-glide. Make selection from search always re-fire by clearing first. Replace the two `setSelectedId(...)` calls in Step 2 with a small helper defined above the return:

```tsx
  function selectNode(id: string) {
    setSelectedId(null)
    // Defer so the GraphView effect sees a real change and re-glides.
    requestAnimationFrame(() => setSelectedId(id))
  }
```

Then use `selectNode(matches[0].id)` / `selectNode(n.id)` in the handlers above.

- [ ] **Step 4: Style the search box**

Add to `src/index.css` after the `.graph-hint` rule:

```css
.graph-search {
  position: relative;
}
.graph-search input {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--panel);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 0.85rem;
}
.graph-search-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 10;
  min-width: 200px;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.graph-search-results button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  background: none;
  color: var(--ink);
  font-family: var(--sans);
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
}
.graph-search-results button:hover { background: var(--panel-2); }
.graph-search-results .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
```

- [ ] **Step 5: Verify type-check + build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 6: Manual check**

Run: `npm run dev`. On the Graph: type part of a page title → a dropdown of up to 8 matches appears; clicking one (or pressing Enter) glides+focuses that node and clears the box. Esc clears the box.

- [ ] **Step 7: Commit**

```bash
git add src/routes/GraphRoute.tsx src/index.css
git commit -m "feat(graph): toolbar node search with type-ahead"
```

---

## Task 5: Hubs / orphans panel

**Files:**
- Create: `src/components/HubsOrphansPanel.tsx`
- Modify: `src/routes/GraphRoute.tsx`
- Modify: `src/index.css`

A collapsible right panel listing the top hubs and all orphans; entries select the node.

- [ ] **Step 1: Create the presentational panel**

Create `src/components/HubsOrphansPanel.tsx`:

```tsx
import { categoryColor, type GraphNode } from '../db'

export default function HubsOrphansPanel({
  hubs,
  orphans,
  onSelect,
}: {
  hubs: GraphNode[]
  orphans: GraphNode[]
  onSelect: (id: string) => void
}) {
  return (
    <aside className="graph-panel">
      <section>
        <h3>Hubs</h3>
        {hubs.length === 0 ? (
          <p className="muted">No connected pages yet.</p>
        ) : (
          <ul>
            {hubs.map((n) => (
              <li key={n.id}>
                <button onClick={() => onSelect(n.id)}>
                  <span className="dot" style={{ background: categoryColor(n.category) }} />
                  <span className="t">{n.title}</span>
                  <span className="deg">{n.degree}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>Orphans <span className="count">{orphans.length}</span></h3>
        {orphans.length === 0 ? (
          <p className="muted">Every page is linked. 🎉</p>
        ) : (
          <ul>
            {orphans.map((n) => (
              <li key={n.id}>
                <button onClick={() => onSelect(n.id)}>
                  <span className="dot" style={{ background: categoryColor(n.category) }} />
                  <span className="t">{n.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
```

- [ ] **Step 2: Derive hubs/orphans and panel state in `GraphRoute`**

Add the import at the top:

```tsx
import HubsOrphansPanel from '../components/HubsOrphansPanel'
```

Add state below `query`:

```tsx
  const [panelOpen, setPanelOpen] = useState(false)
```

Add memos below `matches` (computed from the filtered set so they respect filters):

```tsx
  const hubs = useMemo(
    () => [...filtered.nodes].sort((a, b) => b.degree - a.degree).slice(0, 10).filter((n) => n.degree > 0),
    [filtered],
  )
  const orphans = useMemo(
    () => filtered.nodes.filter((n) => n.degree === 0).sort((a, b) => a.title.localeCompare(b.title)),
    [filtered],
  )
```

- [ ] **Step 3: Add the panel toggle button to the toolbar**

Insert after the arrows toggle button, before the `.graph-hint` span:

```tsx
        <button
          className={`ghost-btn${panelOpen ? ' active' : ''}`}
          onClick={() => {
            setPanelOpen((v) => !v)
            // Let the canvas re-measure its parent after the layout changes.
            requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
          }}
        >
          {panelOpen ? '☰ Hide lists' : '☰ Hubs & orphans'}
        </button>
```

- [ ] **Step 4: Lay out canvas + panel side by side**

Replace the existing `.graph-body` block:

```tsx
      <div className="graph-body">
        <div className="graph-canvas">
          <GraphView
            data={filtered}
            showArrows={showArrows}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        {panelOpen && (
          <HubsOrphansPanel hubs={hubs} orphans={orphans} onSelect={selectNode} />
        )}
      </div>
```

(`selectNode` is the helper from Task 4 — it clears then re-sets `selectedId` so the camera always re-glides.)

- [ ] **Step 5: Style the layout and panel**

In `src/index.css`, replace the `.graph-body` rule with a flex row and add the new rules:

```css
.graph-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
}
.graph-canvas {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.graph-panel {
  width: 240px;
  flex: none;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
}
.graph-panel h3 {
  margin: 0 0 8px;
  font-size: 0.95rem;
}
.graph-panel section + section { margin-top: 18px; }
.graph-panel .count {
  color: var(--ink-faint);
  font-weight: normal;
  font-size: 0.85rem;
}
.graph-panel ul { margin: 0; padding: 0; list-style: none; }
.graph-panel li button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 6px;
  border: none;
  background: none;
  color: var(--ink);
  font-family: var(--sans);
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
}
.graph-panel li button:hover { background: var(--panel-2); }
.graph-panel .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.graph-panel .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.graph-panel .deg { color: var(--ink-faint); font-size: 0.8rem; }
```

- [ ] **Step 6: Verify type-check + build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Manual check**

Run: `npm run dev`. On the Graph:
- Click "☰ Hubs & orphans" → a right panel opens, the canvas shrinks to fit, and the graph re-fills its new width (no clipping).
- Hubs lists up to 10 most-connected pages with their link counts; clicking one glides+focuses it.
- Orphans lists every unlinked page with a count; clicking one centers the lone dot.
- Toggle a category chip off → both lists update to exclude that type.
- Click "☰ Hide lists" → panel closes and the graph returns to full width.

- [ ] **Step 8: Commit**

```bash
git add src/components/HubsOrphansPanel.tsx src/routes/GraphRoute.tsx src/index.css
git commit -m "feat(graph): collapsible hubs and orphans panel"
```

---

## Self-Review Notes

- **Spec coverage:** search (Task 4), focus/ego with 1-hop dim (Tasks 1+3), single-click vs double-click (Task 1), hubs top-10 + orphans from filtered set (Task 5), panel right/collapsible/default-closed (Task 5), unified "select" from click/search/panel via `selectNode`/`setSelectedId` (Tasks 1/4/5), camera glide (Task 2), pulse + dim-fade (Task 3). All covered.
- **Type consistency:** `selectedId: string | null`, `onSelect: (id: string | null) => void`, panel `onSelect: (id: string) => void` (never passed null), `neighboursOf(id, links)`, `selectNode(id)` used consistently across tasks.
- **No placeholders:** every code step shows full code; verification uses real commands.
- **Known trade-off:** the panel `onSelect` is non-null while `GraphView.onSelect` is nullable (it also handles background-click clear). Both are satisfied because `setSelectedId` accepts `string | null` and `selectNode` accepts `string`.
```
