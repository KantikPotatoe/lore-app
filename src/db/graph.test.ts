import { describe, it, expect } from 'vitest'
import { buildGraphData, nodesWithinHops, type GraphLink, type LorePage } from '../db'
import type { Infobox, InfoboxField } from './types'

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

  it('creates a ghost node (not a real edge) for a link to a missing target', () => {
    const data = buildGraphData([page('a', 'A', { content: link('Ghost') })])
    // The real node has no real neighbours.
    expect(data.nodes.find((n) => n.id === 'a')!.degree).toBe(0)
    // A ghost node and a ghost link are emitted instead of being silently dropped.
    expect(data.nodes.some((n) => n.ghost)).toBe(true)
    expect(data.links).toEqual([{ source: 'a', target: 'ghost:ghost' }])
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

// ---------------------------------------------------------------------------
// Ghost node tests (Task 1)
// ---------------------------------------------------------------------------

/** Minimal page factory for ghost-node tests — only fields buildGraphData reads. */
function ghostPage(partial: Partial<LorePage> & { id: string; title: string }): LorePage {
  return {
    category: 'General',
    content: '',
    summary: '',
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as LorePage
}

describe('buildGraphData ghost nodes', () => {
  it('turns a link to a missing page into one ghost node', () => {
    const pages = [ghostPage({ id: 'a', title: 'Sam', content: `<p>${link('Mordor')}</p>` })]
    const { nodes, links } = buildGraphData(pages)

    const ghost = nodes.find((n) => n.ghost)
    expect(ghost).toBeDefined()
    expect(ghost!.id).toBe('ghost:mordor')
    expect(ghost!.degree).toBe(1)
    expect(links).toContainEqual({ source: 'a', target: 'ghost:mordor' })
  })

  it('collapses two linkers to the same missing title into one ghost (degree 2)', () => {
    const pages = [
      ghostPage({ id: 'a', title: 'Sam', content: `<p>${link('Mordor')}</p>` }),
      ghostPage({ id: 'b', title: 'Frodo', content: `<p>${link('Mordor')}</p>` }),
    ]
    const ghosts = buildGraphData(pages).nodes.filter((n) => n.ghost)
    expect(ghosts).toHaveLength(1)
    expect(ghosts[0].degree).toBe(2)
  })

  it('prettifies the lowercased link text to a title-cased label', () => {
    const pages = [ghostPage({ id: 'a', title: 'Sam', content: `<p>${link('the shire')}</p>` })]
    const ghost = buildGraphData(pages).nodes.find((n) => n.ghost)!
    expect(ghost.title).toBe('The Shire')
  })

  it('does not create a ghost when the target page exists', () => {
    const pages = [
      ghostPage({ id: 'a', title: 'Sam', content: `<p>${link('Frodo')}</p>` }),
      ghostPage({ id: 'b', title: 'Frodo' }),
    ]
    expect(buildGraphData(pages).nodes.some((n) => n.ghost)).toBe(false)
  })

  it('leaves real-node degree unaffected by outgoing ghost links', () => {
    const pages = [
      ghostPage({ id: 'a', title: 'Sam', content: `<p>${link('Frodo')} ${link('Mordor')}</p>` }),
      ghostPage({ id: 'b', title: 'Frodo' }),
    ]
    const sam = buildGraphData(pages).nodes.find((n) => n.id === 'a')!
    expect(sam.degree).toBe(1) // only the real Frodo edge counts
  })
})

// ---------------------------------------------------------------------------
// Depth / neighbourhood traversal (degree/depth slider)
// ---------------------------------------------------------------------------

/** A path graph a—b—c—d, used to check hop distances. */
const PATH: GraphLink[] = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
  { source: 'c', target: 'd' },
]

describe('nodesWithinHops', () => {
  it('returns just the start at 0 hops', () => {
    expect([...nodesWithinHops(PATH, 'a', 0)]).toEqual(['a'])
  })

  it('includes direct neighbours at 1 hop', () => {
    expect([...nodesWithinHops(PATH, 'b', 1)].sort()).toEqual(['a', 'b', 'c'])
  })

  it('reaches further nodes as hops grow, walking links undirected', () => {
    expect([...nodesWithinHops(PATH, 'a', 2)].sort()).toEqual(['a', 'b', 'c'])
    expect([...nodesWithinHops(PATH, 'a', 3)].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does not exceed the reachable set when hops outrun the graph', () => {
    expect([...nodesWithinHops(PATH, 'a', 99)].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('returns just the start id when it is absent from the links', () => {
    expect([...nodesWithinHops(PATH, 'zzz', 3)]).toEqual(['zzz'])
  })

  it('handles a node with several branches', () => {
    const star: GraphLink[] = [
      { source: 'hub', target: 'a' },
      { source: 'hub', target: 'b' },
      { source: 'hub', target: 'c' },
    ]
    expect([...nodesWithinHops(star, 'hub', 1)].sort()).toEqual(['a', 'b', 'c', 'hub'])
    // From a leaf, the other leaves are 2 hops away (via the hub).
    expect([...nodesWithinHops(star, 'a', 1)].sort()).toEqual(['a', 'hub'])
    expect([...nodesWithinHops(star, 'a', 2)].sort()).toEqual(['a', 'b', 'c', 'hub'])
  })
})
