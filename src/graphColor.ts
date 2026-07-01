import { categoryColor, statusColor, type GraphNode } from './db'

/** Which dimension drives a graph node's fill colour. */
export type ColorBy = 'type' | 'status' | 'tag'

// Accent for nodes carrying the highlighted tag; muted grey for the rest (and
// for tag mode with no tag chosen). Both read against the #15130f graph canvas.
// MUTED is a neutral grey kept a touch brighter than the ghost colour (#8a8270)
// and desaturated to stay distinct from it, so a de-emphasised real node still
// reads as more present than a "missing page" ghost — important in 3D where both
// are solid spheres. The saturated accent still dominates by hue, not brightness.
export const TAG_ACCENT = '#4fc3d9'
export const MUTED = '#8a8a84'

/** Fill colour for a NON-ghost graph node under the active colour mode. Ghost
 *  nodes keep their own dashed/muted rendering in the callers, so this is only
 *  ever called for real pages. */
export function nodeFill(node: GraphNode, colorBy: ColorBy, highlightTag: string): string {
  if (colorBy === 'status') return statusColor(node.status)
  if (colorBy === 'tag') {
    return highlightTag !== '' && node.tags.includes(highlightTag) ? TAG_ACCENT : MUTED
  }
  return categoryColor(node.category)
}
