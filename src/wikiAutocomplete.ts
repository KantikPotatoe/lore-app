// Helpers for the editor's [[wiki link]] autocomplete. Kept free of React/Tiptap
// so the bracket detection and candidate ranking can be unit-tested directly.

/** If the text immediately before the cursor contains an unclosed `[[` (with no
 *  intervening `[` or `]`), return the partial query typed after it and the
 *  length of the matched `[[query` slice (so the caller can map it back to a
 *  document range). Returns null when there's no open link to complete — e.g.
 *  the brackets are already closed (`[[Name]]`) or were never opened. */
export function findOpenWikiQuery(textBefore: string): { query: string; matchLength: number } | null {
  const m = /\[\[([^[\]]*)$/.exec(textBefore)
  if (!m) return null
  return { query: m[1], matchLength: m[0].length }
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
