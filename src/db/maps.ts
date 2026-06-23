import { db, uid, now, categoryColor } from './schema'
import type { InfoboxTemplate, LorePage, MapPin, MapRegion, WorldMap } from './types'

// ---------------------------------------------------------------------------
// Maps & pins
// ---------------------------------------------------------------------------

export async function addMap(name: string, image: string, width: number, height: number): Promise<string> {
  const id = uid()
  await db.maps.add({ id, name, image, width, height, createdAt: now() })
  return id
}

export async function deleteMap(mapId: string): Promise<void> {
  await db.transaction('rw', db.maps, db.pins, db.regions, async () => {
    await db.maps.delete(mapId)
    await db.pins.where('mapId').equals(mapId).delete()
    await db.regions.where('mapId').equals(mapId).delete()
  })
}

export async function addPin(mapId: string, lat: number, lng: number): Promise<string> {
  const id = uid()
  await db.pins.add({ id, mapId, lat, lng, label: 'New pin', pageId: null })
  return id
}

/** A pin's derived visual identity. Pins store no type — it comes from the
 *  linked page's category. Unlinked/unresolved pins are "Untyped". */
export interface PinType {
  name: string | null   // page-type name, or null when untyped
  color: string         // type colour, or neutral grey when untyped
  icon: string | null   // type emoji, or null
}

/** Resolve a linked page's type (page → category → template), the single source
 *  of truth shared by pins and regions. Returns Untyped when unlinked/unresolved. */
function linkedPageType(
  pageId: string | null,
  pagesById: Map<string, LorePage>,
  templatesByName: Map<string, InfoboxTemplate>,
): PinType {
  const page = pageId ? pagesById.get(pageId) : undefined
  const name = page?.category ?? null
  if (!name) return { name: null, color: '#a0a0a0', icon: null }
  const tpl = templatesByName.get(name.toLowerCase())
  return { name, color: tpl?.color ?? categoryColor(name), icon: tpl?.icon ?? null }
}

/** Resolve a pin's type from its linked page. `pagesById` and `templatesByName`
 *  (keyed by lower-cased name) are passed in so callers build them once per render. */
export function pinType(
  pin: MapPin,
  pagesById: Map<string, LorePage>,
  templatesByName: Map<string, InfoboxTemplate>,
): PinType {
  return linkedPageType(pin.pageId, pagesById, templatesByName)
}

export async function addRegion(mapId: string, points: [number, number][]): Promise<string> {
  const id = uid()
  await db.regions.add({ id, mapId, points, label: 'New region', pageId: null })
  return id
}

/** A region's resolved fill colour plus its derived type. `fill` honours a
 *  per-region `color` override; `type` is always the derived page-type (its
 *  `.name` is the legend bucket — Untyped when null — and `.color` the type's
 *  own colour for the legend swatch). */
export function regionStyle(
  region: MapRegion,
  pagesById: Map<string, LorePage>,
  templatesByName: Map<string, InfoboxTemplate>,
): { fill: string; type: PinType } {
  const type = linkedPageType(region.pageId, pagesById, templatesByName)
  return { fill: region.color ?? type.color, type }
}

// ---------------------------------------------------------------------------
// Map nesting — derived parent / breadcrumb (Phase 4)
// ---------------------------------------------------------------------------
// A pin or region carries an optional `childMapId` — the map it opens (a
// "portal"). A map's parent is *derived* by finding the portal that opens it
// (pins before regions); there is no stored parentMapId. All three helpers are
// pure so callers pass the arrays once per render and they stay test-friendly.

/** The mapId of the first portal (pins before regions) whose childMapId === mapId,
 *  or null when no portal opens this map (a top-level map). */
export function findParentMapId(mapId: string, pins: MapPin[], regions: MapRegion[]): string | null {
  const pin = pins.find((p) => p.childMapId === mapId)
  if (pin) return pin.mapId
  const region = regions.find((r) => r.childMapId === mapId)
  return region ? region.mapId : null
}

/** The ancestor chain root→current as WorldMaps, derived by walking incoming
 *  portals upward. A `visited` set guards against cycles; an unknown map (or one
 *  whose ancestor is unknown) yields an empty/short chain. */
export function mapBreadcrumb(
  mapId: string,
  maps: WorldMap[],
  pins: MapPin[],
  regions: MapRegion[],
): WorldMap[] {
  const byId = new Map(maps.map((m) => [m.id, m]))
  const chain: WorldMap[] = []
  const visited = new Set<string>()
  let cur: string | null = mapId
  while (cur && !visited.has(cur)) {
    visited.add(cur)
    const m = byId.get(cur)
    if (!m) break
    chain.unshift(m)
    cur = findParentMapId(cur, pins, regions)
  }
  return chain
}

/** The set of maps a portal on `mapId` must not target (the map itself and its
 *  ancestors) — choosing one would create a cycle. */
export function ancestorMapIds(mapId: string, pins: MapPin[], regions: MapRegion[]): Set<string> {
  const set = new Set<string>()
  let cur: string | null = mapId
  while (cur && !set.has(cur)) {
    set.add(cur)
    cur = findParentMapId(cur, pins, regions)
  }
  return set
}
