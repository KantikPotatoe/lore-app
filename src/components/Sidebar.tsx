import { useMemo, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPage, categoryColor, statusColor, pageStatus, type LorePage } from '../db'

// Stable empty array so the live queries don't hand `useMemo` a fresh `[]`
// (and force a recompute) on every render while data is still loading.
const NO_PAGES: LorePage[] = []

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [search, setSearch] = useState('')

  const pages = useLiveQuery(() => db.pages.orderBy('title').toArray(), []) ?? NO_PAGES
  const templates = useLiveQuery(() => db.templates.toArray(), []) ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return pages
    return pages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [pages, search])

  // Group filtered pages by category.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const p of filtered) {
      const list = map.get(p.category) ?? []
      list.push(p)
      map.set(p.category, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  async function handleNew() {
    const id = await createPage()
    navigate(`/page/${id}`)
  }

  const currentId = location.pathname.startsWith('/page/')
    ? location.pathname.split('/page/')[1]
    : null

  return (
    <aside className="sidebar">
      <div className="brand">
        <Link to="/" className="brand-link">📖 Lore Codex</Link>
      </div>

      <nav className="top-nav">
        <Link to="/" className={location.pathname === '/' ? 'nav-item active' : 'nav-item'}>Home</Link>
        <Link to="/map" className={location.pathname.startsWith('/map') ? 'nav-item active' : 'nav-item'}>Maps</Link>
        <Link to="/templates" className={location.pathname.startsWith('/templates') ? 'nav-item active' : 'nav-item'}>Templates</Link>
      </nav>

      <div className="sidebar-actions">
        <button className="primary-btn" onClick={handleNew}>+ New page</button>
      </div>

      <input
        className="search-box"
        placeholder="Search lore…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="page-list">
        {grouped.length === 0 && <p className="empty-hint">No pages yet. Create your first one!</p>}
        {grouped.map(([category, items]) => (
          <div key={category} className="page-group">
            <div className="group-label" style={{ color: categoryColor(category) }}>
              {category} <span className="group-count">{items.length}</span>
            </div>
            {items.map((p) => (
              <Link
                key={p.id}
                to={`/page/${p.id}`}
                className={p.id === currentId ? 'page-link active' : 'page-link'}
              >
                <span className="dot" style={{ background: categoryColor(p.category) }} />
                <span className="page-link-title">{p.title}</span>
                <span
                  className="status-pip"
                  title={pageStatus(p)}
                  style={{ background: statusColor(pageStatus(p)) }}
                />
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        {templates.length} types · {pages.length} pages
      </div>
    </aside>
  )
}
