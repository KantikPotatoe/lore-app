import { useEffect, useRef, useState } from 'react'
import { slugifyHeadings, relativeDepths } from '../toc'

interface TocEntry {
  id: string
  text: string
  depth: number
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
  pageId: string
}

export default function TableOfContents({ containerRef, pageId }: Props) {
  const [entries, setEntries] = useState<TocEntry[]>([])
  const [activeId, setActiveId] = useState('')
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Scan headings after the editor DOM settles, re-run on page navigation.
  useEffect(() => {
    const timer = setTimeout(() => {
      const el = containerRef.current
      if (!el) return
      const headings = Array.from(el.querySelectorAll('h1, h2, h3')) as HTMLElement[]
      const texts = headings.map((h) => h.textContent?.trim() || '')
      const levels = headings.map((h) => Number(h.tagName[1]))
      const ids = slugifyHeadings(texts)
      const depths = relativeDepths(levels)
      const toc: TocEntry[] = headings.map((h, i) => {
        h.id = ids[i]
        return { id: ids[i], text: texts[i], depth: depths[i] }
      })
      setEntries(toc)
      setActiveId(toc[0]?.id ?? '')
    }, 0)
    return () => clearTimeout(timer)
  }, [pageId, containerRef])

  // Track which heading is visible using IntersectionObserver.
  // Use .content as the root so intersection is relative to the actual scroll container.
  useEffect(() => {
    if (entries.length === 0) return
    observerRef.current?.disconnect()
    const scrollRoot = document.querySelector('.content') as HTMLElement | null
    observerRef.current = new IntersectionObserver(
      (obs) => {
        const visible = obs.filter((o) => o.isIntersecting)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      { root: scrollRoot, rootMargin: '-10% 0px -80% 0px' },
    )
    entries.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observerRef.current!.observe(el)
    })
    return () => observerRef.current?.disconnect()
  }, [entries])

  if (entries.length <= 3) return null

  return (
    <nav className="toc">
      <div className="toc-label">Contents</div>
      {entries.map((e) => (
        <a
          key={e.id}
          href={`#${e.id}`}
          className={`toc-entry toc-depth-${e.depth}${activeId === e.id ? ' active' : ''}`}
          onClick={(ev) => {
            ev.preventDefault()
            const target = document.getElementById(e.id)
            if (!target) return
            const container = document.querySelector('.content') as HTMLElement | null
            if (container) {
              const top =
                target.getBoundingClientRect().top -
                container.getBoundingClientRect().top +
                container.scrollTop -
                16
              container.scrollTo({ top, behavior: 'smooth' })
            } else {
              target.scrollIntoView({ behavior: 'smooth' })
            }
            setActiveId(e.id)
          }}
        >
          {e.text}
        </a>
      ))}
    </nav>
  )
}
