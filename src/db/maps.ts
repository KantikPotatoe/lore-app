import { db, uid, now, categoryColor } from './schema'
import type { InfoboxTemplate, LorePage, MapPin, MapRegion } from './types'

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
