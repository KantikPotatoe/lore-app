import { db, uid, now } from './schema'
import type { DocLink, LorePage } from './types'

// ---------------------------------------------------------------------------
// Linked documents on pages (#109)
// ---------------------------------------------------------------------------
// A page can have a curated, drag-ordered list of Document-type pages attached
// to it. Each attachment is one id-based edge in the docLinks table, indexed on
// both pageId and documentId so each direction is a cheap lookup. Because the
// edge stores ids (not titles), renaming a page never has to rewrite it.

/** An attachment edge joined to the page on the far end of it. */
export interface AttachedDoc {
  link: DocLink
  page: LorePage
}

/** Attach `documentId` to `pageId`. No-op on self-attach or a duplicate pair.
 *  Appends at max+1 (not count) so an attach after a detach never collides with
 *  an existing order. Not transactional — safe for this single-tab app; a stray
 *  duplicate order would self-heal on the next reorderAttachedDocuments. */
export async function attachDocument(pageId: string, documentId: string): Promise<void> {
  if (pageId === documentId) return
  const existing = await db.docLinks.where('pageId').equals(pageId).toArray()
  if (existing.some((l) => l.documentId === documentId)) return
  const order = existing.reduce((max, l) => Math.max(max, l.order + 1), 0)
  await db.docLinks.add({ id: uid(), pageId, documentId, order, createdAt: now() })
}

/** Remove the (pageId, documentId) attachment if present. */
export async function detachDocument(pageId: string, documentId: string): Promise<void> {
  const match = await db.docLinks
    .where('pageId')
    .equals(pageId)
    .and((l) => l.documentId === documentId)
    .first()
  if (match) await db.docLinks.delete(match.id)
}

/** Owning side: the documents attached to `pageId`, joined to their pages and
 *  ordered by the curated `order`. Edges whose document page no longer exists
 *  are skipped (defense in depth; deletePage cascades so this is rare). */
export async function getAttachedDocuments(pageId: string): Promise<AttachedDoc[]> {
  const links = await db.docLinks.where('pageId').equals(pageId).sortBy('order')
  const out: AttachedDoc[] = []
  for (const link of links) {
    const page = await db.pages.get(link.documentId)
    if (page) out.push({ link, page })
  }
  return out
}

/** Reciprocal side: the pages `documentId` is attached to, joined to their pages
 *  and ordered by page title (there is no per-doc order on this side). */
export async function getDocumentAttachedTo(documentId: string): Promise<AttachedDoc[]> {
  const links = await db.docLinks.where('documentId').equals(documentId).toArray()
  const out: AttachedDoc[] = []
  for (const link of links) {
    const page = await db.pages.get(link.pageId)
    if (page) out.push({ link, page })
  }
  out.sort((a, b) => a.page.title.toLowerCase().localeCompare(b.page.title.toLowerCase()))
  return out
}

/** Reassign order to 0..n-1 following `orderedDocIds`, in one transaction. Ids
 *  not currently attached to `pageId` are ignored, so a stale or foreign id can
 *  never reorder another page's list. */
export async function reorderAttachedDocuments(
  pageId: string,
  orderedDocIds: string[],
): Promise<void> {
  await db.transaction('rw', db.docLinks, async () => {
    const links = await db.docLinks.where('pageId').equals(pageId).toArray()
    const byDoc = new Map(links.map((l) => [l.documentId, l]))
    let index = 0
    for (const docId of orderedDocIds) {
      const link = byDoc.get(docId)
      if (link) {
        await db.docLinks.update(link.id, { order: index })
        index++
      }
    }
  })
}
