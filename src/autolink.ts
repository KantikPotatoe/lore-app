// Pure core for the body autolinker. No React/Tiptap, so the title matching and
// first-occurrence planning are unit-testable on their own. The extension in
// src/extensions/Autolink.ts turns the planned ranges into ProseMirror decorations.

/** A compiled matcher over the set of known page titles. */
export interface TitleMatcher {
  /** Global, case-insensitive, Unicode, whole-word; alternatives ordered
   *  longest-first so the longer title wins on overlap. */
  regex: RegExp
  /** Lowercased title -> canonical casing, for resolving a hit back to its page. */
  byLower: Map<string, string>
}

/** A match within a single string: [from, to) offsets and the canonical title. */
export interface AutolinkMatch {
  from: number
  to: number
  title: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Compile known titles into one matcher. Returns null when there is nothing to
 *  match (empty / all-whitespace input). */
export function buildTitleMatcher(titles: string[]): TitleMatcher | null {
  const cleaned = [...new Set(titles.map((t) => t.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length) // longest-first → longest-match-wins
  if (cleaned.length === 0) return null
  const byLower = new Map<string, string>()
  for (const t of cleaned) {
    const lc = t.toLowerCase()
    if (!byLower.has(lc)) byLower.set(lc, t)
  }
  const alt = cleaned.map(escapeRegExp).join('|')
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'giu')
  return { regex, byLower }
}

/** Every whole-word match of a known title in `text`, in order, with offsets. */
export function findAutolinkMatches(text: string, matcher: TitleMatcher): AutolinkMatch[] {
  const out: AutolinkMatch[] = []
  matcher.regex.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = matcher.regex.exec(text)) !== null) {
    const title = matcher.byLower.get(m[0].toLowerCase())
    if (title) out.push({ from: m.index, to: m.index + m[0].length, title })
    if (m.index === matcher.regex.lastIndex) matcher.regex.lastIndex++ // zero-length guard
  }
  return out
}

/** Plan body autolinks for a whole document. `segments` are the linkable text
 *  runs in document order, each tagged with its absolute start position `pos`.
 *  `preSeen` lists titles already handled (existing wiki links, the page's own
 *  title) so they are never auto-linked. Returns the first unseen match per
 *  title, with absolute [from, to) positions. */
export function planAutolinks(
  segments: { text: string; pos: number }[],
  preSeen: Iterable<string>,
  matcher: TitleMatcher,
): AutolinkMatch[] {
  const seen = new Set<string>()
  for (const t of preSeen) seen.add(t.toLowerCase())
  const out: AutolinkMatch[] = []
  for (const seg of segments) {
    for (const m of findAutolinkMatches(seg.text, matcher)) {
      const lc = m.title.toLowerCase()
      if (seen.has(lc)) continue
      seen.add(lc)
      out.push({ from: seg.pos + m.from, to: seg.pos + m.to, title: m.title })
    }
  }
  return out
}
