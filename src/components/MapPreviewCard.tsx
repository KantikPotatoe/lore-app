import { categoryColor } from '../db'
import type { LorePage } from '../db'

interface MapPreviewCardProps {
  label: string
  page: LorePage | null
  isPortal: boolean
  onEdit: () => void
  onOpenPage?: () => void
  onEnterMap?: () => void
  onClose: () => void
}

/** Read-only preview shown when a pin/region is clicked, reusing the
 *  WikiLinkPopover visual pattern. Edit opens the full corner edit panel. */
export default function MapPreviewCard({
  label, page, isPortal, onEdit, onOpenPage, onEnterMap, onClose,
}: MapPreviewCardProps) {
  return (
    <div className="wiki-hover-popover map-preview-card" role="dialog" aria-label="Marker preview">
      {page?.infobox?.image && <img className="popover-image" src={page.infobox.image} alt="" />}
      <div className="popover-body">
        <div className="map-preview-head">
          <span className="map-preview-label">{label}</span>
          <button className="tag-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {page ? (
          <>
            <div className="popover-header">
              <span className="popover-chip" style={{ background: categoryColor(page.category) }}>
                {page.category}
              </span>
            </div>
            <div className="popover-title">{page.title}</div>
            {page.summary && <div className="popover-summary">{page.summary}</div>}
          </>
        ) : (
          <div className="popover-broken">Not linked to a page</div>
        )}
        <div className="map-preview-actions">
          <button className="mini-btn" onClick={onEdit}>✎ Edit</button>
          {page && onOpenPage && (
            <button className="mini-btn" onClick={onOpenPage}>Open page →</button>
          )}
          {isPortal && onEnterMap && (
            <button className="mini-btn" onClick={onEnterMap}>Enter map →</button>
          )}
        </div>
      </div>
    </div>
  )
}
