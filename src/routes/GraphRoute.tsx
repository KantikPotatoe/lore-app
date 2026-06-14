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
