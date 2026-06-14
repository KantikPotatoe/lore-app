import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ForceGraph2D from 'react-force-graph-2d'
import { categoryColor, type GraphData, type GraphNode } from '../db'

// Node radius grows with connection count but stays within these bounds so a
// lone page is still visible and a hub does not swallow the screen.
const MIN_RADIUS = 4
const MAX_RADIUS = 16

function radiusFor(degree: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + degree * 1.5)
}

export default function GraphView({ data, showArrows }: { data: GraphData; showArrows: boolean }) {
  const navigate = useNavigate()
  const fgRef = useRef<any>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)

  // For the hovered node, the set of node ids that are it or a direct neighbour.
  // Everything else is dimmed while hovering.
  const neighbourIds = useMemo(() => {
    if (!hoverId) return null
    const set = new Set<string>([hoverId])
    for (const l of data.links) {
      const s = typeof l.source === 'object' ? (l.source as any).id : l.source
      const t = typeof l.target === 'object' ? (l.target as any).id : l.target
      if (s === hoverId) set.add(t)
      if (t === hoverId) set.add(s)
    }
    return set
  }, [hoverId, data.links])

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x: number; y: number }
      const dimmed = neighbourIds != null && !neighbourIds.has(n.id)
      const r = radiusFor(n.degree)

      ctx.globalAlpha = dimmed ? 0.15 : 1
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = categoryColor(n.category)
      ctx.fill()

      // Draw the title under the node once we are zoomed in enough to read it,
      // or always for the hovered/neighbour nodes.
      if (globalScale > 1.2 || (neighbourIds != null && !dimmed)) {
        const fontSize = 12 / globalScale
        ctx.font = `${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#cdd3de'
        ctx.fillText(n.title, n.x, n.y + r + 1)
      }
      ctx.globalAlpha = 1
    },
    [neighbourIds],
  )

  const linkColor = useCallback(
    (link: any) => {
      if (neighbourIds == null) return 'rgba(160,160,160,0.35)'
      const s = typeof link.source === 'object' ? link.source.id : link.source
      const t = typeof link.target === 'object' ? link.target.id : link.target
      const active = neighbourIds.has(s) && neighbourIds.has(t)
      return active ? 'rgba(180,200,255,0.9)' : 'rgba(160,160,160,0.08)'
    },
    [neighbourIds],
  )

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={data}
      nodeId="id"
      nodeCanvasObject={paintNode}
      nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
        const n = node as GraphNode & { x: number; y: number }
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(n.x, n.y, radiusFor(n.degree) + 2, 0, 2 * Math.PI)
        ctx.fill()
      }}
      linkColor={linkColor}
      linkDirectionalArrowLength={showArrows ? 4 : 0}
      linkDirectionalArrowRelPos={1}
      onNodeHover={(node: any) => setHoverId(node ? node.id : null)}
      onNodeClick={(node: any) => navigate(`/page/${node.id}`)}
      backgroundColor="#11141a"
    />
  )
}
