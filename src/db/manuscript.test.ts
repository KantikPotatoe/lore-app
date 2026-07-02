import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import {
  SCENE_STATUSES, sceneStatusColor, computeWordCount,
  createBook, updateBook, deleteBook, listBooks, reorderBooks,
  createChapter, updateChapter, listChapters, reorderChapters, deleteChapter,
  createScene, updateScene, listScenes, reorderScenes, moveScene, deleteScene,
  chapterWordCount, bookWordCount, sceneAppearances,
  createPlotline, updatePlotline, listPlotlines, reorderPlotlines, deletePlotline,
  createBeat, updateBeat, deleteBeat, listBeats,
} from './manuscript'

afterEach(async () => {
  await Promise.all([
    db.books.clear(), db.chapters.clear(), db.scenes.clear(),
    db.plotlines.clear(), db.beats.clear(),
  ])
})

describe('manuscript schema', () => {
  it('exposes the five manuscript tables at v11', async () => {
    expect(db.verno).toBeGreaterThanOrEqual(11)
    // A round-trip through the books table proves the store exists and is writable.
    await db.books.add({
      id: 'b1', title: 'Book One', synopsis: '', order: 0,
      createdAt: 1, updatedAt: 1,
    })
    expect(await db.books.get('b1')).toMatchObject({ title: 'Book One' })
  })
})

describe('computeWordCount', () => {
  it('counts words in stripped HTML', () => {
    expect(computeWordCount('<p>Hello brave new world</p>')).toBe(4)
  })
  it('is zero for empty or tag-only HTML', () => {
    expect(computeWordCount('')).toBe(0)
    expect(computeWordCount('<p></p>')).toBe(0)
  })
})

describe('scene statuses', () => {
  it('has the four ordered states with colors', () => {
    expect(SCENE_STATUSES.map((s) => s.name)).toEqual(['outline', 'draft', 'revised', 'done'])
    expect(sceneStatusColor('draft')).toMatch(/^#/)
  })
})

describe('book CRUD', () => {
  it('creates books with incrementing order', async () => {
    const a = await createBook('Alpha')
    const b = await createBook('Beta')
    expect(a.order).toBe(0)
    expect(b.order).toBe(1)
    expect((await listBooks()).map((x) => x.title)).toEqual(['Alpha', 'Beta'])
  })

  it('updates a book and bumps updatedAt', async () => {
    const a = await createBook('Alpha')
    await updateBook(a.id, { title: 'Alpha Prime' })
    const got = (await listBooks()).find((x) => x.id === a.id)
    expect(got?.title).toBe('Alpha Prime')
    expect(got?.updatedAt).toBeGreaterThanOrEqual(a.updatedAt)
  })

  it('reorders books to match the given id order', async () => {
    const a = await createBook('Alpha')
    const b = await createBook('Beta')
    await reorderBooks([b.id, a.id])
    expect((await listBooks()).map((x) => x.title)).toEqual(['Beta', 'Alpha'])
  })

  it('deleteBook cascades its chapters, scenes, plotlines and beats', async () => {
    const a = await createBook('Alpha')
    await db.chapters.add({ id: 'c1', bookId: a.id, title: 'Ch', order: 0, createdAt: 1, updatedAt: 1 })
    await db.scenes.add({
      id: 's1', bookId: a.id, chapterId: 'c1', title: 'Sc', content: '', synopsis: '',
      notes: '', status: 'outline', order: 0, wordCount: 0, povPageId: null,
      castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: 1,
    })
    await db.plotlines.add({ id: 'p1', bookId: a.id, name: 'Main', color: '#fff', kind: 'plot', order: 0, createdAt: 1, updatedAt: 1 })
    await db.beats.add({ id: 'bt1', bookId: a.id, plotlineId: 'p1', sceneId: 's1', label: '', note: 'x', order: 0, createdAt: 1, updatedAt: 1 })
    await deleteBook(a.id)
    expect(await db.chapters.count()).toBe(0)
    expect(await db.scenes.count()).toBe(0)
    expect(await db.plotlines.count()).toBe(0)
    expect(await db.beats.count()).toBe(0)
    expect(await db.books.get(a.id)).toBeUndefined()
  })
})

describe('chapter CRUD', () => {
  it('creates chapters ordered within their book', async () => {
    const book = await createBook('B')
    const c1 = await createChapter(book.id, 'One')
    const c2 = await createChapter(book.id, 'Two')
    expect(c1.order).toBe(0)
    expect(c2.order).toBe(1)
    expect((await listChapters(book.id)).map((c) => c.title)).toEqual(['One', 'Two'])
  })

  it('scopes ordering per book', async () => {
    const b1 = await createBook('B1')
    const b2 = await createBook('B2')
    await createChapter(b1.id, 'A')
    const other = await createChapter(b2.id, 'B')
    expect(other.order).toBe(0) // independent of b1's chapters
  })

  it('updates a chapter title', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    await updateChapter(ch.id, { title: 'First' })
    expect((await listChapters(book.id))[0].title).toBe('First')
  })

  it('reorders chapters within a book', async () => {
    const book = await createBook('B')
    const c1 = await createChapter(book.id, 'One')
    const c2 = await createChapter(book.id, 'Two')
    await reorderChapters(book.id, [c2.id, c1.id])
    expect((await listChapters(book.id)).map((c) => c.title)).toEqual(['Two', 'One'])
  })

  it('deleteChapter removes its scenes', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    await db.scenes.add({
      id: 's1', bookId: book.id, chapterId: ch.id, title: 'Sc', content: '', synopsis: '',
      notes: '', status: 'outline', order: 0, wordCount: 0, povPageId: null,
      castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: 1,
    })
    await deleteChapter(ch.id)
    expect(await db.chapters.get(ch.id)).toBeUndefined()
    expect(await db.scenes.count()).toBe(0)
  })
})

describe('scene CRUD', () => {
  it('creates a scene with sensible defaults', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    const sc = await createScene(book.id, ch.id, 'Opening')
    expect(sc).toMatchObject({
      status: 'outline', order: 0, wordCount: 0, content: '',
      povPageId: null, castPageIds: [], locationPageIds: [],
    })
  })

  it('recomputes wordCount when content changes', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    const sc = await createScene(book.id, ch.id, 'Opening')
    await updateScene(sc.id, { content: '<p>one two three</p>' })
    expect((await db.scenes.get(sc.id))?.wordCount).toBe(3)
  })

  it('does not touch wordCount when content is not in the patch', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    const sc = await createScene(book.id, ch.id, 'Opening')
    await updateScene(sc.id, { content: '<p>a b</p>' })
    await updateScene(sc.id, { status: 'draft' })
    expect((await db.scenes.get(sc.id))?.wordCount).toBe(2)
  })

  it('rolls up word counts by chapter and book', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    const a = await createScene(book.id, ch.id, 'A')
    const b = await createScene(book.id, ch.id, 'B')
    await updateScene(a.id, { content: '<p>one two</p>' })
    await updateScene(b.id, { content: '<p>three</p>' })
    expect(await chapterWordCount(ch.id)).toBe(3)
    expect(await bookWordCount(book.id)).toBe(3)
  })

  it('reorders scenes within a chapter', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    const a = await createScene(book.id, ch.id, 'A')
    const b = await createScene(book.id, ch.id, 'B')
    await reorderScenes(ch.id, [b.id, a.id])
    expect((await listScenes(ch.id)).map((s) => s.title)).toEqual(['B', 'A'])
  })

  it('moves a scene to another chapter at an index', async () => {
    const book = await createBook('B')
    const c1 = await createChapter(book.id, 'One')
    const c2 = await createChapter(book.id, 'Two')
    const sc = await createScene(book.id, c1.id, 'Wanderer')
    await moveScene(sc.id, c2.id, 0)
    const moved = await db.scenes.get(sc.id)
    expect(moved?.chapterId).toBe(c2.id)
    expect((await listScenes(c1.id)).length).toBe(0)
    expect((await listScenes(c2.id)).map((s) => s.id)).toEqual([sc.id])
  })

  it('deleteScene removes plot beats but unplaces structure beats', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    const sc = await createScene(book.id, ch.id, 'A')
    await db.plotlines.bulkAdd([
      { id: 'plot', bookId: book.id, name: 'Main', color: '#fff', kind: 'plot', order: 0, createdAt: 1, updatedAt: 1 },
      { id: 'struct', bookId: book.id, name: 'Save the Cat', color: '#000', kind: 'structure', structureType: 'save-the-cat', order: 1, createdAt: 1, updatedAt: 1 },
    ])
    await db.beats.bulkAdd([
      { id: 'plotBeat', bookId: book.id, plotlineId: 'plot', sceneId: sc.id, label: '', note: 'x', order: 0, createdAt: 1, updatedAt: 1 },
      { id: 'structBeat', bookId: book.id, plotlineId: 'struct', sceneId: sc.id, label: 'Catalyst', note: '', order: 0, createdAt: 1, updatedAt: 1 },
    ])
    await deleteScene(sc.id)
    expect(await db.beats.get('plotBeat')).toBeUndefined()
    expect((await db.beats.get('structBeat'))?.sceneId).toBeNull()
  })
})

describe('sceneAppearances', () => {
  afterEach(async () => { await db.pages.clear() })

  async function seedPage(id: string, title: string) {
    await db.pages.add({
      id, title, category: 'Character', content: '', summary: '', tags: [],
      createdAt: 1, updatedAt: 1,
    } as never)
  }

  it('finds scenes by pov/cast/location refs', async () => {
    await seedPage('alice', 'Alice')
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'Chapter One')
    const sc = await createScene(book.id, ch.id, 'The Meeting')
    await updateScene(sc.id, { castPageIds: ['alice'] })
    const out = await sceneAppearances('alice')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      sceneTitle: 'The Meeting', chapterTitle: 'Chapter One', bookTitle: 'B',
    })
    expect(out[0].roles).toContain('cast')
  })

  it('finds scenes that mention the page via an inline wiki link', async () => {
    await seedPage('bob', 'Bob')
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'C')
    const sc = await createScene(book.id, ch.id, 'S')
    await updateScene(sc.id, {
      content: '<p><a data-wikilink="" data-title="Bob" class="wiki-link">Bob</a> arrives.</p>',
    })
    const out = await sceneAppearances('bob')
    expect(out).toHaveLength(1)
    expect(out[0].roles).toContain('mention')
  })

  it('returns empty for a page with no appearances', async () => {
    await seedPage('nobody', 'Nobody')
    expect(await sceneAppearances('nobody')).toEqual([])
  })

  it('collapses multiple roles for one scene into a single entry', async () => {
    await seedPage('alice', 'Alice')
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'C')
    const sc = await createScene(book.id, ch.id, 'S')
    await updateScene(sc.id, {
      povPageId: 'alice',
      content: '<p><a data-wikilink="" data-title="Alice" class="wiki-link">Alice</a></p>',
    })
    const out = await sceneAppearances('alice')
    expect(out).toHaveLength(1)
    expect(out[0].roles).toEqual(expect.arrayContaining(['pov', 'mention']))
  })
})

describe('plotline CRUD', () => {
  afterEach(async () => { await Promise.all([db.plotlines.clear(), db.beats.clear()]) })

  it('creates plotlines ordered within a book, with a default color and kind', async () => {
    const a = await createPlotline('b1', 'Main Arc')
    const b = await createPlotline('b1', 'Romance')
    expect(a.order).toBe(0)
    expect(b.order).toBe(1)
    expect(a.kind).toBe('plot')
    expect(a.color).toMatch(/^#/)
    expect((await listPlotlines('b1')).map((p) => p.name)).toEqual(['Main Arc', 'Romance'])
  })

  it('updates and reorders plotlines', async () => {
    const a = await createPlotline('b1', 'A')
    const b = await createPlotline('b1', 'B')
    await updatePlotline(a.id, { name: 'A-prime', color: '#123456' })
    await reorderPlotlines('b1', [b.id, a.id])
    const list = await listPlotlines('b1')
    expect(list.map((p) => p.name)).toEqual(['B', 'A-prime'])
    expect(list[1].color).toBe('#123456')
  })

  it('deletePlotline cascades its beats', async () => {
    const a = await createPlotline('b1', 'A')
    await db.beats.add({ id: 'bt1', bookId: 'b1', plotlineId: a.id, sceneId: 's1', label: '', note: 'x', order: 0, createdAt: 1, updatedAt: 1 })
    await deletePlotline(a.id)
    expect(await db.plotlines.get(a.id)).toBeUndefined()
    expect(await db.beats.count()).toBe(0)
  })
})

describe('beat CRUD', () => {
  afterEach(async () => { await Promise.all([db.plotlines.clear(), db.beats.clear()]) })

  it('creates, updates, lists and deletes beats', async () => {
    const p = await createPlotline('b1', 'A')
    const beat = await createBeat('b1', p.id, 's1', 'first note')
    expect(beat.note).toBe('first note')
    expect((await listBeats('b1')).length).toBe(1)
    await updateBeat(beat.id, { note: 'edited' })
    expect((await db.beats.get(beat.id))?.note).toBe('edited')
    await deleteBeat(beat.id)
    expect(await db.beats.count()).toBe(0)
  })
})
