import { describe, it, expect } from 'vitest'
import { nodeFill, TAG_ACCENT, MUTED } from './graphColor'
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
