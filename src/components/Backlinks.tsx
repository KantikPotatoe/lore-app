import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getBacklinks, categoryColor } from '../db'

// Shows every other page that links to this one (via [[wiki links]] in their
// body or infobox). Re-runs automatically whenever any page changes.
export default function Backlinks({ pageId }: { pageId: string }) {
  const backlinks = useLiveQuery(() => getBacklinks(pageId), [pageId])

  // While loading, or when nothing links here, keep the panel quiet.
  if (!backlinks || backlinks.length === 0) {
    return (
      <div className="backlinks">
        <div className="backlinks-head">Linked from</div>
        <p className="backlinks-empty">No other pages link here yet.</p>
      </div>
    )
  }

  return (
    <div className="backlinks">
      <div className="backlinks-head">Linked from <span className="backlinks-count">{backlinks.length}</span></div>
      <ul className="backlinks-list">
        {backlinks.map((p) => (
          <li key={p.id}>
            <Link to={`/page/${p.id}`} className="backlink">
              <span className="dot" style={{ background: categoryColor(p.category) }} />
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
