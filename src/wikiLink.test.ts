import { describe, it, expect } from 'vitest'
import { parseWikiToken } from './wikiLink'

describe('parseWikiToken', () => {
  it('returns target=display for a plain token', () => {
    expect(parseWikiToken('Veldhaven')).toEqual({ target: 'Veldhaven', display: 'Veldhaven' })
  })

  it('splits target and display on the pipe', () => {
    expect(parseWikiToken('Odrian Borinor|the stranger'))
      .toEqual({ target: 'Odrian Borinor', display: 'the stranger' })
  })

  it('trims both halves', () => {
    expect(parseWikiToken('  Odrian Borinor  |  the stranger  '))
      .toEqual({ target: 'Odrian Borinor', display: 'the stranger' })
  })

  it('falls back to the target when display is empty', () => {
    expect(parseWikiToken('Veldhaven|')).toEqual({ target: 'Veldhaven', display: 'Veldhaven' })
    expect(parseWikiToken('Veldhaven|   ')).toEqual({ target: 'Veldhaven', display: 'Veldhaven' })
  })

  it('splits on the first pipe only (display may contain pipes)', () => {
    expect(parseWikiToken('Target|a|b')).toEqual({ target: 'Target', display: 'a|b' })
  })

  it('returns null when the target is empty or whitespace', () => {
    expect(parseWikiToken('')).toBeNull()
    expect(parseWikiToken('   ')).toBeNull()
    expect(parseWikiToken('|shown')).toBeNull()
  })
})
