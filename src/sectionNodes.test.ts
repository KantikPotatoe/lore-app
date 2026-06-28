import { describe, it, expect } from 'vitest'
import { sectionNodes } from './sectionNodes'

describe('sectionNodes', () => {
  it('produces a heading + empty paragraph per name', () => {
    expect(sectionNodes(['Appearance', 'History'])).toEqual([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Appearance' }] },
      { type: 'paragraph' },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'History' }] },
      { type: 'paragraph' },
    ])
  })

  it('trims names and drops empty/whitespace ones', () => {
    expect(sectionNodes(['  Bio  ', '', '   '])).toEqual([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Bio' }] },
      { type: 'paragraph' },
    ])
  })

  it('returns an empty array for no names', () => {
    expect(sectionNodes([])).toEqual([])
  })
})
