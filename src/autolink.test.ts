import { describe, it, expect } from 'vitest'
import { buildTitleMatcher, findAutolinkMatches } from './autolink'

describe('buildTitleMatcher', () => {
  it('returns null for an empty or all-whitespace title set', () => {
    expect(buildTitleMatcher([])).toBeNull()
    expect(buildTitleMatcher(['', '   '])).toBeNull()
  })
})

describe('findAutolinkMatches', () => {
  const matcher = (titles: string[]) => buildTitleMatcher(titles)!

  it('matches a known title, case-insensitively, with canonical casing', () => {
    const out = findAutolinkMatches('the iron gate stood', matcher(['Iron']))
    expect(out).toEqual([{ from: 4, to: 8, title: 'Iron' }])
  })

  it('matches whole words only (not inside a larger word)', () => {
    expect(findAutolinkMatches('an Ironclad hull', matcher(['Iron']))).toEqual([])
  })

  it('prefers the longest title on overlap', () => {
    const out = findAutolinkMatches('the Iron Guard fell', matcher(['Iron', 'Iron Guard']))
    expect(out).toEqual([{ from: 4, to: 14, title: 'Iron Guard' }])
  })

  it('returns multiple matches in document order', () => {
    const out = findAutolinkMatches('Arn met Bel', matcher(['Arn', 'Bel']))
    expect(out.map((m) => m.title)).toEqual(['Arn', 'Bel'])
  })

  it('respects Unicode word boundaries for accented titles', () => {
    const out = findAutolinkMatches('met Élan today', matcher(['Élan']))
    expect(out).toEqual([{ from: 4, to: 8, title: 'Élan' }])
  })

  it('escapes regex-special characters in titles', () => {
    const out = findAutolinkMatches('the C.H.U.D. came', matcher(['C.H.U.D.']))
    expect(out).toEqual([{ from: 4, to: 12, title: 'C.H.U.D.' }])
  })
})
