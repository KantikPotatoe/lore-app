import type { ReactNode } from 'react'
import type { LorePage } from '../db'
import BrowseCard from './BrowseCard'
import EmptyState from './EmptyState'

/** Empty-state copy shown when a browse screen has no pages. */
export interface BrowseEmpty {
  icon: string
  title: string
  message: string
}

/** Shared layout for the "list of pages" screens (a category, a tag): a titled
 *  header with a live count and optional action, then either a card grid or an
 *  empty state. CategoryRoute / TagRoute differ only in the query and this copy. */
export default function BrowseGrid({
  title,
  titleColor,
  action,
  pages,
  empty,
}: {
  /** Heading content (e.g. a category name, or `#tag`). */
  title: ReactNode
  /** Optional accent colour for the heading. */
  titleColor?: string
  /** Optional header control, e.g. a "+ New" button. */
  action?: ReactNode
  pages: LorePage[]
  empty: BrowseEmpty
}) {
  return (
    <div className="browse-route">
      <div className="browse-header">
        <h1 className="browse-title" style={titleColor ? { color: titleColor } : undefined}>
          {title}
          <span className="browse-count">{pages.length}</span>
        </h1>
        {action}
      </div>

      {pages.length === 0 ? (
        <EmptyState icon={empty.icon} title={empty.title} message={empty.message} />
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
