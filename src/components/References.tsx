import { parseCitations } from '../citations'

interface ReferencesProps {
  /** Page body HTML to scan for citation markers. */
  content: string
  /** Lowercased titles of existing pages — page sources not in here render broken. */
  knownTitles?: Set<string>
  /** Navigate to a cited page (resolve-or-create handled by the caller). */
  onWikiClick: (title: string) => void
  /** Scroll the nth citation marker in the body into view. */
  onBackref: (index: number) => void
}

/** The auto-generated "References" section under a page body. Numbered in document
 *  order to match the CSS-counter numbers on the markers (see index.css). Renders
 *  nothing when the page has no citations. */
export default function References({ content, knownTitles, onWikiClick, onBackref }: ReferencesProps) {
  const citations = parseCitations(content)
  if (citations.length === 0) return null

  return (
    <div className="references">
      <div className="references-head">References</div>
      <ol className="references-list">
        {citations.map((c, i) => {
          const broken = !!c.target && !!knownTitles && !knownTitles.has(c.target.toLowerCase())
          return (
            <li key={i} id={`cite-ref-${i}`} className="reference">
              <button
                type="button"
                className="reference-backref"
                title="Back to citation"
                onClick={() => onBackref(i)}
              >
                ↑
              </button>
              <span className="reference-body">
                {c.target ? (
                  <button
                    type="button"
                    className={`wiki-link${broken ? ' is-broken' : ''}`}
                    onClick={() => onWikiClick(c.target)}
                  >
                    {c.target}
                  </button>
                ) : (
                  <span className="reference-source">{c.text}</span>
                )}
                {c.locator && <span className="reference-locator">, {c.locator}</span>}
                {c.quote && <span className="reference-quote">— "{c.quote}"</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
