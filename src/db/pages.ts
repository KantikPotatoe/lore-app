import { db, uid, now, DEFAULT_CATEGORY, DEFAULT_STATUS } from './schema'
import { defaultInfobox } from './templates'
import { parseHtml, wikiLinkTitles } from '../html'
import type { LorePage } from './types'

// ---------------------------------------------------------------------------
// Page CRUD
// ---------------------------------------------------------------------------

export async function createPage(partial: Partial<LorePage> = {}): Promise<string> {
  const id = uid()
  const category = partial.category || DEFAULT_CATEGORY
  const page: LorePage = {
    id,
    title: partial.title?.trim() || 'Untitled',
    category,
    content: partial.content || '',
    summary: partial.summary || '',
    status: partial.status || DEFAULT_STATUS,
    tags: partial.tags || [],
    infobox: partial.infobox ?? (await defaultInfobox(category)),
    createdAt: now(),
    updatedAt: now(),
  }
  await db.pages.add(page)
  return id
}

export async function updatePage(id: string, changes: Partial<LorePage>): Promise<void> {
  await db.pages.update(id, { ...changes, updatedAt: now() })
}

export async function deletePage(id: string): Promise<void> {
  await db.pages.delete(id)
  // Remove this page's gallery images so no orphans are left behind.
  await db.images.where('pageId').equals(id).delete()
  // Unlink any pins that pointed at this page.
  const linked = await db.pins.where('pageId').equals(id).toArray()
  await Promise.all(linked.map((p) => db.pins.update(p.id, { pageId: null })))
}

/** Find an existing page's id by title (case-insensitive), or null. No creation —
 *  clicking a link to a missing page is handled (with confirmation) by the caller. */
export async function findPageIdByTitle(title: string): Promise<string | null> {
  const trimmed = title.trim().toLowerCase()
  const all = await db.pages.toArray()
  return all.find((p) => p.title.trim().toLowerCase() === trimmed)?.id ?? null
}

/** Rewrite every reference to `oldTitle` into `newTitle` within one page's body
 *  and infobox. Matches titles case-insensitively. Returns only the changed fields,
 *  or null if this page referenced nothing (so untouched pages aren't re-written). */
function rewriteLinksInPage(
  page: LorePage,
  oldTitle: string,
  newTitle: string,
): Partial<LorePage> | null {
  const oldLc = oldTitle.trim().toLowerCase()
  const out: Partial<LorePage> = {}
  let changed = false

  // Body: rewrite <a data-wikilink data-title="Old"> (attribute + text) AND
  // <sup data-citation data-target="Old"> citation markers.
  if (page.content && (page.content.includes('data-wikilink') || page.content.includes('data-citation'))) {
    const doc = parseHtml(page.content)
    let bodyChanged = false
    doc.querySelectorAll('a[data-wikilink]').forEach((a) => {
      if (a.getAttribute('data-title')?.trim().toLowerCase() === oldLc) {
        a.setAttribute('data-title', newTitle)
        a.textContent = newTitle
        bodyChanged = true
      }
    })
    doc.querySelectorAll('sup[data-citation]').forEach((s) => {
      if (s.getAttribute('data-target')?.trim().toLowerCase() === oldLc) {
        s.setAttribute('data-target', newTitle)
        bodyChanged = true
      }
    })
    if (bodyChanged) {
      out.content = doc.body.innerHTML
      changed = true
    }
  }

  // Infobox: field values keep raw [[Name]] tokens (covers plain AND ref fields).
  if (page.infobox) {
    let boxChanged = false
    const fields = page.infobox.fields.map((f) => {
      const v = f.value.replace(/\[\[([^\]]+)\]\]/g, (m, inner) =>
        inner.trim().toLowerCase() === oldLc ? `[[${newTitle}]]` : m,
      )
      if (v !== f.value) boxChanged = true
      return v === f.value ? f : { ...f, value: v }
    })
    if (boxChanged) {
      out.infobox = { ...page.infobox, fields }
      changed = true
    }
  }

  return changed ? out : null
}

/** Rename a page and rewrite every reference to it across all other pages, so no
 *  [[links]] break. Throws if another page already holds the new title (which would
 *  make links ambiguous). No-ops on an empty or unchanged title. */
export async function renamePage(id: string, newTitle: string): Promise<void> {
  const trimmed = newTitle.trim()
  const page = await db.pages.get(id)
  if (!page) return
  const oldTitle = page.title
  if (!trimmed || trimmed === oldTitle) return

  const all = await db.pages.toArray()
  const clash = all.find(
    (p) => p.id !== id && p.title.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  if (clash) throw new Error(`A page titled "${clash.title}" already exists.`)

  await db.transaction('rw', db.pages, async () => {
    await db.pages.update(id, { title: trimmed, updatedAt: now() })
    for (const p of all) {
      if (p.id === id) continue
      const rewritten = rewriteLinksInPage(p, oldTitle, trimmed)
      if (rewritten) await db.pages.update(p.id, { ...rewritten, updatedAt: now() })
    }
  })
}

// ---------------------------------------------------------------------------
// Backlinks — "which other pages link to this one"
// ---------------------------------------------------------------------------

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

/** Every page title (lowercased) that a page links to, gathered from its
 *  rich-text body and its infobox field values. */
export function linkedTitles(page: LorePage): Set<string> {
  const titles = new Set<string>()
  // Body: editor wiki links render as <a data-wikilink data-title="...">.
  for (const t of wikiLinkTitles(page.content)) titles.add(t.toLowerCase())
  // Infobox field values keep the raw [[Name]] syntax.
  if (page.infobox) {
    for (const field of page.infobox.fields) {
      for (const m of field.value.matchAll(WIKILINK_RE)) {
        const t = m[1].trim().toLowerCase()
        if (t) titles.add(t)
      }
    }
  }
  return titles
}

/** All pages that link to the page with the given id. */
export async function getBacklinks(pageId: string): Promise<LorePage[]> {
  const target = await db.pages.get(pageId)
  const targetTitle = target?.title.trim().toLowerCase()
  if (!targetTitle) return []
  const all = await db.pages.toArray()
  return all
    .filter((p) => p.id !== pageId && linkedTitles(p).has(targetTitle))
    .sort((a, b) => a.title.localeCompare(b.title))
}
