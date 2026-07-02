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

import {
  attachDocument,
  detachDocument,
  getAttachedDocuments,
  getDocumentAttachedTo,
  reorderAttachedDocuments,
  createPage,
} from '../db'

describe('docLinks CRUD', () => {
  beforeEach(async () => {
    await db.docLinks.clear()
    await db.pages.clear()
  })

  it('attachDocument appends with incrementing order and dedupes the pair', async () => {
    const subject = await createPage({ title: 'Alice' })
    const d1 = await createPage({ title: 'Letter', category: 'Document' })
    const d2 = await createPage({ title: 'Decree', category: 'Document' })

    await attachDocument(subject, d1)
    await attachDocument(subject, d2)
    await attachDocument(subject, d1) // duplicate — ignored

    const rows = await db.docLinks.where('pageId').equals(subject).sortBy('order')
    expect(rows.map((r) => r.documentId)).toEqual([d1, d2])
    expect(rows.map((r) => r.order)).toEqual([0, 1])
  })

  it('attachDocument rejects self-attach', async () => {
    const p = await createPage({ title: 'Self', category: 'Document' })
    await attachDocument(p, p)
    expect(await db.docLinks.count()).toBe(0)
  })

  it('attachDocument uses max+1 so it never collides after a detach', async () => {
    const s = await createPage({ title: 'S' })
    const d1 = await createPage({ title: 'D1', category: 'Document' })
    const d2 = await createPage({ title: 'D2', category: 'Document' })
    const d3 = await createPage({ title: 'D3', category: 'Document' })
    await attachDocument(s, d1) // order 0
    await attachDocument(s, d2) // order 1
    await detachDocument(s, d1)
    await attachDocument(s, d3) // must be order 2, not 1
    const rows = await db.docLinks.where('pageId').equals(s).sortBy('order')
    expect(rows.map((r) => [r.documentId, r.order])).toEqual([[d2, 1], [d3, 2]])
  })

  it('getAttachedDocuments returns joined pages ordered by order, skipping deleted docs', async () => {
    const s = await createPage({ title: 'S' })
    const d1 = await createPage({ title: 'Zeta', category: 'Document' })
    const d2 = await createPage({ title: 'Alpha', category: 'Document' })
    await attachDocument(s, d1)
    await attachDocument(s, d2)
    await db.pages.delete(d1) // simulate a dangling edge (cascade tested separately)

    const attached = await getAttachedDocuments(s)
    expect(attached.map((a) => a.page.title)).toEqual(['Alpha'])
  })

  it('getDocumentAttachedTo returns owning pages ordered by title', async () => {
    const doc = await createPage({ title: 'Treaty', category: 'Document' })
    const zeta = await createPage({ title: 'Zeta' })
    const alpha = await createPage({ title: 'Alpha' })
    await attachDocument(zeta, doc)
    await attachDocument(alpha, doc)

    const owners = await getDocumentAttachedTo(doc)
    expect(owners.map((o) => o.page.title)).toEqual(['Alpha', 'Zeta'])
  })

  it('reorderAttachedDocuments rewrites order and ignores unknown ids', async () => {
    const s = await createPage({ title: 'S' })
    const d1 = await createPage({ title: 'D1', category: 'Document' })
    const d2 = await createPage({ title: 'D2', category: 'Document' })
    const d3 = await createPage({ title: 'D3', category: 'Document' })
    await attachDocument(s, d1)
    await attachDocument(s, d2)
    await attachDocument(s, d3)

    await reorderAttachedDocuments(s, [d3, d1, 'ghost', d2])

    const rows = await db.docLinks.where('pageId').equals(s).sortBy('order')
    expect(rows.map((r) => r.documentId)).toEqual([d3, d1, d2])
    expect(rows.map((r) => r.order)).toEqual([0, 1, 2])
  })
})
