import { db, uid, now } from './schema'
import { stripHtml } from '../html'
import type { Book, SceneStatus } from './types'

// ---------------------------------------------------------------------------
// Manuscript authoring — the author's real novel (Book → Chapter → Scene) plus a
// Plottr-style plotline grid. Distinct from wiki pages and from the in-world
// Document page type. All tables are per-lore, id-based, and cascade on delete.
// ---------------------------------------------------------------------------

/** Scene draft states, ordered least→most finished. Drives grid/scene colors.
 *  Deliberately separate from the page STATUSES. */
export const SCENE_STATUSES = [
  { name: 'outline', label: 'Outline', color: '#8a8175' },
  { name: 'draft', label: 'Draft', color: '#c98f5a' },
  { name: 'revised', label: 'Revised', color: '#6f9cc7' },
  { name: 'done', label: 'Done', color: '#5aa86b' },
] as const satisfies readonly { name: SceneStatus; label: string; color: string }[]

export function sceneStatusColor(status: SceneStatus): string {
  return SCENE_STATUSES.find((s) => s.name === status)?.color ?? '#8a8175'
}

/** Word count of rich-text HTML: strip tags, then count whitespace-separated runs. */
export function computeWordCount(html: string): number {
  const text = stripHtml(html).trim()
  if (!text) return 0
  return text.split(/\s+/).filter(Boolean).length
}

// --- Books -----------------------------------------------------------------

export async function createBook(title: string): Promise<Book> {
  const existing = await db.books.toArray()
  const order = existing.reduce((max, b) => Math.max(max, b.order + 1), 0)
  const book: Book = {
    id: uid(), title, synopsis: '', order, createdAt: now(), updatedAt: now(),
  }
  await db.books.add(book)
  return book
}

export async function updateBook(
  id: string,
  patch: Partial<Omit<Book, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.books.update(id, { ...patch, updatedAt: now() })
}

export async function listBooks(): Promise<Book[]> {
  return db.books.orderBy('order').toArray()
}

export async function reorderBooks(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.books, async () => {
    let index = 0
    for (const id of orderedIds) {
      const book = await db.books.get(id)
      if (book) {
        await db.books.update(id, { order: index })
        index++
      }
    }
  })
}

export async function deleteBook(id: string): Promise<void> {
  await db.transaction('rw', [db.books, db.chapters, db.scenes, db.plotlines, db.beats], async () => {
    await db.beats.where('bookId').equals(id).delete()
    await db.plotlines.where('bookId').equals(id).delete()
    await db.scenes.where('bookId').equals(id).delete()
    await db.chapters.where('bookId').equals(id).delete()
    await db.books.delete(id)
  })
}
