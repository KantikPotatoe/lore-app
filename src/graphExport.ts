import { radiusFor } from './graphGeometry'
import { nodeFill, type ColorBy } from './graphColor'
import type { GraphData, GraphNode, GraphLink } from './db'

// Solid dark background matching the live graph canvas, so the light labels and
// edges stay readable when the image is pasted onto any surface.
export const EXPORT_BG = '#15130f'
export const LABEL_COLOR = '#e9e1d2'
export const GHOST_COLOR = '#8a8270'

// Padding around the node bounding box (graph units) — enough for the largest
// node radius plus a line of label text below it.
const PAD = 48

// Rest-state link styling, mirrored from GraphView.linkColor / linkWidth (the
// no-focus branch) so an exported image matches the graph at rest.
const MUTUAL_LINK = { color: 'rgba(150,180,255,0.5)', width: 2.5 }
const ONEWAY_LINK = { color: 'rgba(160,160,160,0.28)', width: 1 }

export interface SceneNode {
  x: number
  y: number
  r: number
  /** Fill colour for real pages; null for ghosts (drawn as a dashed stroke). */
  fill: string | null
  ghost: boolean
  title: string
  labelColor: string
}

export interface SceneLink {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  width: number
}

export interface GraphScene {
  minX: number
  minY: number
  width: number
  height: number
  background: string
  nodes: SceneNode[]
  links: SceneLink[]
}

// The sim augments nodes with x/y in place; accept that richer shape.
type Positioned = GraphNode & { x?: number; y?: number }

// A link end is an id string before the sim runs and the resolved node object
// after; recover the id either way (mirrors GraphView.endId).
function endId(end: string | Positioned): string {
  return typeof end === 'object' ? String(end.id) : end
}

/**
 * Build a serialisable scene from the *filtered* graph. Nodes are expected to
 * carry x/y from the running force simulation. Un-positioned nodes are skipped
 * (and any link touching them dropped). Returns null when no node has settled
 * yet, so callers can show a "still settling" message instead of a blank image.
 */
export function buildScene(
  data: GraphData,
  opts: { colorBy: ColorBy; highlightTag: string; islandColors: Map<string, string> },
): GraphScene | null {
  const positioned = new Map<string, Positioned>()
  const sceneNodes: SceneNode[] = []

  for (const n of data.nodes as Positioned[]) {
    if (n.x == null || n.y == null) continue
    positioned.set(String(n.id), n)
    const ghost = !!n.ghost
    sceneNodes.push({
      x: n.x,
      y: n.y,
      r: radiusFor(n.degree),
      fill: ghost ? null : nodeFill(n, opts.colorBy, opts.highlightTag, opts.islandColors),
      ghost,
      title: n.title,
      labelColor: ghost ? GHOST_COLOR : LABEL_COLOR,
    })
  }

  if (sceneNodes.length === 0) return null

  const sceneLinks: SceneLink[] = []
  for (const l of data.links as Array<GraphLink & { source: string | Positioned; target: string | Positioned }>) {
    const s = positioned.get(endId(l.source))
    const t = positioned.get(endId(l.target))
    if (!s || !t) continue
    const style = l.mutual ? MUTUAL_LINK : ONEWAY_LINK
    sceneLinks.push({ x1: s.x!, y1: s.y!, x2: t.x!, y2: t.y!, color: style.color, width: style.width })
  }

  // Bounding box over node centres expanded by each node's radius, then padded.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of sceneNodes) {
    minX = Math.min(minX, n.x - n.r)
    minY = Math.min(minY, n.y - n.r)
    maxX = Math.max(maxX, n.x + n.r)
    maxY = Math.max(maxY, n.y + n.r)
  }
  minX -= PAD
  minY -= PAD
  maxX += PAD
  maxY += PAD

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
    background: EXPORT_BG,
    nodes: sceneNodes,
    links: sceneLinks,
  }
}
