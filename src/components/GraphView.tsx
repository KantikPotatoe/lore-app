import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from 'react-force-graph-2d'
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

// The focus id (hover or selection) plus its direct neighbours. Everything else
// is dimmed.
function neighboursOf(id: string, links: GLink[]): Set<string> {
  const set = new Set<string>([id])
  for (const l of links) {
    const s = endId(l.source)
    const t = endId(l.target)
    if (s === id) set.add(t)
    if (t === id) set.add(s)
  }
  return set
}

export default function GraphView({
  data,
  showArrows,
  selectedId,
  onSelect,
}: {
  data: GraphData
  showArrows: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const navigate = useNavigate()
  const [hoverId, setHoverId] = useState<string | null>(null)
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined)

  // Timestamp of the most recent selection, for the one-shot pulse.
  const pulseStart = useRef<number>(0)
  const pulseId = useRef<string | null>(null)
  // Eased focus strength 0..1 and the last frame time, for the dim fade.
  const focusAmt = useRef<number>(0)
  const lastFrame = useRef<number>(0)

  // react-force-graph only emits single clicks; disambiguate a double-click
  // (navigate) from a single click (focus) with a short timer.
  const clickTimer = useRef<number | null>(null)

  // Cancel a pending single-click focus if the component unmounts mid-window.
  useEffect(() => () => {
    if (clickTimer.current != null) window.clearTimeout(clickTimer.current)
  }, [])

  // Hover takes precedence over the sticky selection for what gets highlighted.
  const focusId = hoverId ?? selectedId
  const neighbourIds = useMemo(
    () => (focusId ? neighboursOf(focusId, data.links as GLink[]) : null),
    [focusId, data.links],
  )

  useEffect(() => {
    if (selectedId) {
      pulseId.current = selectedId
      pulseStart.current = performance.now()
    }
  }, [selectedId])

  const paintNode = useCallback(
    (node: GNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0

      // Ease focusAmt toward 1 when something is focused, else back to 0.
      const now = performance.now()
      const dt = lastFrame.current ? now - lastFrame.current : 16
      lastFrame.current = now
      const target = neighbourIds != null ? 1 : 0
      const step = dt / 200 // ~200ms full fade
      focusAmt.current += Math.sign(target - focusAmt.current) * step
      focusAmt.current = Math.max(0, Math.min(1, focusAmt.current))

      const isDim = neighbourIds != null && !neighbourIds.has(String(node.id))
      const baseAlpha = isDim ? 1 - 0.85 * focusAmt.current : 1

      let r = radiusFor(node.degree)
      // One-shot pop on the just-selected node.
      if (pulseId.current === String(node.id)) {
        const t = (now - pulseStart.current) / 300
        if (t < 1) {
          const ease = 1 - Math.pow(1 - t, 3) // easeOutCubic
          r *= 1 + 0.4 * (1 - ease) // starts ~1.4x, settles to 1x
        }
      }

      ctx.globalAlpha = baseAlpha
      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      ctx.fillStyle = categoryColor(node.category)
      ctx.fill()

      // Draw the title under the node once zoomed in, or for focused nodes.
      if (globalScale > 1.2 || (neighbourIds != null && !isDim)) {
        const fontSize = 12 / globalScale
        ctx.font = `${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#e9e1d2'
        ctx.fillText(node.title, x, y + r + 1)
      }
      ctx.globalAlpha = 1
    },
    [neighbourIds],
  )

  // Ease the camera to the selected node. Coordinates are populated on the
  // node objects by the running simulation.
  useEffect(() => {
    if (!selectedId || !fgRef.current) return
    const node = (data.nodes as GNode[]).find((n) => String(n.id) === selectedId)
    if (node?.x == null || node?.y == null) return
    fgRef.current.centerAt(node.x, node.y, 450)
    fgRef.current.zoom(2.5, 450)
  }, [selectedId, data.nodes])

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
      ref={fgRef}
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
      linkDirectionalArrowColor={linkColor}
      linkDirectionalArrowLength={showArrows ? 4 : 0}
      linkDirectionalArrowRelPos={1}
      onNodeHover={(node) => setHoverId(node ? String(node.id) : null)}
      onNodeClick={(node: GNode) => {
        const id = String(node.id)
        if (clickTimer.current != null) {
          window.clearTimeout(clickTimer.current)
          clickTimer.current = null
          navigate(`/page/${id}`)
        } else {
          clickTimer.current = window.setTimeout(() => {
            clickTimer.current = null
            onSelect(id)
          }, 250)
        }
      }}
      onBackgroundClick={() => onSelect(null)}
      backgroundColor="#15130f"
    />
  )
}
