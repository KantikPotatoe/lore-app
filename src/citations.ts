// A citation marks a claim in a page body with an in-world source. Each marker is
// a Tiptap `Citation` node rendered as <sup data-citation …>; the source lives in
// its data-* attributes. This module is pure (no React/Dexie) — like html.ts — so
// the References component, the HTML export, and tests all read markers the same way.
import { parseHtml } from './html'

export interface Citation {
  target: string  // cited page title; '' when the source is free text
  text: string    // free-text source; '' when the source is a page
  locator: string // optional locator, e.g. "Ch. 3", "p. 42"; '' when none
  quote: string   // optional quoted excerpt; '' when none
}

/** Every citation marker in a body's HTML, in document order. A marker with
 *  neither a page target nor free text is malformed and skipped. */
export function parseCitations(html: string): Citation[] {
  if (!html || !html.includes('data-citation')) return []
  const out: Citation[] = []
  parseHtml(html)
    .querySelectorAll('sup[data-citation]')
    .forEach((el) => {
      const target = el.getAttribute('data-target')?.trim() ?? ''
      const text = el.getAttribute('data-text')?.trim() ?? ''
      if (!target && !text) return
      out.push({
        target,
        text,
        locator: el.getAttribute('data-locator')?.trim() ?? '',
        quote: el.getAttribute('data-quote')?.trim() ?? '',
      })
    })
  return out
}
