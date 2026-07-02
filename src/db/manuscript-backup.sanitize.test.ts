// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { db, exportAll, importAll } from '../db'

// Asserting that <script> is *stripped* on import requires jsdom's parser: under
// happy-dom, <script> survives DOMPurify, which would make this assertion flaky.
afterEach(async () => {
  await Promise.all([db.books.clear(), db.chapters.clear(), db.scenes.clear(), db.pages.clear()])
})

describe('backup sanitizes scene content on import', () => {
  it('strips <script> from scene.content', async () => {
    await db.books.add({ id: 'b1', title: 'B', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 })
    await db.chapters.add({ id: 'c1', bookId: 'b1', title: 'C', order: 0, createdAt: 1, updatedAt: 1 })
    await db.scenes.add({
      id: 's1', bookId: 'b1', chapterId: 'c1', title: 'S',
      content: '<p>ok</p><script>alert(1)</script>', synopsis: '', notes: '',
      status: 'draft', order: 0, wordCount: 1, povPageId: null,
      castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: 1,
    })
    const json = await exportAll()
    await importAll(json)
    expect((await db.scenes.get('s1'))?.content).not.toContain('<script>')
  })
})
