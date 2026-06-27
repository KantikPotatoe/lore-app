import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import BrowseCard from '../components/BrowseCard'
import EmptyState from '../components/EmptyState'

const NO_PAGES: import('../db').LorePage[] = []

export default function TagRoute() {
  const { tag = '' } = useParams<{ tag: string }>()

  const pages =
    useLiveQuery(
      () => db.pages.filter((p) => p.tags.includes(tag)).sortBy('title'),
      [tag],
    ) ?? NO_PAGES

  return (
    <div className="browse-route">
      <div className="browse-header">
        <h1 className="browse-title">
          #{tag}
          <span className="browse-count">{pages.length}</span>
        </h1>
      </div>

      {pages.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title={`No pages tagged #${tag}`}
          message="Add this tag to a page to see it listed here."
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
