import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import type { DocLink } from '../db'

beforeEach(async () => {
  await db.docLinks.clear()
})

describe('docLinks table (schema v10)', () => {
  it('round-trips a row and queries by both indexes', async () => {
    const row: DocLink = { id: 'e1', pageId: 'p1', documentId: 'd1', order: 0, createdAt: 1 }
    await db.docLinks.add(row)
    await db.docLinks.add({ id: 'e2', pageId: 'p1', documentId: 'd2', order: 1, createdAt: 2 })
    await db.docLinks.add({ id: 'e3', pageId: 'p2', documentId: 'd1', order: 0, createdAt: 3 })

    const byPage = await db.docLinks.where('pageId').equals('p1').sortBy('order')
    expect(byPage.map((l) => l.documentId)).toEqual(['d1', 'd2'])

    const byDoc = await db.docLinks.where('documentId').equals('d1').toArray()
    expect(byDoc.map((l) => l.id).sort()).toEqual(['e1', 'e3'])
  })
})
