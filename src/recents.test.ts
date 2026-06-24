import { beforeEach, describe, expect, it } from 'vitest'
import { getRecent, recordRecent, pruneRecent } from './recents'

const L = 'test-lore'

beforeEach(() => localStorage.clear())

describe('recents', () => {
  it('starts empty', () => {
    expect(getRecent(L)).toEqual([])
  })

  it('prepends most-recent-first', () => {
    recordRecent('a', L)
    recordRecent('b', L)
    expect(getRecent(L)).toEqual(['b', 'a'])
  })

  it('dedupes — re-visiting moves an id to the front', () => {
    recordRecent('a', L)
    recordRecent('b', L)
    recordRecent('a', L)
    expect(getRecent(L)).toEqual(['a', 'b'])
  })

  it('caps the list at 6', () => {
    for (const id of ['1', '2', '3', '4', '5', '6', '7']) recordRecent(id, L)
    expect(getRecent(L)).toEqual(['7', '6', '5', '4', '3', '2'])
  })

  it('is scoped per world', () => {
    recordRecent('a', 'world-1')
    recordRecent('b', 'world-2')
    expect(getRecent('world-1')).toEqual(['a'])
    expect(getRecent('world-2')).toEqual(['b'])
  })

  it('prunes ids not in the known set', () => {
    recordRecent('a', L)
    recordRecent('b', L)
    recordRecent('c', L)
    expect(pruneRecent(new Set(['a', 'c']), L)).toEqual(['c', 'a'])
    expect(getRecent(L)).toEqual(['c', 'a'])
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('lore:test-lore:recentPages', '{not json')
    expect(getRecent(L)).toEqual([])
  })
})
