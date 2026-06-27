// Pure helpers for the page Table of Contents. No DOM or React here so the
// heading-id and indentation logic can be unit-tested in isolation.

/** Slugify heading texts into unique element ids, de-duplicating repeats with a
 *  numeric suffix (the 2nd "Notes" becomes "notes-1"). One id per input, order
 *  preserved; empty / punctuation-only text slugs to "heading". */
export function slugifyHeadings(texts: string[]): string[] {
  const seen = new Map<string, number>()
  return texts.map((t) => {
    const base =
      t.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'heading'
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  })
}

/** Visual nesting depth of each heading relative to the shallowest level
 *  present: depth = level − min(levels). Empty input → empty output. */
export function relativeDepths(levels: number[]): number[] {
  if (levels.length === 0) return []
  const min = Math.min(...levels)
  return levels.map((l) => l - min)
}
