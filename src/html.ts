// src/html.ts
// Shared helpers for reading rich-text HTML. The editor stores page bodies (and
// event descriptions) as HTML strings, so several modules need to pull plain
// text or wiki-link targets back out. Keeping the DOMParser usage here means the
// parsing behaves identically everywhere instead of being reinvented per call site.

/** Parse an HTML fragment into a detached Document (never touches the live page). */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

/** Plain-text content of an HTML fragment — tags stripped, entities decoded. */
export function stripHtml(html: string): string {
  if (!html) return ''
  return parseHtml(html).body.textContent ?? ''
}

/** The wiki-link target titles in an HTML body, read from
 *  `<a data-wikilink data-title="…">` anchors. Titles are trimmed but returned
 *  with their original casing (callers lowercase when they need to compare). */
export function wikiLinkTitles(html: string): string[] {
  if (!html || !html.includes('data-wikilink')) return []
  const out: string[] = []
  parseHtml(html)
    .querySelectorAll('a[data-wikilink]')
    .forEach((a) => {
      const t = a.getAttribute('data-title')?.trim()
      if (t) out.push(t)
    })
  return out
}
