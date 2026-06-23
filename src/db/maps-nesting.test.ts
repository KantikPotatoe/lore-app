import { describe, it, expect } from 'vitest'
import { findParentMapId, mapBreadcrumb, ancestorMapIds } from '../db'
import type { MapPin, MapRegion, WorldMap } from '../db'

// Phase 4 nests maps via "portals": a pin or region carries childMapId, the map
// it opens. A map's parent and breadcrumb are derived from incoming portals — no
// stored parentMapId — so these pure helpers are the single source of truth.

const wmap = (id: string): WorldMap => ({ id, name: id, image: '', width: 1, height: 1, createdAt: 1 })
const pin = (id: string, mapId: string, childMapId?: string): MapPin => ({
  id, mapId, lat: 0, lng: 0, label: id, pageId: null, ...(childMapId ? { childMapId } : {}),
})
const region = (id: string, mapId: string, childMapId?: string): MapRegion => ({
  id, mapId, points: [[0, 0], [0, 1], [1, 0]], label: id, pageId: null,
  ...(childMapId ? { childMapId } : {}),
})

describe('findParentMapId', () => {
  it('returns the mapId of the pin portal that opens the map', () => {
    const pins = [pin('p1', 'continent', 'city')]
    expect(findParentMapId('city', pins, [])).toBe('continent')
  })

  it('falls back to a region portal when no pin opens the map', () => {
    const regions = [region('r1', 'continent', 'reach')]
    expect(findParentMapId('reach', [], regions)).toBe('continent')
  })

  it('prefers a pin portal over a region portal', () => {
    const pins = [pin('p1', 'fromPin', 'target')]
    const regions = [region('r1', 'fromRegion', 'target')]
    expect(findParentMapId('target', pins, regions)).toBe('fromPin')
  })

  it('returns null when no portal opens the map (top-level)', () => {
    expect(findParentMapId('continent', [], [])).toBeNull()
  })
})

describe('mapBreadcrumb', () => {
  const maps = [wmap('continent'), wmap('region'), wmap('city')]
  // continent --pin--> region --pin--> city
  const pins = [pin('p1', 'continent', 'region'), pin('p2', 'region', 'city')]

  it('builds the ancestor chain root→current', () => {
    expect(mapBreadcrumb('city', maps, pins, []).map((m) => m.id))
      .toEqual(['continent', 'region', 'city'])
  })

  it('returns just the map itself when it is top-level', () => {
    expect(mapBreadcrumb('continent', maps, pins, []).map((m) => m.id)).toEqual(['continent'])
  })

  it('returns an empty chain for an unknown map', () => {
    expect(mapBreadcrumb('ghost', maps, pins, [])).toEqual([])
  })

  it('terminates on a cycle instead of looping forever', () => {
    // a opens b, b opens a — a deliberate cycle
    const cyc = [pin('p1', 'a', 'b'), pin('p2', 'b', 'a')]
    const cycMaps = [wmap('a'), wmap('b')]
    const ids = mapBreadcrumb('a', cycMaps, cyc, []).map((m) => m.id)
    expect(ids[ids.length - 1]).toBe('a')
    expect(ids.length).toBeLessThanOrEqual(2)
  })
})

describe('ancestorMapIds', () => {
  const pins = [pin('p1', 'continent', 'region'), pin('p2', 'region', 'city')]

  it('returns the map itself plus all its ancestors', () => {
    expect(ancestorMapIds('city', pins, [])).toEqual(new Set(['city', 'region', 'continent']))
  })

  it('returns just the map itself when top-level', () => {
    expect(ancestorMapIds('continent', pins, [])).toEqual(new Set(['continent']))
  })

  it('terminates on a cycle instead of looping forever', () => {
    const cyc = [pin('p1', 'a', 'b'), pin('p2', 'b', 'a')]
    expect(ancestorMapIds('a', cyc, [])).toEqual(new Set(['a', 'b']))
  })
})
