import { describe, it, expect } from 'vitest'
import { findOpenWikiQuery, rankWikiTitles } from './wikiAutocomplete'

describe('findOpenWikiQuery', () => {
  it('detects an open [[ with a partial query', () => {
    expect(findOpenWikiQuery('See [[Gand')).toEqual({ query: 'Gand', matchLength: 6 })
  })

  it('detects an open [[ with nothing typed yet', () => {
    expect(findOpenWikiQuery('intro [[')).toEqual({ query: '', matchLength: 2 })
  })

  it('allows spaces inside the query', () => {
    expect(findOpenWikiQuery('[[Iron Gu')).toEqual({ query: 'Iron Gu', matchLength: 9 })
  })

  it('returns null when the link is already closed', () => {
    expect(findOpenWikiQuery('[[Gandalf]]')).toBeNull()
  })

  it('returns null when there is no open bracket', () => {
    expect(findOpenWikiQuery('just some text')).toBeNull()
  })

  it('returns null when a single [ is present (needs two)', () => {
    expect(findOpenWikiQuery('an array[0')).toBeNull()
  })

  it('uses only the most recent open bracket', () => {
    expect(findOpenWikiQuery('[[Done]] then [[Ne')).toEqual({ query: 'Ne', matchLength: 4 })
  })

  it('detects an open @ at the start of the text', () => {
    expect(findOpenWikiQuery('@Gand')).toEqual({ query: 'Gand', matchLength: 5 })
  })

  it('detects an open @ after whitespace', () => {
    expect(findOpenWikiQuery('see @Gand')).toEqual({ query: 'Gand', matchLength: 5 })
  })

  it('detects an open @ with nothing typed yet', () => {
    expect(findOpenWikiQuery('intro @')).toEqual({ query: '', matchLength: 1 })
  })

  it('does not trigger @ mid-word (e.g. emails)', () => {
    expect(findOpenWikiQuery('mail foo@bar')).toBeNull()
  })

  it('ends the @ query at the next whitespace', () => {
    expect(findOpenWikiQuery('@Iron Gu')).toBeNull()
  })

  it('lets [[ take precedence over an inner @', () => {
    expect(findOpenWikiQuery('[[@foo')).toEqual({ query: '@foo', matchLength: 6 })
  })
})

describe('rankWikiTitles', () => {
  const titles = ['Gandalf', 'Galadriel', 'Aragorn', 'Gondor', 'Morgoth']

  it('ranks prefix matches before mid-string matches', () => {
    // "or" is a prefix of nothing here; "g" prefixes Gandalf/Galadriel/Gondor,
    // and appears mid-string in Aragorn/Morgoth.
    const out = rankWikiTitles(titles, 'g')
    expect(out.slice(0, 3)).toEqual(['Galadriel', 'Gandalf', 'Gondor'])
    expect(out).toContain('Aragorn')
    expect(out).toContain('Morgoth')
  })

  it('is case-insensitive', () => {
    expect(rankWikiTitles(titles, 'GAND')).toEqual(['Gandalf'])
  })

  it('excludes an exact match (already fully typed)', () => {
    expect(rankWikiTitles(titles, 'Gandalf')).not.toContain('Gandalf')
  })

  it('returns sorted titles for an empty query', () => {
    expect(rankWikiTitles(titles, '')).toEqual(['Aragorn', 'Galadriel', 'Gandalf', 'Gondor', 'Morgoth'])
  })

  it('respects the limit', () => {
    expect(rankWikiTitles(titles, '', 2)).toEqual(['Aragorn', 'Galadriel'])
  })
})
