import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import {
  SCENE_STATUSES, sceneStatusColor, computeWordCount,
  createBook, updateBook, deleteBook, listBooks, reorderBooks,
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
