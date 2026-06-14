import { useNavigate, useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPage, categoryColor, statusColor, pageStatus } from '../db'

const NO_PAGES: import('../db').LorePage[] = []

export default function CategoryRoute() {
  const { category = '' } = useParams<{ category: string }>()
  const navigate = useNavigate()

  const pages =
    useLiveQuery(
      () => db.pages.where('category').equals(category).sortBy('title'),
      [category],
    ) ?? NO_PAGES

  async function handleNew() {
    const id = await createPage({ category })
    navigate(`/page/${id}`)
  }

  const color = categoryColor(category)

  return (
    <div className="browse-route">
      <div className="browse-header">
        <h1 className="browse-title" style={{ color }}>
          {category}
          <span className="browse-count">{pages.length}</span>
        </h1>
        <button className="primary-btn" onClick={handleNew}>
          + New {category}
        </button>
      </div>

      {pages.length === 0 ? (
        <p className="browse-empty">
          No {category} pages yet —{' '}
          <button className="link-btn" onClick={handleNew}>
            create the first one
          </button>
          !
        </p>
      ) : (
        <div className="browse-grid">
          {pages.map((page) => (
            <Link key={page.id} to={`/page/${page.id}`} className="browse-card">
              <div className="browse-card-img">
                {page.infobox?.image ? (
                  <img src={page.infobox.image} alt={page.title} />
                ) : (
                  <div
                    className="browse-card-placeholder"
                    style={{ background: color + '33' }}
                  >
                    <span style={{ color }}>{page.title.charAt(0).toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="browse-card-body">
                <div className="browse-card-name">{page.title}</div>
                {page.summary && (
                  <div className="browse-card-summary">{page.summary}</div>
                )}
                <span
                  className="browse-card-status"
                  style={{ borderColor: statusColor(pageStatus(page)), color: statusColor(pageStatus(page)) }}
                >
                  {pageStatus(page)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
