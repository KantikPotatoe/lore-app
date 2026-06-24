import { useEffect } from 'react'
import type { PageImage } from '../db'

interface Props {
  images: PageImage[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
}

/** Fullscreen image viewer with prev/next (arrows + ←/→ keys) and Esc-to-close.
 *  Self-contained: it takes the list + active index + callbacks, so it knows
 *  nothing about Dexie and works in both view and edit mode. Navigation clamps
 *  at the ends (no wrap). */
export default function Lightbox({ images, index, onClose, onNavigate }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onNavigate(Math.max(0, index - 1))
      else if (e.key === 'ArrowRight') onNavigate(Math.min(images.length - 1, index + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onClose, onNavigate])

  const image = images[index]
  if (!image) return null
  const atStart = index === 0
  const atEnd = index === images.length - 1

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose} aria-label="Close">×</button>
        {!atStart && (
          <button className="lightbox-nav lightbox-prev" onClick={() => onNavigate(index - 1)} aria-label="Previous">‹</button>
        )}
        <figure className="lightbox-figure">
          <img src={image.dataUrl} alt={image.caption} />
          {image.caption && <figcaption>{image.caption}</figcaption>}
        </figure>
        {!atEnd && (
          <button className="lightbox-nav lightbox-next" onClick={() => onNavigate(index + 1)} aria-label="Next">›</button>
        )}
      </div>
    </div>
  )
}
