import { describe, it, expect, beforeEach } from 'vitest'
import { buildIndex, syncIndex, searchPages } from './search'
import type { LorePage } from './db'

// search.ts uses stripHtml (DOMParser), so the suite-default happy-dom env applies.

const page = (over: Partial<LorePage> & { id: string }): LorePage => ({
  title: '',
  category: 'Character',
  content: '',
  summary: '',
  tags: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

const ids = (q: string): string[] => searchPages(q).map((r) => r.id).sort()

// Reset to a clean, initialised index before each test (buildIndex swaps in a fresh
// Index and clears the store), so syncIndex runs from a realistic post-build state.
beforeEach(() => buildIndex([]))

describe('buildIndex + searchPages', () => {
  it('finds pages by title, stripped body, and tags', () => {
    buildIndex([
      page({ id: 'a', title: 'Gandalf', content: '<p>a <b>wizard</b> of the realm</p>' }),
      page({ id: 'b', title: 'Frodo', summary: 'a hobbit', tags: ['ringbearer'] }),
    ])
    expect(ids('Gandalf')).toEqual(['a'])
    expect(ids('wizard')).toEqual(['a']) // HTML tags stripped before indexing
    expect(ids('ringbearer')).toEqual(['b'])
    expect(searchPages('')).toEqual([])
  })
})

describe('syncIndex — incremental deltas', () => {
  it('adds a new page', () => {
    syncIndex([page({ id: 'a', title: 'Aragorn' })])
    expect(ids('Aragorn')).toEqual(['a'])
  })

  it('updates a changed page (new term found, old term gone)', () => {
    const p = page({ id: 'a', title: 'Strider', updatedAt: 1 })
    syncIndex([p])
    expect(ids('Strider')).toEqual(['a'])

    syncIndex([{ ...p, title: 'Aragorn', updatedAt: 2 }])
    expect(ids('Aragorn')).toEqual(['a'])
    expect(ids('Strider')).toEqual([]) // old indexed text replaced
  })

  it('removes a page that is no longer present', () => {
    syncIndex([page({ id: 'a', title: 'Boromir' }), page({ id: 'b', title: 'Faramir' })])
    expect(ids('Boromir')).toEqual(['a'])

    syncIndex([page({ id: 'b', title: 'Faramir' })]) // 'a' dropped
    expect(ids('Boromir')).toEqual([])
    expect(ids('Faramir')).toEqual(['b'])
  })

  it('skips re-indexing a page whose updatedAt is unchanged', () => {
    syncIndex([page({ id: 'a', title: 'Legolas', updatedAt: 5 })])
    expect(ids('Legolas')).toEqual(['a'])

    // Same updatedAt but different content: syncIndex must treat it as unchanged and
    // skip the re-parse, so the index still reflects the originally-indexed text.
    syncIndex([page({ id: 'a', title: 'Gimli', updatedAt: 5 })])
    expect(ids('Legolas')).toEqual(['a'])
    expect(ids('Gimli')).toEqual([])
  })

  it('applies a mix of add, update, remove, and skip in one call', () => {
    syncIndex([
      page({ id: 'keep', title: 'Unchanged', updatedAt: 1 }),
      page({ id: 'edit', title: 'Before', updatedAt: 1 }),
      page({ id: 'gone', title: 'Doomed', updatedAt: 1 }),
    ])

    syncIndex([
      page({ id: 'keep', title: 'Unchanged', updatedAt: 1 }), // skip (same updatedAt)
      page({ id: 'edit', title: 'After', updatedAt: 2 }), // update
      page({ id: 'fresh', title: 'Newcomer', updatedAt: 1 }), // add
      // 'gone' omitted → remove
    ])

    expect(ids('Unchanged')).toEqual(['keep'])
    expect(ids('After')).toEqual(['edit'])
    expect(ids('Before')).toEqual([])
    expect(ids('Newcomer')).toEqual(['fresh'])
    expect(ids('Doomed')).toEqual([])
  })
})
