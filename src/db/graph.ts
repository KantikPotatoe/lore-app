import { linkedTitles } from './pages'
import type { LorePage } from './types'

// ---------------------------------------------------------------------------
// Relationship graph — nodes (pages) and edges (resolved links between them)
// ---------------------------------------------------------------------------

/** One page as a graph node. `degree` is the number of distinct pages it is
 *  connected to (in either direction) and drives the node's drawn size. */
export interface GraphNode {
  id: string
  title: string
  category: string
  tags: string[]
  degree: number
  /** True for synthetic nodes standing in for links to pages that don't exist yet. */
  ghost?: boolean
}

/** One edge between two existing pages. `source`/`target` keep the original
 *  link direction so directional arrows can be drawn when enabled. */
export interface GraphLink {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

// Category sentinel for ghost nodes — they branch on the `ghost` flag, not this,
// so it stays internal and is excluded from the toolbar's category list.
const GHOST_CATEGORY = '__ghost__'

// linkedTitles() lowercases every title, so a ghost's display label is recovered
// by title-casing the link text (mordor → Mordor, the shire → The Shire).
function prettyTitle(lower: string): string {
  return lower.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Build the relationship graph from the full page list.
 *
 *  Every page becomes a node (pages with no links show as lone dots, which is
 *  intentional — it surfaces isolated pages). Each page's linked titles are
 *  resolved against a title→id map; a link to an existing page becomes a real
 *  edge; a link to a missing page becomes a ghost node + ghost edge. Self-links
 *  are dropped and A↔B collapses to a single edge regardless of direction.
 *  `degree` counts distinct real neighbours (ghost links don't affect real-node
 *  degree). Ghost node `degree` counts distinct real pages linking to it. */
export function buildGraphData(pages: LorePage[]): GraphData {
  const idByTitle = new Map<string, string>()
  for (const p of pages) idByTitle.set(p.title.trim().toLowerCase(), p.id)

  const neighbours = new Map<string, Set<string>>()
  for (const p of pages) neighbours.set(p.id, new Set())

  // Distinct real pages linking to each unresolved title → drives ghost size.
  const ghostLinkers = new Map<string, Set<string>>()

  const seen = new Set<string>() // de-dupe real edge key "a|b" with a < b
  const links: GraphLink[] = []

  for (const page of pages) {
    for (const title of linkedTitles(page)) {
      const targetId = idByTitle.get(title)
      if (targetId === page.id) continue // self-link
      if (!targetId) {
        // Missing page → ghost edge (page → ghost), one ghost per lowercased title.
        const ghostId = `ghost:${title}`
        let linkers = ghostLinkers.get(ghostId)
        if (!linkers) {
          linkers = new Set()
          ghostLinkers.set(ghostId, linkers)
        }
        if (!linkers.has(page.id)) {
          linkers.add(page.id)
          links.push({ source: page.id, target: ghostId })
        }
        continue
      }
      const key = page.id < targetId ? `${page.id}|${targetId}` : `${targetId}|${page.id}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ source: page.id, target: targetId })
      neighbours.get(page.id)!.add(targetId)
      neighbours.get(targetId)!.add(page.id)
    }
  }

  const nodes: GraphNode[] = pages.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    tags: p.tags,
    degree: neighbours.get(p.id)!.size,
  }))

  for (const [ghostId, linkers] of ghostLinkers) {
    nodes.push({
      id: ghostId,
      title: prettyTitle(ghostId.slice('ghost:'.length)),
      category: GHOST_CATEGORY,
      tags: [],
      degree: linkers.size,
      ghost: true,
    })
  }

  return { nodes, links }
}

/** The set of node ids within `hops` edges of `startId` (inclusive of the start),
 *  walking links as undirected. `hops` of 0 returns just the start; a start id
 *  absent from the graph returns just itself. Used by the graph's depth filter to
 *  show only the neighbourhood around a focused node. */
export function nodesWithinHops(links: GraphLink[], startId: string, hops: number): Set<string> {
  const adj = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    let set = adj.get(a)
    if (!set) adj.set(a, (set = new Set()))
    set.add(b)
  }
  for (const l of links) {
    link(l.source, l.target)
    link(l.target, l.source)
  }

  const visited = new Set<string>([startId])
  let frontier = [startId]
  for (let d = 0; d < hops && frontier.length > 0; d++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb)
          next.push(nb)
        }
      }
    }
    frontier = next
  }
  return visited
}
