import type { LorePage } from './db'

/** Aggregate every page's tags into { tag, count } entries, most-used first
 *  (ties broken alphabetically). Pure — no React/Dexie — so the ordering is
 *  unit-testable on its own, mirroring toc.ts / autolink.ts. */
export function tagCounts(pages: LorePage[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of pages) {
    for (const tag of p.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
