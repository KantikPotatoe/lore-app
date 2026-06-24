import { describe, it, expect } from 'vitest'
import { buildGraphData } from './graph'
import type { Infobox, InfoboxField, LorePage } from './types'

// buildGraphData is a pure function over a page array, so these tests pass pages
// in directly (no DB). They pin the documented edge rules: a node per page
// (link-less pages included), self-links dropped, A↔B collapsed to one undirected
// edge, degree = distinct neighbours, case-insensitive title resolution, and
// links read from both the body and the infobox.

let seq = 0
function field(value: string): InfoboxField {
  return { id: `f${seq++}`, label: 'Ref', value, fieldType: 'ref' }
}
function infobox(fields: InfoboxField[]): Infobox {
  return { template: 'X', image: null, caption: '', fields }
}
function page(id: string, title: string, opts: Partial<LorePage> = {}): LorePage {
  return {
    id,
    title,
    category: 'Character',
    content: '',
    summary: '',
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    ...opts,
  }
}
/** A body anchor linking to the given title. */
function link(title: string): string {
  return `<a data-wikilink data-title="${title}">${title}</a>`
}

describe('buildGraphData', () => {
  it('makes a node per page, including link-less pages (lone dots)', () => {
    const data = buildGraphData([page('a', 'A'), page('b', 'B')])
    expect(data.nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(data.links).toEqual([])
    expect(data.nodes.every((n) => n.degree === 0)).toBe(true)
  })

  it('creates one edge for a resolved link and raises both degrees', () => {
    const data = buildGraphData([
      page('a', 'A', { content: link('B') }),
      page('b', 'B'),
    ])
    expect(data.links).toEqual([{ source: 'a', target: 'b' }])
    expect(data.nodes.find((n) => n.id === 'a')!.degree).toBe(1)
    expect(data.nodes.find((n) => n.id === 'b')!.degree).toBe(1)
  })

  it('drops links to a missing target', () => {
    const data = buildGraphData([page('a', 'A', { content: link('Ghost') })])
    expect(data.links).toEqual([])
    expect(data.nodes[0].degree).toBe(0)
  })

  it('drops self-links', () => {
    const data = buildGraphData([page('a', 'A', { content: link('A') })])
    expect(data.links).toEqual([])
    expect(data.nodes[0].degree).toBe(0)
  })

  it('collapses A→B and B→A into a single undirected edge', () => {
    const data = buildGraphData([
      page('a', 'A', { content: link('B') }),
      page('b', 'B', { content: link('A') }),
    ])
    expect(data.links).toHaveLength(1)
    expect(data.nodes.find((n) => n.id === 'a')!.degree).toBe(1)
    expect(data.nodes.find((n) => n.id === 'b')!.degree).toBe(1)
  })

  it('counts distinct neighbours for degree', () => {
    const data = buildGraphData([
      page('hub', 'Hub', { content: link('A') + link('B') + link('A') }),
      page('a', 'A'),
      page('b', 'B'),
    ])
    expect(data.nodes.find((n) => n.id === 'hub')!.degree).toBe(2)
    // The duplicate A link does not produce a second edge.
    expect(data.links).toHaveLength(2)
  })

  it('resolves titles case-insensitively', () => {
    const data = buildGraphData([
      page('a', 'A', { content: link('gOnDoR') }),
      page('g', 'Gondor'),
    ])
    expect(data.links).toEqual([{ source: 'a', target: 'g' }])
  })

  it('reads links from infobox ref fields too', () => {
    const data = buildGraphData([
      page('a', 'A', { infobox: infobox([field('[[B]]')]) }),
      page('b', 'B'),
    ])
    expect(data.links).toEqual([{ source: 'a', target: 'b' }])
  })
})
