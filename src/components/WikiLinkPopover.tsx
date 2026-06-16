import { useEffect, useState } from 'react'
import { useWikiHoverTarget, cancelWikiHoverClose, scheduleWikiHoverClose } from '../wikiLinkHover'
import { findPageIdByTitle, categoryColor, db } from '../db'
import type { LorePage } from '../db'

type PageState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'found'; page: LorePage }

/** The resolved outcome of looking a title up — paired with the title it belongs
 *  to, so a stale result for a previous hover is never shown for a new one. */
type Resolved = Extract<PageState, { status: 'missing' } | { status: 'found' }>

export default function WikiLinkPopover() {
  const target = useWikiHoverTarget()
  const [resolved, setResolved] = useState<{ title: string; state: Resolved } | null>(null)

  // Only ever set state from the async resolution — synchronous resets (idle /
  // loading) are derived during render instead, so the effect never triggers a
  // cascading re-render.
  useEffect(() => {
    if (!target) return
    let cancelled = false
    findPageIdByTitle(target.title).then(async (id) => {
      if (cancelled) return
      const page = id ? await db.pages.get(id) : undefined
      if (cancelled) return
      setResolved({ title: target.title, state: page ? { status: 'found', page } : { status: 'missing' } })
    })
    return () => { cancelled = true }
  }, [target])

  if (!target) return null

  // Show the resolved card only if it belongs to the title currently hovered;
  // otherwise we're still loading this one.
  const pageState: PageState =
    resolved && resolved.title === target.title ? resolved.state : { status: 'loading' }

  const above = target.rect.bottom + 180 > window.innerHeight
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(0, Math.min(target.rect.left, window.innerWidth - 320)),
    ...(above
      ? { bottom: window.innerHeight - target.rect.top + 8 }
      : { top: target.rect.bottom + 8 }),
    zIndex: 950,
  }

  return (
    <div
      className="wiki-hover-popover"
      style={style}
      onMouseEnter={cancelWikiHoverClose}
      onMouseLeave={scheduleWikiHoverClose}
    >
      {pageState.status === 'loading' && (
        <span className="popover-loading">…</span>
      )}
      {pageState.status === 'missing' && (
        <>
          <span className="popover-broken">Page not found</span>
          <div className="popover-title">{target.title}</div>
        </>
      )}
      {pageState.status === 'found' && (
        <>
          <div className="popover-header">
            <span
              className="popover-chip"
              style={{ background: categoryColor(pageState.page.category) }}
            >
              {pageState.page.category}
            </span>
          </div>
          <div className="popover-title">{pageState.page.title}</div>
          {pageState.page.summary && (
            <div className="popover-summary">{pageState.page.summary}</div>
          )}
        </>
      )}
    </div>
  )
}
