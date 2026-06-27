import { describe, it, expect } from 'vitest'
import { slugifyHeadings, relativeDepths } from './toc'

describe('slugifyHeadings', () => {
  it('slugifies text and strips punctuation', () => {
    expect(slugifyHeadings(['Early Life', 'The King’s Court!'])).toEqual([
      'early-life',
      'the-king-s-court',
    ])
  })

  it('de-duplicates repeated headings with a numeric suffix', () => {
    expect(slugifyHeadings(['Notes', 'Notes', 'Notes'])).toEqual([
      'notes',
      'notes-1',
      'notes-2',
    ])
  })

  it('falls back to "heading" for empty/punctuation-only text (and dedups it)', () => {
    expect(slugifyHeadings(['', '!!!'])).toEqual(['heading', 'heading-1'])
  })
})

describe('relativeDepths', () => {
  it('keeps H2/H3-only pages at depths 0/1 (unchanged from before)', () => {
    expect(relativeDepths([2, 3, 2, 3])).toEqual([0, 1, 0, 1])
  })

  it('nests three levels when H1 is present', () => {
    expect(relativeDepths([1, 2, 3, 1])).toEqual([0, 1, 2, 0])
  })

  it('returns [] for empty input', () => {
    expect(relativeDepths([])).toEqual([])
  })
})
