import { describe, it, expect, beforeEach } from 'vitest'
import {
  db,
  createPage,
  updatePage,
  findPageIdByTitle,
  renamePage,
  getBacklinks,
  type Infobox,
} from '../db'

// pages.ts owns the link-resolution and atomic rename/rewrite logic the whole
// wiki depends on. These tests run against the in-memory Dexie DB (cleared each
// time) and pin: title resolution, renamePage rewriting every reference while
// leaving the rest untouched, the clash guard, and backlink gathering.

beforeEach(async () => {
  await db.pages.clear()
})

/** A body anchor linking to `title` (matches what the editor emits). */
function link(title: string): string {
  return `<a data-wikilink data-title="${title}">${title}</a>`
}

function refInfobox(value: string): Infobox {
  return {
    template: 'X',
    image: null,
    caption: '',
    fields: [{ id: 'f1', label: 'Ally', value, fieldType: 'ref' }],
  }
}

describe('findPageIdByTitle', () => {
  it('finds a page case-insensitively and trimming the query', async () => {
    const id = await createPage({ title: 'The Shire' })
    expect(await findPageIdByTitle('  the shire ')).toBe(id)
  })

  it('returns null when no page has that title', async () => {
    await createPage({ title: 'Gondor' })
    expect(await findPageIdByTitle('Mordor')).toBeNull()
  })
})

describe('renamePage', () => {
  it('renames the page and rewrites a body anchor (attr + text) on another page', async () => {
    const target = await createPage({ title: 'Frodo' })
    const linker = await createPage({ title: 'Sam', content: `<p>knows ${link('Frodo')}</p>` })

    await renamePage(target, 'Frodo Baggins')

    expect((await db.pages.get(target))!.title).toBe('Frodo Baggins')
    const body = (await db.pages.get(linker))!.content
    expect(body).toContain('data-title="Frodo Baggins"')
    expect(body).toContain('>Frodo Baggins<')
    expect(body).not.toContain('data-title="Frodo"')
  })

  it('rewrites infobox [[tokens]] that referenced the old title', async () => {
    const target = await createPage({ title: 'Frodo' })
    const linker = await createPage({ title: 'Sam', infobox: refInfobox('[[Frodo]]') })

    await renamePage(target, 'Frodo Baggins')

    const box = (await db.pages.get(linker))!.infobox!
    expect(box.fields[0].value).toBe('[[Frodo Baggins]]')
  })

  it('throws on a title clash and does not rename', async () => {
    const a = await createPage({ title: 'Gondor' })
    await createPage({ title: 'Mordor' })

    await expect(renamePage(a, 'Mordor')).rejects.toThrow(/already exists/)
    expect((await db.pages.get(a))!.title).toBe('Gondor')
  })

  it('no-ops on an empty or unchanged title', async () => {
    const id = await createPage({ title: 'Gondor' })
    const before = (await db.pages.get(id))!.updatedAt

    await renamePage(id, '   ')
    await renamePage(id, 'Gondor')

    const after = await db.pages.get(id)
    expect(after!.title).toBe('Gondor')
    expect(after!.updatedAt).toBe(before)
  })

  it('leaves pages that never referenced the renamed page untouched', async () => {
    const target = await createPage({ title: 'Frodo' })
    const bystander = await createPage({ title: 'Aragorn', content: '<p>no links here</p>' })
    const beforeStamp = (await db.pages.get(bystander))!.updatedAt
    // Make a detectable gap so an unexpected rewrite would change updatedAt.
    await updatePage(target, {})

    await renamePage(target, 'Frodo Baggins')

    expect((await db.pages.get(bystander))!.updatedAt).toBe(beforeStamp)
  })

  it('rewrites a citation marker that targeted the old title', async () => {
    const target = await createPage({ title: 'Frodo' })
    const cited = `<sup data-citation data-target="Frodo" data-locator="p.2" class="citation"></sup>`
    const linker = await createPage({ title: 'Sam', content: `<p>knows him${cited}</p>` })

    await renamePage(target, 'Frodo Baggins')

    const body = (await db.pages.get(linker))!.content
    expect(body).toContain('data-target="Frodo Baggins"')
    expect(body).not.toContain('data-target="Frodo"')
    expect(body).toContain('data-locator="p.2"') // other attrs untouched
  })
})

describe('getBacklinks', () => {
  it('finds linkers via body and infobox, excludes self, sorts by title', async () => {
    const target = await createPage({ title: 'Frodo' })
    // Self-reference must not count.
    await updatePage(target, { content: `<p>${link('Frodo')}</p>` })
    const zed = await createPage({ title: 'Zed', content: `<p>${link('Frodo')}</p>` })
    const amy = await createPage({ title: 'Amy', infobox: refInfobox('[[Frodo]]') })
    await createPage({ title: 'Nobody', content: '<p>nothing</p>' })

    const backlinks = await getBacklinks(target)
    expect(backlinks.map((p) => p.id)).toEqual([amy, zed])
  })

  it('returns [] for an unknown page id', async () => {
    expect(await getBacklinks('does-not-exist')).toEqual([])
  })
})
