import { afterEach, describe, expect, it } from 'vitest'
import { db } from './schema'

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
