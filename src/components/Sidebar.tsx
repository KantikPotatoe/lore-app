import { useMemo } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPage, categoryColor, statusColor, pageStatus, type LorePage } from '../db'
import { getLore, currentLoreId } from '../lores'
import { showPageHover, scheduleWikiHoverClose } from '../wikiLinkHover'

// Stable empty array so the live queries don't hand `useMemo` a fresh `[]`
// (and force a recompute) on every render while data is still loading.
const NO_PAGES: LorePage[] = []

export default function Sidebar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()

  const pages = useLiveQuery(() => db.pages.orderBy('title').toArray(), []) ?? NO_PAGES
  const templates = useLiveQuery(() => db.templates.toArray(), []) ?? []
  const activeLore = useLiveQuery(() => getLore(currentLoreId()), [])
  const loreName = activeLore?.name ?? 'Lore Codex'

  // Group all pages by category.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof pages>()
    for (const p of pages) {
      const list = map.get(p.category) ?? []
      list.push(p)
      map.set(p.category, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [pages])

  async function handleNew() {
    const id = await createPage()
    navigate(`/page/${id}`)
  }

  const currentId = location.pathname.startsWith('/page/')
    ? location.pathname.split('/page/')[1]
    : null

  const browseCategory = location.pathname.startsWith('/browse/')
    ? decodeURIComponent(location.pathname.split('/browse/')[1])
    : null

  return (
    <aside className="sidebar">
      <div className="brand">
        <Link to="/" className="brand-link" title="Switch world">
          {loreName} ⇄
        </Link>
      </div>

      <nav className="top-nav">
        <Link to="/home" className={location.pathname === '/home' ? 'nav-item active' : 'nav-item'}>Home</Link>
        <Link to="/map" className={location.pathname.startsWith('/map') ? 'nav-item active' : 'nav-item'}>Maps</Link>
        <Link to="/graph" className={location.pathname.startsWith('/graph') ? 'nav-item active' : 'nav-item'}>Graph</Link>
        <Link to="/timeline" className={location.pathname.startsWith('/timeline') ? 'nav-item active' : 'nav-item'}>Timeline</Link>
        <Link to="/templates" className={location.pathname.startsWith('/templates') ? 'nav-item active' : 'nav-item'}>Templates</Link>
      </nav>

      <div className="sidebar-actions">
        <button className="primary-btn" onClick={handleNew}>+ New page</button>
      </div>

      <input
        className="search-box"
        placeholder="Search lore…"
        readOnly
        onFocus={onOpenSearch}
        onClick={onOpenSearch}
      />

      <div className="page-list">
        {grouped.length === 0 && <p className="empty-hint">No pages yet. Create your first one!</p>}
        {grouped.map(([category, items]) => (
          <div key={category} className="page-group">
            <Link
              to={`/browse/${encodeURIComponent(category)}`}
              className={`group-label${browseCategory === category ? ' active' : ''}`}
              style={{ color: categoryColor(category) }}
            >
              {category} <span className="group-count">{items.length}</span>
            </Link>
            {items.map((p) => (
              <Link
                key={p.id}
                to={`/page/${p.id}`}
                className={p.id === currentId ? 'page-link active' : 'page-link'}
                onMouseEnter={(e) => showPageHover(p.id, p.title, e.currentTarget.getBoundingClientRect())}
                onMouseLeave={scheduleWikiHoverClose}
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
