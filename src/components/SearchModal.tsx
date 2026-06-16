import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchPages, highlightSnippet } from '../search'
import { categoryColor } from '../db'
import { showPageHover, scheduleWikiHoverClose } from '../wikiLinkHover'

interface Props {
  onClose: () => void
}

export default function SearchModal({ onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => searchPages(query), [query])

  // Reset the highlighted row whenever the query changes. Adjusting state during
  // render (rather than in an effect) avoids a redundant re-render — see
  // react.dev "You Might Not Need an Effect".
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setSelected(0)
  }

  useEffect(() => { inputRef.current?.focus() }, [])

  function go(id: string) {
    navigate(`/page/${id}`)
    onClose()
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && results[selected]) go(results[selected].id)
  }

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="search-modal-input"
          placeholder="Search pages…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
        />
        {results.length > 0 && (
          <div className="search-results">
            {results.map((r, i) => (
              <div
                key={r.id}
                className={`search-result${i === selected ? ' is-selected' : ''}`}
                onClick={() => go(r.id)}
                onMouseEnter={(e) => { setSelected(i); showPageHover(r.id, r.title, e.currentTarget.getBoundingClientRect()) }}
                onMouseLeave={scheduleWikiHoverClose}
              >
                <div className="search-result-title">
                  <span
                    className="search-result-dot"
                    style={{ background: categoryColor(r.category) }}
                  />
                  {r.title}
                </div>
                {r.snippet && (
                  <div
                    className="search-result-snippet"
                    dangerouslySetInnerHTML={{ __html: highlightSnippet(r.snippet, query) }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {query && results.length === 0 && (
          <div className="search-empty">No results for "{query}"</div>
        )}
      </div>
    </div>
  )
}
