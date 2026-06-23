import { describe, it, expect, beforeEach } from 'vitest'
import {
  db,
  addRegion,
  regionStyle,
  deleteMap,
  type InfoboxTemplate,
  type LorePage,
  type MapRegion,
} from '../db'

// Regions are the area-shaped counterpart to typed pins (Phase 3). These tests
// pin the three data-layer guarantees: addRegion's defaults, deleteMap cascading
// to regions, and regionStyle's colour precedence + derived legend bucket.

async function clearMaps(): Promise<void> {
  await Promise.all([db.maps.clear(), db.pins.clear(), db.regions.clear(), db.pages.clear()])
}
beforeEach(clearMaps)

const tri: [number, number][] = [[0, 0], [0, 10], [10, 0]]

const page = (id: string, category: string): LorePage => ({
  id, title: `Page ${id}`, category, content: '', summary: '', status: 'Draft',
  tags: [], createdAt: 1, updatedAt: 1,
})
const tpl = (name: string, color: string): InfoboxTemplate => ({
  id: name, name, color, items: [], builtin: false,
})
const region = (over: Partial<MapRegion> = {}): MapRegion => ({
  id: 'r1', mapId: 'm1', points: tri, label: 'Region', pageId: null, ...over,
})

describe('addRegion', () => {
  it('inserts a region with default label and no link/colour', async () => {
    const id = await addRegion('m1', tri)
    const r = await db.regions.get(id)
    expect(r).toMatchObject({ mapId: 'm1', label: 'New region', pageId: null })
    expect(r!.points).toEqual(tri)
    expect(r!.color).toBeUndefined()
  })

  it('clearing the colour override via modify removes the property (Auto)', async () => {
    const id = await addRegion('m1', tri)
    await db.regions.update(id, { color: '#ff0000' })
    expect((await db.regions.get(id))!.color).toBe('#ff0000')
    await db.regions.update(id, (r) => { delete r.color })
    expect((await db.regions.get(id))!.color).toBeUndefined()
  })
})

describe('deleteMap cascade', () => {
  it('deletes the map and all its regions', async () => {
    await db.maps.add({ id: 'm1', name: 'M', image: '', width: 1, height: 1, createdAt: 1 })
    await addRegion('m1', tri)
    await addRegion('m1', tri)
    await deleteMap('m1')
    expect(await db.maps.get('m1')).toBeUndefined()
    expect(await db.regions.where('mapId').equals('m1').count()).toBe(0)
  })
})

describe('regionStyle — colour precedence & bucket', () => {
  const pages = new Map([['p1', page('p1', 'Country')]])
  const templates = new Map([['country', tpl('Country', '#7eb09b')]])

  it('uses the override colour when present, but keeps the derived bucket', () => {
    const s = regionStyle(region({ pageId: 'p1', color: '#ff0000' }), pages, templates)
    expect(s.fill).toBe('#ff0000')
    expect(s.type.name).toBe('Country')
    expect(s.type.color).toBe('#7eb09b')
  })

  it('derives the fill from the linked page type when no override', () => {
    const s = regionStyle(region({ pageId: 'p1' }), pages, templates)
    expect(s.fill).toBe('#7eb09b')
    expect(s.type.name).toBe('Country')
  })

  it('falls back to neutral grey + Untyped bucket when unlinked', () => {
    const s = regionStyle(region({ pageId: null }), pages, templates)
    expect(s.fill).toBe('#a0a0a0')
    expect(s.type.name).toBeNull()
  })

  it('uses override colour but stays Untyped when there is no link', () => {
    const s = regionStyle(region({ pageId: null, color: '#abcdef' }), pages, templates)
    expect(s.fill).toBe('#abcdef')
    expect(s.type.name).toBeNull()
  })
})
