import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, buildGraphData, categoryColor, createPage, type GraphNode, type LorePage } from '../db'
import { useGraphPrefs } from '../useGraphPrefs'
import GraphView from '../components/GraphView'
import EmptyState from '../components/EmptyState'
import HubsOrphansPanel from '../components/HubsOrphansPanel'
import ConfirmDialog from '../components/ConfirmDialog'

const NO_PAGES: LorePage[] = []

export default function GraphRoute() {
  const pages = useLiveQuery(() => db.pages.toArray(), []) ?? NO_PAGES

  const full = useMemo(() => buildGraphData(pages), [pages])

  const navigate = useNavigate()
  const {
    hidden, toggleCategory,
    showArrows, setShowArrows,
    showGhosts, setShowGhosts,
    panelOpen, setPanelOpen,
    tag, setTag,
    cam, setCam,
    pins, pinNode, clearPins, prunePins,
  } = useGraphPrefs()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [pendingGhost, setPendingGhost] = useState<string | null>(null)

  // All categories / tags present in the data, for the toolbar controls.
  // Exclude ghost nodes so the filter chips only show real page categories/tags.
  const categories = useMemo(
    () => [...new Set(full.nodes.filter((n) => !n.ghost).map((n) => n.category))].sort((a, b) => a.localeCompare(b)),
    [full],
  )
  const tags = useMemo(
    () => [...new Set(full.nodes.filter((n) => !n.ghost).flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b)),
    [full],
  )

  const filtered = useMemo(() => {
    const nodes = full.nodes.filter(
      (n) =>
        (showGhosts || !n.ghost) &&
        !hidden.has(n.category) &&
        (tag === '' || n.tags.includes(tag)),
    )
    const visible = new Set(nodes.map((n) => n.id))
    const links = full.links.filter((l) => visible.has(l.source) && visible.has(l.target))
    return {
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    }
  }, [full, hidden, tag, showGhosts])

  // Seed pinned positions imperatively rather than through the `filtered` memo,
  // so a live drag (which updates `pins`) doesn't recreate the graph data and
  // reheat the whole simulation. The running sim reads fx/fy off these same node
  // objects on its next tick; on a filter change `filtered` is rebuilt fresh and
  // this re-applies the pins. Restore-on-load works the same way once pins load.
  useEffect(() => {
    for (const n of filtered.nodes) {
      const pin = pins[n.id]
      if (pin) {
        const node = n as GraphNode & { fx?: number; fy?: number }
        // eslint-disable-next-line react-hooks/immutability
        node.fx = pin.x
        node.fy = pin.y
      }
    }
  }, [filtered, pins])

  // Drop saved pins for pages that no longer exist.
  useEffect(() => {
    if (full.nodes.length > 0) prunePins(new Set(full.nodes.map((n) => n.id)))
  }, [full, prunePins])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return filtered.nodes
      .filter((n) => n.title.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, filtered])

  const hubs = useMemo(
    () => [...filtered.nodes].sort((a, b) => b.degree - a.degree).slice(0, 10).filter((n) => n.degree > 0),
    [filtered],
  )
  const orphans = useMemo(
    () => filtered.nodes.filter((n) => n.degree === 0).sort((a, b) => a.title.localeCompare(b.title)),
    [filtered],
  )

  function selectNode(id: string) {
    setSelectedId(null)
    // Defer so the GraphView effect sees a real change and re-glides.
    requestAnimationFrame(() => setSelectedId(id))
  }

  async function createGhost(title: string) {
    setPendingGhost(null)
    const id = await createPage({ title, status: 'Stub' })
    navigate(`/page/${id}`)
  }

  if (pages.length === 0) {
    return (
      <EmptyState
        icon="🕸️"
        title="No connections to map yet"
        message={<>Create some pages and link them with <code>[[wiki links]]</code> to see your world take shape here.</>}
      />
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

        <div className="graph-search">
          <input
            type="text"
            placeholder="Search pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('')
              if (e.key === 'Enter' && matches.length > 0) {
                selectNode(matches[0].id)
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
                      selectNode(n.id)
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

        <select value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <button
          className={`ghost-btn${showArrows ? ' active' : ''}`}
          onClick={() => setShowArrows(!showArrows)}
        >
          {showArrows ? '➜ Arrows on' : '➜ Arrows off'}
        </button>

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

        <button
          className={`ghost-btn${panelOpen ? ' active' : ''}`}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          {panelOpen ? '☰ Hide lists' : '☰ Hubs & orphans'}
        </button>

        <span className="graph-hint">
          {filtered.nodes.length} pages · {filtered.links.length} links
          {filtered.nodes.length > 300 && ' — filter by type or tag to declutter'}
        </span>
      </div>

      <div className="graph-body">
        <div className="graph-canvas">
          <GraphView
            data={filtered}
            showArrows={showArrows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onGhostClick={setPendingGhost}
            onPinNode={pinNode}
            initialCam={cam}
            onCamChange={setCam}
          />
        </div>
        {panelOpen && (
          <HubsOrphansPanel hubs={hubs} orphans={orphans} onSelect={selectNode} />
        )}
      </div>

      <ConfirmDialog
        open={pendingGhost !== null}
        title="Create page?"
        confirmLabel="Create"
        onConfirm={() => pendingGhost && createGhost(pendingGhost)}
        onCancel={() => setPendingGhost(null)}
      >
        "{pendingGhost}" doesn't exist yet. Create it?
      </ConfirmDialog>
    </div>
  )
}
