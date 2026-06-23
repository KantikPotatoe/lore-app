import { db, uid, now, categoryColor } from './schema'
import type { InfoboxTemplate, LorePage, MapPin } from './types'

// ---------------------------------------------------------------------------
// Maps & pins
// ---------------------------------------------------------------------------

export async function addMap(name: string, image: string, width: number, height: number): Promise<string> {
  const id = uid()
  await db.maps.add({ id, name, image, width, height, createdAt: now() })
  return id
}

export async function deleteMap(mapId: string): Promise<void> {
  await db.transaction('rw', db.maps, db.pins, async () => {
    await db.maps.delete(mapId)
    await db.pins.where('mapId').equals(mapId).delete()
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

/** Resolve a pin's type from its linked page. `pagesById` and `templatesByName`
 *  (keyed by lower-cased name) are passed in so callers build them once per render. */
export function pinType(
  pin: MapPin,
  pagesById: Map<string, LorePage>,
  templatesByName: Map<string, InfoboxTemplate>,
): PinType {
  const page = pin.pageId ? pagesById.get(pin.pageId) : undefined
  const name = page?.category ?? null
  if (!name) return { name: null, color: '#a0a0a0', icon: null }
  const tpl = templatesByName.get(name.toLowerCase())
  return { name, color: tpl?.color ?? categoryColor(name), icon: tpl?.icon ?? null }
}
