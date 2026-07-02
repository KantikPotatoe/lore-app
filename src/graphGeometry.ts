// Node radius grows with connection count but stays within these bounds so a
// lone page is still visible and a hub does not swallow the screen. Shared by
// the live canvas renderer (GraphView) and the image exporter (graphExport) so
// node sizing has a single source of truth.
export const MIN_RADIUS = 4
export const MAX_RADIUS = 16

export function radiusFor(degree: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + degree * 1.5)
}
