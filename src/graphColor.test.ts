import { describe, it, expect } from 'vitest'
import { nodeFill, TAG_ACCENT, MUTED, ISLAND_PALETTE, islandColorOf } from './graphColor'
import { categoryColor, statusColor, type GraphNode } from './db'

function node(overrides: Partial<GraphNode> = {}): GraphNode {
  return { id: 'p1', title: 'Page', category: 'Character', tags: [], status: 'Draft', degree: 0, ...overrides }
}

describe('nodeFill', () => {
  it('colours by category in type mode', () => {
    expect(nodeFill(node({ category: 'Character' }), 'type', '')).toBe(categoryColor('Character'))
  })

  it('colours by status in status mode', () => {
    expect(nodeFill(node({ status: 'Complete' }), 'status', '')).toBe(statusColor('Complete'))
  })

  it('accents a node carrying the highlighted tag', () => {
    expect(nodeFill(node({ tags: ['Faction', 'Magic'] }), 'tag', 'Magic')).toBe(TAG_ACCENT)
  })

  it('mutes a node without the highlighted tag', () => {
    expect(nodeFill(node({ tags: ['Faction'] }), 'tag', 'Magic')).toBe(MUTED)
  })

  it('mutes every node when no tag is chosen in tag mode', () => {
    expect(nodeFill(node({ tags: ['Faction'] }), 'tag', '')).toBe(MUTED)
  })
})

describe('nodeFill island mode', () => {
  it('returns the mapped island colour for a clustered node', () => {
    const colors = new Map([['p1', ISLAND_PALETTE[1]]])
    expect(nodeFill(node({ id: 'p1' }), 'island', '', colors)).toBe(ISLAND_PALETTE[1])
  })

  it('mutes a node whose id is not in the island map', () => {
    expect(nodeFill(node({ id: 'p1' }), 'island', '', new Map())).toBe(MUTED)
  })

  it('mutes when no island map is provided', () => {
    expect(nodeFill(node({ id: 'p1' }), 'island', '')).toBe(MUTED)
  })
})

describe('islandColorOf', () => {
  it('assigns palette colours by rank and mutes singletons', () => {
    const componentOf = new Map([
      ['a', 0], ['b', 0], // rank 0, size 3
      ['c', 0],
      ['d', 1], ['e', 1], // rank 1, size 2
      ['x', 2],           // rank 2, size 1 → muted
    ])
    const sizes = [3, 2, 1]
    const colors = islandColorOf(componentOf, sizes)
    expect(colors.get('a')).toBe(ISLAND_PALETTE[0])
    expect(colors.get('d')).toBe(ISLAND_PALETTE[1])
    expect(colors.get('x')).toBe(MUTED)
  })

  it('cycles the palette when there are more clusters than colours', () => {
    const rank = ISLAND_PALETTE.length // one past the end
    const componentOf = new Map([['z', rank]])
    const sizes = new Array(rank + 1).fill(2) // all clusters (size >= 2)
    const colors = islandColorOf(componentOf, sizes)
    expect(colors.get('z')).toBe(ISLAND_PALETTE[rank % ISLAND_PALETTE.length])
  })
})
