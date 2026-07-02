# Linked Documents on Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated, drag-ordered "Documents" attachment list to pages — reciprocally surfaced on both the owning page and the attached document — backed by a new id-based join table.

**Architecture:** A new Dexie store `docLinks` holds one edge per (page, document) attachment, indexed on both `pageId` and `documentId` so each direction is a cheap lookup (mirrors the `pins`/`images` pattern). A CRUD module `src/db/docLinks.ts` owns attach/detach/reorder + the two directional getters. `deletePage` cascade-deletes edges on either endpoint. `exportAll`/`importAll` gain the table with a migration step and referential-integrity filtering. A new `DocumentLinks.tsx` component renders in `PageRoute`'s main column below `<References>`, reusing `RefField`'s picker markup and `ImageGallery`'s native drag-reorder idiom.

**Tech Stack:** TypeScript (strict), Dexie + dexie-react-hooks (`useLiveQuery`), React 18, React Router, Vitest + happy-dom + fake-indexeddb, @testing-library/react.

## Global Constraints

- TypeScript `strict` — no `any`, all code type-checks under `tsc -b`.
- Every new public data-layer function MUST be re-exported from `src/db/index.ts` or `barrel.test.ts` fails.
- Import data-layer API from `'../db'` (the barrel), never from individual `src/db/*` modules, in components.
- Use `uid()` and `now()` from `src/db/schema.ts` for ids/timestamps — never literal `crypto.randomUUID()` / `Date.now()` in render code (react-hooks/purity lint rule).
- `CURRENT_SCHEMA_VERSION` in `src/db/backup.ts` MUST mirror the Dexie store version in `src/db/schema.ts`.
- Verification gate before "done": `npm run lint` && `npm run build` && `npm run test:run` all pass (CI runs all three).
- Attach scope: only pages with `category === 'Document'` are offered as documents.
- PR label: `version:minor`. Reference issue #109.

---

### Task 1: `DocLink` type + Dexie v10 store

**Files:**
- Modify: `src/db/types.ts` (append interface)
- Modify: `src/db/schema.ts:3-14` (type import), `:97-107` (table field), `:191-201` (add version 10)
- Test: `src/db/docLinks.test.ts` (create)

**Interfaces:**
- Consumes: `uid`, `now`, `db` from `src/db/schema.ts`.
- Produces: `DocLink` interface; `db.docLinks: Table<DocLink, string>` indexed on `pageId` and `documentId`.

- [ ] **Step 1: Write the failing test**

Create `src/db/docLinks.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/db/docLinks.test.ts`
Expected: FAIL — `db.docLinks` is undefined / `DocLink` not exported.

- [ ] **Step 3: Add the `DocLink` interface**

Append to `src/db/types.ts` (after the `PageImage` interface, near the top with the other page-related types):

```ts
/** A curated attachment linking a page to a Document-type page. Reciprocal:
 *  surfaced on both the owning page ("Documents") and the document
 *  ("Attached to"). The edge is id-based, so page renames never touch it. */
export interface DocLink {
  id: string
  pageId: string      // the page the document is attached to
  documentId: string  // the attached Document-type page
  order: number       // 0-based position in pageId's curated list
  createdAt: number
}
```

- [ ] **Step 4: Register the table on `LoreDB` and add schema v10**

In `src/db/schema.ts`, add `DocLink` to the type import (lines 3-14):

```ts
import type {
  LorePage,
  WorldMap,
  MapPin,
  MapRegion,
  MetaEntry,
  InfoboxTemplate,
  Snapshot,
  Calendar,
  TimelineEvent,
  PageImage,
  DocLink,
} from './types'
```

Add the table field to the `LoreDB` class (after `images!` on line 107):

```ts
  images!: Table<PageImage, string>
  docLinks!: Table<DocLink, string>
```

Add a new version block immediately after the `this.version(9)...` block (after line 200, before the closing `}` of the constructor):

```ts
    // v10 adds the curated document-attachment join table (#109); existing data
    // is preserved (a new table needs no data migration of the others).
    this.version(10).stores({
      pages: 'id, title, category, updatedAt',
      maps: 'id, name, createdAt',
      pins: 'id, mapId, pageId, childMapId',
      regions: 'id, mapId, pageId, childMapId',
      meta: '&key',
      templates: 'id, name',
      snapshots: '++id, timestamp',
      calendars: 'id, name, createdAt',
      events: 'id, calendarId, startAbsolute, pageId',
      images: 'id, pageId, order',
      docLinks: 'id, pageId, documentId',
    })
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:run -- src/db/docLinks.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/types.ts src/db/schema.ts src/db/docLinks.test.ts
git commit -m "feat: add DocLink type and docLinks table (schema v10) (#109)"
```

---

### Task 2: `docLinks` CRUD module

**Files:**
- Create: `src/db/docLinks.ts`
- Modify: `src/db/index.ts:26` (barrel re-export)
- Test: `src/db/docLinks.test.ts` (append CRUD describes)

**Interfaces:**
- Consumes: `db`, `uid`, `now` from `./schema`; `LorePage`, `DocLink` from `./types`.
- Produces:
  - `interface AttachedDoc { link: DocLink; page: LorePage }`
  - `attachDocument(pageId: string, documentId: string): Promise<void>`
  - `detachDocument(pageId: string, documentId: string): Promise<void>`
  - `getAttachedDocuments(pageId: string): Promise<AttachedDoc[]>`
  - `getDocumentAttachedTo(documentId: string): Promise<AttachedDoc[]>`
  - `reorderAttachedDocuments(pageId: string, orderedDocIds: string[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `src/db/docLinks.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/db/docLinks.test.ts`
Expected: FAIL — the CRUD functions are not exported.

- [ ] **Step 3: Create the CRUD module**

Create `src/db/docLinks.ts`:

```ts
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
```

- [ ] **Step 4: Re-export from the barrel**

In `src/db/index.ts`, add after line 26 (`export * from './images'`):

```ts
export * from './docLinks'
```

Also add a one-line entry to the module list comment (after the `images.ts` line) for consistency:

```
//   docLinks.ts   — curated document attachments (page ↔ document join)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:run -- src/db/docLinks.test.ts`
Expected: PASS (all describes).

- [ ] **Step 6: Commit**

```bash
git add src/db/docLinks.ts src/db/index.ts src/db/docLinks.test.ts
git commit -m "feat: docLinks CRUD (attach/detach/reorder + getters) (#109)"
```

---

### Task 3: Cascade delete on page removal

**Files:**
- Modify: `src/db/pages.ts:48-60` (`deletePage`)
- Test: `src/db/docLinks.test.ts` (append cascade describe)

**Interfaces:**
- Consumes: `deletePage` (existing), `attachDocument`, `db` from `../db`.
- Produces: no new API — `deletePage` now also deletes edges where `pageId === id` OR `documentId === id`.

- [ ] **Step 1: Write the failing tests**

Append to `src/db/docLinks.test.ts`:

```ts
import { deletePage } from '../db'

describe('docLinks cascade on deletePage', () => {
  beforeEach(async () => {
    await db.docLinks.clear()
    await db.pages.clear()
  })

  it('removes edges when the owning page is deleted', async () => {
    const s = await createPage({ title: 'Owner' })
    const d = await createPage({ title: 'Doc', category: 'Document' })
    await attachDocument(s, d)
    await deletePage(s)
    expect(await db.docLinks.count()).toBe(0)
  })

  it('removes edges when the attached document is deleted', async () => {
    const s = await createPage({ title: 'Owner' })
    const d = await createPage({ title: 'Doc', category: 'Document' })
    await attachDocument(s, d)
    await deletePage(d)
    expect(await db.docLinks.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/db/docLinks.test.ts`
Expected: FAIL — edges remain after delete (count is 1, not 0).

- [ ] **Step 3: Extend `deletePage`**

In `src/db/pages.ts`, replace the `deletePage` transaction (lines 52-59) so it includes `db.docLinks` and sweeps both endpoints:

```ts
  await db.transaction('rw', db.pages, db.images, db.pins, db.docLinks, async () => {
    await db.pages.delete(id)
    // Remove this page's gallery images so no orphans are left behind.
    await db.images.where('pageId').equals(id).delete()
    // Unlink any pins that pointed at this page.
    const linked = await db.pins.where('pageId').equals(id).toArray()
    await Promise.all(linked.map((p) => db.pins.update(p.id, { pageId: null })))
    // Drop document-attachment edges on either endpoint (owning page or document).
    await db.docLinks.where('pageId').equals(id).delete()
    await db.docLinks.where('documentId').equals(id).delete()
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/db/docLinks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/pages.ts src/db/docLinks.test.ts
git commit -m "feat: cascade-delete docLinks on page removal (#109)"
```

---

### Task 4: Backup / import integration

**Files:**
- Modify: `src/db/backup.ts` (BackupData, BackupCounts, MIGRATIONS, CURRENT_SCHEMA_VERSION, parseBackup counts, sanitizeBackup, exportAll, importAll)
- Test: `src/db/backup.test.ts` (append describe)

**Interfaces:**
- Consumes: `DocLink` from `./types`; existing `exportAll`, `importAll`, `parseBackup`.
- Produces: exports/imports now include a `docLinks` array; `CURRENT_SCHEMA_VERSION === 10`; import drops edges whose endpoints are absent from the page set.

- [ ] **Step 1: Write the failing tests**

Append to `src/db/backup.test.ts` (uses the existing imports there — `db`, `exportAll`, `importAll`, `parseBackup`, `createPage`; add `attachDocument` to the import list at the top of the file if not already present):

```ts
describe('docLinks in backups', () => {
  beforeEach(async () => {
    await db.pages.clear()
    await db.docLinks.clear()
  })

  it('round-trips docLinks through export → import', async () => {
    const s = await createPage({ title: 'Owner' })
    const d = await createPage({ title: 'Doc', category: 'Document' })
    await attachDocument(s, d)

    const json = await exportAll()
    await db.docLinks.clear()
    await importAll(json)

    const rows = await db.docLinks.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].pageId).toBe(s)
    expect(rows[0].documentId).toBe(d)
  })

  it('migrates a legacy backup (no docLinks) to an empty table', async () => {
    const legacy = JSON.stringify({ schemaVersion: 9, pages: [] })
    const { data } = parseBackup(legacy)
    expect(data.docLinks).toEqual([])
    await importAll(legacy)
    expect(await db.docLinks.count()).toBe(0)
  })

  it('drops edges referencing pages absent from the backup', async () => {
    const s = await createPage({ title: 'Owner' })
    const d = await createPage({ title: 'Doc', category: 'Document' })
    await attachDocument(s, d)
    const json = await exportAll()
    // Corrupt the backup: remove the document page but keep the edge.
    const obj = JSON.parse(json)
    obj.pages = obj.pages.filter((p: { id: string }) => p.id !== d)
    await importAll(JSON.stringify(obj))
    expect(await db.docLinks.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/db/backup.test.ts`
Expected: FAIL — `docLinks` is not exported/imported; `data.docLinks` is undefined.

- [ ] **Step 3: Wire `docLinks` through `backup.ts`**

In `src/db/backup.ts`:

Add `DocLink` to the `import type { ... } from './types'` block (lines 6-15).

Bump the version constant (line 27):

```ts
export const CURRENT_SCHEMA_VERSION = 10
```

Add `docLinks?: DocLink[]` to the `BackupData` interface (after `images?` on line 43):

```ts
  images?: PageImage[]
  docLinks?: DocLink[]
```

Add `docLinks: number` to `BackupCounts` (after `images` on line 55):

```ts
  images: number
  docLinks: number
```

Add a migration step to the `MIGRATIONS` map (after the `8:` entry, before the closing `}` on line 92):

```ts
  // v10 added the curated document-attachment join table; fill it in for older backups.
  9: (d) => ({ ...d, docLinks: asArray(d.docLinks) }),
```

Add the count in `parseBackup`'s `counts` object (after `images:` on line 149):

```ts
      images: asArray(data.images).length,
      docLinks: asArray(data.docLinks).length,
```

In `sanitizeBackup`, add referential-integrity filtering keyed off the page set (add before the closing `}` of the returned object, after the `images:` filter on lines 198-203):

```ts
    // Drop attachment edges whose endpoints aren't in this backup's page set —
    // an untrusted or hand-edited backup could carry dangling ids.
    docLinks: (() => {
      const pageIds = new Set(asArray(data.pages).map((p) => p.id))
      return asArray(data.docLinks).filter(
        (l) => pageIds.has(l.pageId) && pageIds.has(l.documentId),
      )
    })(),
```

In `exportAll`, add `db.docLinks.toArray()` to the `Promise.all` destructuring and include it in the JSON:

```ts
  const [pages, maps, pins, regions, templates, calendars, events, images, docLinks] = await Promise.all([
    db.pages.toArray(),
    db.maps.toArray(),
    db.pins.toArray(),
    db.regions.toArray(),
    db.templates.toArray(),
    db.calendars.toArray(),
    db.events.toArray(),
    db.images.toArray(),
    db.docLinks.toArray(),
  ])
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: pkg.version,
    exportedAt: now(),
    pages,
    maps,
    pins,
    regions,
    templates,
    calendars,
    events,
    images,
    docLinks,
  })
```

In `importAll`, add `db.docLinks` to the transaction store list, the `clear()` batch, and a `bulkAdd`:

```ts
  await db.transaction('rw', [db.pages, db.maps, db.pins, db.regions, db.templates, db.calendars, db.events, db.images, db.docLinks], async () => {
    await Promise.all([
      db.pages.clear(), db.maps.clear(), db.pins.clear(), db.regions.clear(),
      db.templates.clear(), db.calendars.clear(), db.events.clear(), db.images.clear(),
      db.docLinks.clear(),
    ])
    await db.pages.bulkAdd(asArray(data.pages))
    await db.maps.bulkAdd(asArray(data.maps))
    await db.pins.bulkAdd(asArray(data.pins))
    await db.regions.bulkAdd(asArray(data.regions))
    await db.templates.bulkAdd(asArray(data.templates))
    await db.calendars.bulkAdd(asArray(data.calendars))
    await db.events.bulkAdd(asArray(data.events))
    await db.images.bulkAdd(asArray(data.images))
    await db.docLinks.bulkAdd(asArray(data.docLinks))
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/db/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Check for other BackupCounts consumers**

Run: `grep -rn "counts\." src/routes/SettingsRoute.tsx` and confirm the import-confirmation UI compiles (it reads named count fields; adding one is additive). If SettingsRoute renders a fixed list of counts, optionally add a "documents linked" line mirroring the `images` line — otherwise leave it.

Run: `npm run build`
Expected: PASS (no type error from the new required `docLinks` field in `BackupCounts`).

- [ ] **Step 6: Commit**

```bash
git add src/db/backup.ts src/db/backup.test.ts src/routes/SettingsRoute.tsx
git commit -m "feat: include docLinks in backup/export with integrity filtering (#109)"
```

---

### Task 5: `DocumentLinks` component, styles, and `PageRoute` wiring

**Files:**
- Create: `src/components/DocumentLinks.tsx`
- Modify: `src/index.css` (append styles)
- Modify: `src/routes/PageRoute.tsx:7-11` (import), `:283-289` (render after `<References>`)
- Test: `src/components/DocumentLinks.test.tsx` (create)

**Interfaces:**
- Consumes: `getAttachedDocuments`, `getDocumentAttachedTo`, `attachDocument`, `detachDocument`, `reorderAttachedDocuments`, `categoryColor`, `db`, `type LorePage` from `../db`; `showPageHover`, `scheduleWikiHoverClose` from `../wikiLinkHover`.
- Produces: `export default function DocumentLinks({ page, editable }: { page: LorePage; editable: boolean })`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/DocumentLinks.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, createPage, attachDocument } from '../db'
import DocumentLinks from './DocumentLinks'

afterEach(cleanup)

async function getPage(id: string) {
  const p = await db.pages.get(id)
  if (!p) throw new Error('missing page')
  return p
}

function renderLinks(page: Parameters<typeof DocumentLinks>[0]['page'], editable = false) {
  return render(
    <MemoryRouter>
      <DocumentLinks page={page} editable={editable} />
    </MemoryRouter>,
  )
}

describe('DocumentLinks', () => {
  beforeEach(async () => {
    await db.pages.clear()
    await db.docLinks.clear()
  })

  it('renders nothing in view mode when there are no attachments', async () => {
    const s = await createPage({ title: 'Alice' })
    const { container } = renderLinks(await getPage(s), false)
    // Wait a tick for useLiveQuery, then assert empty.
    await new Promise((r) => setTimeout(r, 0))
    expect(container.textContent).toBe('')
  })

  it('lists attached documents in view mode', async () => {
    const s = await createPage({ title: 'Alice' })
    const d = await createPage({ title: 'The Letter', category: 'Document' })
    await attachDocument(s, d)
    renderLinks(await getPage(s), false)
    expect(await screen.findByText('The Letter')).toBeTruthy()
  })

  it('shows "Attached to" on a document that has inbound edges', async () => {
    const s = await createPage({ title: 'Alice' })
    const d = await createPage({ title: 'The Letter', category: 'Document' })
    await attachDocument(s, d)
    renderLinks(await getPage(d), false)
    expect(await screen.findByText(/attached to/i)).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
  })

  it('removes an attachment when the × button is clicked in edit mode', async () => {
    const s = await createPage({ title: 'Alice' })
    const d = await createPage({ title: 'The Letter', category: 'Document' })
    await attachDocument(s, d)
    renderLinks(await getPage(s), true)
    fireEvent.click(await screen.findByTitle('Remove attachment'))
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('The Letter')).toBeNull()
    expect(await db.docLinks.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/components/DocumentLinks.test.tsx`
Expected: FAIL — cannot find `./DocumentLinks`.

- [ ] **Step 3: Create the component**

Create `src/components/DocumentLinks.tsx`:

```tsx
import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, getAttachedDocuments, getDocumentAttachedTo,
  attachDocument, detachDocument, reorderAttachedDocuments,
  categoryColor, type LorePage,
} from '../db'
import { showPageHover, scheduleWikiHoverClose } from '../wikiLinkHover'

interface Props {
  page: LorePage
  editable: boolean
}

/** The "Documents" section below a page body: a curated, drag-ordered list of
 *  attached Document-type pages. On a document, a reciprocal "Attached to" list
 *  shows the pages it's attached to. Hidden entirely in view mode when there is
 *  nothing to show. */
export default function DocumentLinks({ page, editable }: Props) {
  const attached = useLiveQuery(() => getAttachedDocuments(page.id), [page.id]) ?? []
  const attachedTo = useLiveQuery(() => getDocumentAttachedTo(page.id), [page.id]) ?? []

  if (!editable && attached.length === 0 && attachedTo.length === 0) return null

  return (
    <section className="doc-links">
      {(editable || attached.length > 0) && (
        <DocumentsPanel page={page} attached={attached} editable={editable} />
      )}
      {attachedTo.length > 0 && (
        <AttachedToPanel page={page} attachedTo={attachedTo} editable={editable} />
      )}
    </section>
  )
}

/** A single row: type dot + title link with hover preview. */
function DocRow({ id, title, category }: { id: string; title: string; category: string }) {
  return (
    <Link
      to={`/page/${id}`}
      className="doc-link"
      onMouseEnter={(e) => showPageHover(id, title, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={scheduleWikiHoverClose}
    >
      <span className="dot" style={{ background: categoryColor(category) }} />
      {title}
    </Link>
  )
}

/** Owning side: documents attached to this page (drag-orderable in edit mode). */
function DocumentsPanel({
  page, attached, editable,
}: {
  page: LorePage
  attached: { link: { documentId: string }; page: LorePage }[]
  editable: boolean
}) {
  const [dragId, setDragId] = useState<string | null>(null)

  async function onDropRow(targetDocId: string) {
    if (!dragId || dragId === targetDocId) { setDragId(null); return }
    const ids = attached.map((a) => a.page.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetDocId)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setDragId(null)
    await reorderAttachedDocuments(page.id, ids)
  }

  return (
    <div className="doc-links-panel">
      <h2 className="doc-links-heading">Documents</h2>
      <ul className="doc-links-list">
        {attached.map((a) => (
          <li
            key={a.page.id}
            className="doc-links-row"
            draggable={editable}
            onDragStart={() => editable && setDragId(a.page.id)}
            onDragOver={(e) => { if (editable) e.preventDefault() }}
            onDrop={(e) => { e.preventDefault(); if (editable) onDropRow(a.page.id) }}
          >
            <DocRow id={a.page.id} title={a.page.title} category={a.page.category} />
            {editable && (
              <button
                className="tag-x"
                title="Remove attachment"
                onClick={() => detachDocument(page.id, a.page.id)}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <DocPicker
          category="Document"
          placeholder="Attach a document…"
          excludeIds={new Set([page.id, ...attached.map((a) => a.page.id)])}
          onPick={(docId) => attachDocument(page.id, docId)}
        />
      )}
      {!editable && attached.length === 0 && (
        <p className="doc-links-empty">No documents attached yet.</p>
      )}
    </div>
  )
}

/** Reciprocal side: the pages this document is attached to. Attach this document
 *  to any-type target pages from here. Ordered by title, no drag-reorder. */
function AttachedToPanel({
  page, attachedTo, editable,
}: {
  page: LorePage
  attachedTo: { page: LorePage }[]
  editable: boolean
}) {
  return (
    <div className="doc-links-panel">
      <h2 className="doc-links-heading">Attached to</h2>
      <ul className="doc-links-list">
        {attachedTo.map((a) => (
          <li key={a.page.id} className="doc-links-row">
            <DocRow id={a.page.id} title={a.page.title} category={a.page.category} />
            {editable && (
              <button
                className="tag-x"
                title="Remove attachment"
                onClick={() => detachDocument(a.page.id, page.id)}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <DocPicker
          placeholder="Attach this document to a page…"
          excludeIds={new Set([page.id, ...attachedTo.map((a) => a.page.id)])}
          onPick={(targetPageId) => attachDocument(targetPageId, page.id)}
        />
      )}
    </div>
  )
}

/** A search box offering pages (optionally of one category), excluding a set of
 *  ids, that calls onPick with the chosen page id. Reuses RefField's markup. */
function DocPicker({
  category, placeholder, excludeIds, onPick,
}: {
  category?: string
  placeholder: string
  excludeIds: Set<string>
  onPick: (pageId: string) => void
}) {
  const [query, setQuery] = useState('')
  const candidates = useLiveQuery(
    () => (category ? db.pages.where('category').equals(category).toArray() : db.pages.toArray()),
    [category],
  ) ?? []

  const q = query.trim().toLowerCase()
  const matches = q
    ? candidates
        .filter((p) => !excludeIds.has(p.id) && p.title.toLowerCase().includes(q))
        .slice(0, 8)
    : []

  return (
    <div className="ref-search doc-picker">
      <input
        className="infobox-value-input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {q && matches.length > 0 && (
        <div className="ref-results">
          {matches.map((p) => (
            <button
              key={p.id}
              className="ref-result"
              onClick={() => { onPick(p.id); setQuery('') }}
            >
              <span className="dot" style={{ background: categoryColor(p.category) } as CSSProperties} />
              {p.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add styles**

Append to `src/index.css`:

```css
/* Linked documents (#109) — curated attachment list below a page body. */
.doc-links {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.doc-links-heading {
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}
.doc-links-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.doc-links-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.doc-links-row[draggable='true'] {
  cursor: grab;
}
.doc-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: inherit;
}
.doc-link:hover {
  text-decoration: underline;
}
.doc-links-empty {
  color: var(--muted, #888);
  font-size: 0.9rem;
  margin: 0;
}
.doc-picker {
  margin-top: 0.5rem;
  max-width: 22rem;
}
```

(If `.dot`, `.ref-search`, `.ref-results`, `.ref-result`, `.tag-x`, and `--muted` are already defined in `src/index.css`, reuse them as-is — the rules above only add the `.doc-links*` wrapper classes.)

- [ ] **Step 5: Wire into `PageRoute`**

In `src/routes/PageRoute.tsx`, add the import near the other component imports (after line 11, `import TableOfContents ...`):

```tsx
import DocumentLinks from '../components/DocumentLinks'
```

Render it in the main column right after `<References>` (after line 288, inside `<div className="page-main">`):

```tsx
          <References
            content={page.content}
            knownTitles={knownTitles}
            onWikiClick={followWikiLink}
            onBackref={scrollToMarker}
          />
          <DocumentLinks page={page} editable={editing} />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:run -- src/components/DocumentLinks.test.tsx`
Expected: PASS.

- [ ] **Step 7: Full verification gate + manual smoke**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all PASS.

Then `npm run dev` and verify by hand at http://localhost:5174:
1. Open a Character page → Edit → a "Documents" section appears below the body with an "Attach a document…" box.
2. Type a Document page's title → pick it → it appears in the list; the box only offers `Document`-type pages.
3. Attach a second document, drag one row above the other → order persists after reload.
4. Click × on a row → it's removed.
5. Open the attached Document page → an "Attached to" section lists the Character; in Edit mode you can attach this document to another page from there, and remove.
6. In view mode with nothing attached, neither section renders.
7. Delete a page that had attachments → no console errors, edges gone (re-open the other endpoint; its list no longer shows the deleted page).

- [ ] **Step 8: Commit**

```bash
git add src/components/DocumentLinks.tsx src/components/DocumentLinks.test.tsx src/index.css src/routes/PageRoute.tsx
git commit -m "feat: DocumentLinks section on pages with reciprocal Attached-to (#109)"
```

---

## Self-Review

**1. Spec coverage:**
- Data model `DocLink` → Task 1. ✅
- Dexie v10 store → Task 1. ✅
- CRUD (`attachDocument`/`detachDocument`/`getAttachedDocuments`/`getDocumentAttachedTo`/`reorderAttachedDocuments`) + barrel → Task 2. ✅
- Cascade delete on either endpoint → Task 3. ✅
- Backup/import + `CURRENT_SCHEMA_VERSION` bump + MIGRATIONS + integrity filter + snapshots (ride-along, no code) → Task 4. ✅
- UI: "Documents" section (view/edit, picker filtered to Document, drag-reorder, remove) + reciprocal "Attached to" (any-type picker, title-ordered) + placement after `<References>` + hidden-when-empty → Task 5. ✅
- Testing across CRUD, cascade, backup, and component → Tasks 1-5. ✅
- Out-of-scope items (no notes, no graph edges, no new page type) → honored (nothing added for them). ✅

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases"/"similar to Task N" — every code step shows complete code. ✅

**3. Type consistency:** `DocLink` fields (`id/pageId/documentId/order/createdAt`) consistent across schema, CRUD, backup, tests. `AttachedDoc { link, page }` consistent between `docLinks.ts` and component prop shapes. Function names identical across producer/consumer blocks. `category === 'Document'` used consistently. `CURRENT_SCHEMA_VERSION = 10` matches Dexie `version(10)`. ✅

## Notes for the implementer

- **Task 4, Step 5:** `BackupCounts` gains a required field. If any consumer builds a `BackupCounts` literal by hand (grep for `BackupCounts`), it must add `docLinks`. `parseBackup` (the main producer) is handled in Step 3.
- **`useLiveQuery` component tests** need `afterEach(cleanup)` (already in the test file) to avoid a "window is not defined" teardown error — this is why the component test imports and calls it.
- Run each task's test file in isolation first (`npm run test:run -- <file>`), then the full suite at the end.
