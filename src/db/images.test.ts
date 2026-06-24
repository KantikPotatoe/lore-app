import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'

// Gallery images live in their own table (not on LorePage) so editing page text
// never rewrites image bytes. This first test just proves the v8 table + its
// pageId/order indexes exist and round-trip a row.

beforeEach(async () => {
  await db.images.clear()
})

describe('images table (schema v8)', () => {
  it('stores and reads back an image row by pageId, sorted by order', async () => {
    await db.images.add({ id: 'i2', pageId: 'p1', dataUrl: 'data:image/png;base64,AAA', caption: 'b', order: 1, createdAt: 2 })
    await db.images.add({ id: 'i1', pageId: 'p1', dataUrl: 'data:image/png;base64,BBB', caption: 'a', order: 0, createdAt: 1 })
    await db.images.add({ id: 'i3', pageId: 'p2', dataUrl: 'data:image/png;base64,CCC', caption: 'c', order: 0, createdAt: 3 })

    const forP1 = await db.images.where('pageId').equals('p1').sortBy('order')
    expect(forP1.map((i) => i.id)).toEqual(['i1', 'i2'])
  })
})
