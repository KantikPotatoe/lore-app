import { describe, it, expect } from 'vitest'
import { tagCounts } from './tags'
import type { LorePage } from './db'

function page(tags: string[]): LorePage {
  return {
    id: 'p', title: 't', category: 'Character', content: '', summary: '',
    status: 'Draft', tags, infobox: undefined, createdAt: 0, updatedAt: 0,
  }
}

describe('tagCounts', () => {
  it('returns an empty array for no pages', () => {
    expect(tagCounts([])).toEqual([])
  })

  it('tallies a tag across pages and dedupes', () => {
    const result = tagCounts([page(['magic']), page(['magic', 'lore']), page(['lore'])])
    expect(result).toEqual([
      { tag: 'lore', count: 2 },
      { tag: 'magic', count: 2 },
    ])
  })

  it('orders by count descending, then alphabetically', () => {
    const result = tagCounts([page(['magic']), page(['magic']), page(['lore'])])
    expect(result).toEqual([
      { tag: 'magic', count: 2 },
      { tag: 'lore', count: 1 },
    ])
  })

  it('breaks count ties alphabetically', () => {
    expect(tagCounts([page(['zebra', 'apple'])])).toEqual([
      { tag: 'apple', count: 1 },
      { tag: 'zebra', count: 1 },
    ])
  })
})
