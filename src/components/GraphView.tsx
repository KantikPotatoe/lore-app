import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ForceGraph2D, { type NodeObject, type LinkObject } from 'react-force-graph-2d'
import { categoryColor, type GraphData, type GraphNode, type GraphLink } from '../db'

// The force simulation augments our plain nodes/links in place (adds x/y and
// swaps link source/target from an id string to the resolved node object), so
// the canvas callbacks see these richer shapes.
type GNode = NodeObject<GraphNode>
type GLink = LinkObject<GraphNode, GraphLink>

// Node radius grows with connection count but stays within these bounds so a
// lone page is still visible and a hub does not swallow the screen.
const MIN_RADIUS = 4
const MAX_RADIUS = 16

function radiusFor(degree: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + degree * 1.5)
}

// A link end is an id string before the simulation runs and the resolved node
// object after, so accept either shape.
function endId(end: string | GNode): string {
  return typeof end === 'object' ? String(end.id) : end
}

export default function GraphView({ data, showArrows }: { data: GraphData; showArrows: boolean }) {
  const navigate = useNavigate()
  const [hoverId, setHoverId] = useState<string | null>(null)

  // For the hovered node, the set of node ids that are it or a direct neighbour.
  // Everything else is dimmed while hovering.
  const neighbourIds = useMemo(() => {
    if (!hoverId) return null
    const set = new Set<string>([hoverId])
    for (const l of data.links as GLink[]) {
      const s = endId(l.source)
      const t = endId(l.target)
      if (s === hoverId) set.add(t)
      if (t === hoverId) set.add(s)
    }
    return set
  }, [hoverId, data.links])

  const paintNode = useCallback(
    (node: GNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const dimmed = neighbourIds != null && !neighbourIds.has(String(node.id))
      const r = radiusFor(node.degree)

      ctx.globalAlpha = dimmed ? 0.15 : 1
      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      ctx.fillStyle = categoryColor(node.category)
      ctx.fill()

      // Draw the title under the node once we are zoomed in enough to read it,
      // or always for the hovered/neighbour nodes.
      if (globalScale > 1.2 || (neighbourIds != null && !dimmed)) {
        const fontSize = 12 / globalScale
        ctx.font = `${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#cdd3de'
        ctx.fillText(node.title, x, y + r + 1)
      }
      ctx.globalAlpha = 1
    },
    [neighbourIds],
  )

  const linkColor = useCallback(
    (link: GLink) => {
      if (neighbourIds == null) return 'rgba(160,160,160,0.35)'
      const active = neighbourIds.has(endId(link.source)) && neighbourIds.has(endId(link.target))
      return active ? 'rgba(180,200,255,0.9)' : 'rgba(160,160,160,0.08)'
    },
    [neighbourIds],
  )

  return (
    <ForceGraph2D<GraphNode, GraphLink>
      graphData={data}
      nodeId="id"
      nodeCanvasObject={paintNode}
      nodePointerAreaPaint={(node: GNode, color: string, ctx: CanvasRenderingContext2D) => {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(node.x ?? 0, node.y ?? 0, radiusFor(node.degree) + 2, 0, 2 * Math.PI)
        ctx.fill()
      }}
      linkColor={linkColor}
      linkDirectionalArrowLength={showArrows ? 4 : 0}
      linkDirectionalArrowRelPos={1}
      onNodeHover={(node) => setHoverId(node ? String(node.id) : null)}
      onNodeClick={(node) => navigate(`/page/${node.id}`)}
      backgroundColor="#11141a"
    />
  )
}
