import { db, uid, now } from './schema'
import { defaultInfobox } from './templates'
import type { LorePage } from './types'

// ---------------------------------------------------------------------------
// Per-page image gallery (#19)
// ---------------------------------------------------------------------------
// Images are stored as compressed JPEG data URLs (see src/imageUtils.ts) in
// their own table keyed by pageId, so a page's text edits never rewrite image
// bytes. `order` is the 0-based grid position; callers reorder by passing the
// full id sequence to reorderImages.

/** Append an image to a page's gallery at the next free order. Uses max+1 (not
 *  count) so an add after a delete never collides with an existing order. The
 *  read-then-add isn't transactional, which is safe for this single-tab app
 *  (no concurrent callers); reorderImages would self-heal any duplicate order. */
export async function addImage(pageId: string, dataUrl: string): Promise<string> {
  const id = uid()
  const existing = await db.images.where('pageId').equals(pageId).toArray()
  const order = existing.reduce((max, img) => Math.max(max, img.order + 1), 0)
  await db.images.add({ id, pageId, dataUrl, caption: '', order, createdAt: now() })
  return id
}

export async function updateImageCaption(id: string, caption: string): Promise<void> {
  await db.images.update(id, { caption })
}

export async function deleteImage(id: string): Promise<void> {
  await db.images.delete(id)
}

/** Reassign order to 0..n-1 following the given id sequence, in one transaction.
 *  Guards ownership: ids in `orderedIds` that don't belong to `pageId` are
 *  ignored, so a stale or foreign id can never reorder another page's images. */
export async function reorderImages(pageId: string, orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.images, async () => {
    const owned = new Set(await db.images.where('pageId').equals(pageId).primaryKeys())
    await Promise.all(
      orderedIds
        .filter((id) => owned.has(id))
        .map((imageId, index) => db.images.update(imageId, { order: index })),
    )
  })
}

/** Promote a gallery image to the page's infobox portrait. Creates a default
 *  infobox first when the page has none (mirrors PageRoute's "Add infobox"). */
export async function setAsPortrait(page: LorePage, dataUrl: string): Promise<void> {
  const infobox = page.infobox ?? (await defaultInfobox(page.category))
  await db.pages.update(page.id, { infobox: { ...infobox, image: dataUrl }, updatedAt: now() })
}
