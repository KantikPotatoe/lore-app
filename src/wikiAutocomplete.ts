// Helpers for the editor's [[wiki link]] autocomplete. Kept free of React/Tiptap
// so the bracket detection and candidate ranking can be unit-tested directly.

/** If the text immediately before the cursor has an open wiki-link trigger,
 *  return the partial query typed after it and the length of the matched slice
 *  (so the caller can map it back to a document range). Two triggers are
 *  recognized:
 *    - `[[query`  — an unclosed `[[` with no intervening `[` or `]`.
 *    - `@query`   — an `@` at a word boundary (line start or after whitespace),
 *                   query running until the next whitespace.
 *  `[[` is checked first, so `[[@foo` reads as a `[[` query. Returns null when
 *  there's no open trigger — e.g. brackets already closed (`[[Name]]`), or an
 *  `@` mid-word (`foo@bar`). */
export function findOpenWikiQuery(textBefore: string): { query: string; matchLength: number } | null {
  const brackets = /\[\[([^[\]]*)$/.exec(textBefore)
  if (brackets) return { query: brackets[1], matchLength: brackets[0].length }
  const at = /(?:^|\s)@([^\s@]*)$/.exec(textBefore)
  if (at) return { query: at[1], matchLength: at[1].length + 1 }
  return null
}

/** Rank page titles for a partial query: case-insensitive, prefix matches before
 *  mid-string matches, then alphabetical. Excludes an exact (already-complete)
 *  match so the menu doesn't offer what's already typed. Capped to `limit`. */
export function rankWikiTitles(titles: string[], query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    return [...titles].sort((a, b) => a.localeCompare(b)).slice(0, limit)
  }
  const scored: { title: string; rank: number }[] = []
  for (const title of titles) {
    const lc = title.toLowerCase()
    if (lc === q) continue // already fully typed
    const idx = lc.indexOf(q)
    if (idx === -1) continue
    scored.push({ title, rank: idx === 0 ? 0 : 1 })
  }
  scored.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
  return scored.slice(0, limit).map((s) => s.title)
}
