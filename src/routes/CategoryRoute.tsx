import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPage, categoryColor } from '../db'
import EmptyState from '../components/EmptyState'
import BrowseCard from '../components/BrowseCard'

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
        <EmptyState
          icon="📭"
          title={`No ${category} pages yet`}
          message={`Use “+ New ${category}” above to create the first one.`}
        />
      ) : (
        <div className="browse-grid">
          {pages.map((page) => (
            <BrowseCard key={page.id} page={page} />
          ))}
        </div>
      )}
    </div>
  )
}
