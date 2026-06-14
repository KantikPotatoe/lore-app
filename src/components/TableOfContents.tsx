import { useEffect, useRef, useState } from 'react'

interface TocEntry {
  id: string
  text: string
  level: 2 | 3
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
      const headings = Array.from(el.querySelectorAll('h2, h3')) as HTMLElement[]
      const seen = new Map<string, number>()
      const toc: TocEntry[] = headings.map((h) => {
        const level = Number(h.tagName[1]) as 2 | 3
        const base =
          h.textContent?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
          'heading'
        const count = seen.get(base) ?? 0
        seen.set(base, count + 1)
        const id = count === 0 ? base : `${base}-${count}`
        h.id = id
        return { id, text: h.textContent?.trim() || '', level }
      })
      setEntries(toc)
      setActiveId(toc[0]?.id ?? '')
    }, 0)
    return () => clearTimeout(timer)
  }, [pageId, containerRef])

  // Track which heading is visible using IntersectionObserver.
  useEffect(() => {
    if (entries.length === 0) return
    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      (obs) => {
        const visible = obs.filter((o) => o.isIntersecting)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-10% 0px -80% 0px' },
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
          className={`toc-entry toc-h${e.level}${activeId === e.id ? ' active' : ''}`}
          onClick={(ev) => {
            ev.preventDefault()
            document.getElementById(e.id)?.scrollIntoView({ behavior: 'smooth' })
            setActiveId(e.id)
          }}
        >
          {e.text}
        </a>
      ))}
    </nav>
  )
}
