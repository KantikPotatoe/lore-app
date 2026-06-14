import { Fragment } from 'react'

// Renders a plain string, turning any [[Page Name]] tokens into clickable wiki
// links — the same behavior as links inside the rich-text editor. Used for
// infobox field values (and anywhere else short text should support links).

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

interface Props {
  value: string
  onWikiClick: (title: string) => void
  /** Lowercased titles of existing pages; links not in the set render as broken. */
  knownTitles?: Set<string>
}

export default function WikiText({ value, onWikiClick, knownTitles }: Props) {
  const nodes: React.ReactNode[] = []
  const re = new RegExp(WIKILINK_RE) // fresh instance so lastIndex starts at 0
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(value)) !== null) {
    if (match.index > lastIndex) nodes.push(value.slice(lastIndex, match.index))
    const title = match[1].trim()
    const broken = knownTitles ? !knownTitles.has(title.toLowerCase()) : false
    nodes.push(
      <a
        key={key++}
        className={broken ? 'wiki-link is-broken' : 'wiki-link'}
        onClick={(e) => {
          e.preventDefault()
          if (title) onWikiClick(title)
        }}
      >
        {title}
      </a>,
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex))

  return <Fragment>{nodes}</Fragment>
}
