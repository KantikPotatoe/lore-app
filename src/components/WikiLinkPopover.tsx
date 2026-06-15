import { useEffect, useState } from 'react'
import { useWikiHoverTarget, cancelWikiHoverClose, scheduleWikiHoverClose } from '../wikiLinkHover'
import { findPageIdByTitle, categoryColor, db } from '../db'
import type { LorePage } from '../db'

type PageState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'found'; page: LorePage }

export default function WikiLinkPopover() {
  const target = useWikiHoverTarget()
  const [pageState, setPageState] = useState<PageState>({ status: 'idle' })

  useEffect(() => {
    if (!target) { setPageState({ status: 'idle' }); return }
    setPageState({ status: 'loading' })
    findPageIdByTitle(target.title).then(async (id) => {
      if (!id) { setPageState({ status: 'missing' }); return }
      const page = await db.pages.get(id)
      setPageState(page ? { status: 'found', page } : { status: 'missing' })
    })
  }, [target])

  if (!target) return null

  const above = target.rect.bottom + 180 > window.innerHeight
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(target.rect.left, window.innerWidth - 320),
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
