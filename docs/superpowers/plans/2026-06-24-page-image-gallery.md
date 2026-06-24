# Per-Page Image Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a page hold multiple images in a thumbnail grid below its body, with captions, drag-to-reorder, a fullscreen lightbox, and "set as infobox portrait".

**Architecture:** Images live in their own Dexie table (`images`), keyed by `pageId`, stored as compressed JPEG data URLs (same as every other image in the app). `LorePage` is unchanged. A new `src/db/images.ts` module holds CRUD; two new components (`ImageGallery`, `Lightbox`) render in `PageRoute`'s main column. Backup/export/sanitize/change-tracking are extended to cover the new table.

**Tech Stack:** React 19 + TypeScript (strict), Dexie/IndexedDB, dexie-react-hooks (`useLiveQuery`), Vitest + happy-dom + fake-indexeddb, JSZip (HTML export).

## Global Constraints

- TypeScript is `strict`. Run `npm run lint && npm run build && npm run test:run` before claiming a task done (CI gate).
- The data layer lives under `src/db/` behind the barrel `src/db/index.ts` (`export *` per module). Always import data-layer API from `'../db'` / `'./db'`. Every new public runtime helper MUST be added to `src/db/barrel.test.ts`'s `EXPECTED_FUNCTIONS`.
- `CURRENT_SCHEMA_VERSION` in `src/db/backup.ts` **mirrors** the Dexie store version in `src/db/schema.ts` — bump them together.
- No literal `Date.now()` / `Math.random()` in React render (react-hooks/purity lint rule). Use `now()` from the db layer in the data layer; in components, derive timestamps only inside event handlers.
- Images are stored as **compressed JPEG data URLs** via `compressImage(file, maxDim)` from `src/imageUtils.ts`. Gallery uses `maxDim = 1600`.
- On import, only keep images whose `dataUrl` starts with `data:image/` (a data-URL whitelist; captions are plain text and React-escaped).
- DOMPurify-touching tests need jsdom (`// @vitest-environment jsdom`). The tests in this plan don't touch DOMPurify, so they stay on the default happy-dom.

---

## File Structure

- `src/db/types.ts` — add the `PageImage` interface.
- `src/db/schema.ts` — add `images` table field + Dexie **v8** store; bump nothing else.
- `src/db/backup.ts` — `CURRENT_SCHEMA_VERSION → 8`; add `images` to `BackupData`/`BackupCounts`/`exportAll`/`importAll`; `MIGRATIONS[7]`; data-URL import filter.
- `src/db/images.ts` — **new**: `addImage`, `updateImageCaption`, `deleteImage`, `reorderImages`, `setAsPortrait`.
- `src/db/pages.ts` — extend `deletePage` to cascade-delete a page's images.
- `src/db/index.ts` — barrel already does `export *`; **no change needed** (verified by `barrel.test.ts`).
- `src/db/barrel.test.ts` — list the new `images.ts` function names.
- `src/db/images.test.ts` — **new**: CRUD + cascade + `setAsPortrait` tests.
- `src/db/backup.test.ts` — images round-trip, v8 stamp, data-URL filter; update the two hardcoded version assertions.
- `src/components/Lightbox.tsx` — **new**: fullscreen viewer.
- `src/components/ImageGallery.tsx` — **new**: the Images section (grid + add + caption + reorder + portrait).
- `src/routes/PageRoute.tsx` — render `<ImageGallery>` after `<LoreEditor>`.
- `src/index.css` — gallery + lightbox styles.
- `src/htmlExport.ts` — render each page's gallery in the exported static site.
- `src/backup.ts` — include `images` in backup-overdue change tracking.

---

## Task 1: Data model, Dexie v8, schema-version bump

**Files:**
- Modify: `src/db/types.ts`
- Modify: `src/db/schema.ts:159-169` (after the v7 block)
- Modify: `src/db/backup.ts:26` (`CURRENT_SCHEMA_VERSION`)
- Modify: `src/db/backup.test.ts:197-205` (the `schema version` describe block)
- Test: `src/db/images.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PageImage` interface; `db.images` Dexie table (`Table<PageImage, string>`); `CURRENT_SCHEMA_VERSION === 8`; Dexie store version 8 with `images: 'id, pageId, order'`.

- [ ] **Step 1: Write the failing test**

Create `src/db/images.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/db/images.test.ts`
Expected: FAIL — `db.images` is undefined (table doesn't exist) / TS error that `images` is not a property of the db.

- [ ] **Step 3: Add the `PageImage` type**

In `src/db/types.ts`, after the `LorePage` interface (ends line 50), add:

```ts
/** One image in a page's gallery. Stored as a compressed JPEG data URL in its
 *  own table (not on LorePage) so editing page text never rewrites image bytes. */
export interface PageImage {
  id: string
  pageId: string // owner page
  dataUrl: string // compressed JPEG data URL (via compressImage)
  caption: string // optional; '' when none
  order: number // 0-based position in the grid
  createdAt: number
}
```

- [ ] **Step 4: Register the table on the Dexie class**

In `src/db/schema.ts`, add the import (extend the existing `import type` block at lines 3-13):

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
} from './types'
```

Add the table field to the `LoreDB` class (after `events!` on line 100):

```ts
  events!: Table<TimelineEvent, string>
  images!: Table<PageImage, string>
```

After the `this.version(7)` block (ends line 169), add:

```ts
    // v8 adds the per-page image gallery table; existing data is preserved
    // (a new table needs no data migration of the others).
    this.version(8).stores({
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
    })
```

- [ ] **Step 5: Bump the backup schema version to mirror Dexie**

In `src/db/backup.ts`, change line 26:

```ts
export const CURRENT_SCHEMA_VERSION = 8
```

- [ ] **Step 6: Update the hardcoded version assertions**

In `src/db/backup.test.ts`, the `schema version` describe block (lines 197-205) hardcodes the old version. Replace it with:

```ts
describe('schema version', () => {
  it('is at 8 for the image gallery', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(8)
  })

  it('stamps an older backup up to current with no data loss', () => {
    const out = migrateBackup({ schemaVersion: 6, pages: [], regions: [] })
    expect(out.schemaVersion).toBe(8)
    expect(out.regions).toEqual([])
  })
})
```

(`migrateBackup` and `CURRENT_SCHEMA_VERSION` are already imported in this file — confirm at lines 2-12; `migrateBackup` is in the import list. If `migrateBackup` is missing from the import, add it.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:run -- src/db/images.test.ts src/db/backup.test.ts`
Expected: PASS (the new images table test and all backup tests, including the updated version assertions).

- [ ] **Step 8: Build to confirm types**

Run: `npm run build`
Expected: PASS (tsc clean — `db.images` is typed, `PageImage` exported).

- [ ] **Step 9: Commit**

```bash
git add src/db/types.ts src/db/schema.ts src/db/backup.ts src/db/backup.test.ts src/db/images.test.ts
git commit -m "feat(gallery): PageImage model, Dexie v8 images table, schema bump (#19)"
```

---

## Task 2: images CRUD module + cascade delete + barrel

**Files:**
- Create: `src/db/images.ts`
- Modify: `src/db/pages.ts:33-38` (`deletePage`)
- Modify: `src/db/barrel.test.ts:24-26` (add new names)
- Test: `src/db/images.test.ts` (extend)

**Interfaces:**
- Consumes: `db`, `uid`, `now` from `./schema`; `defaultInfobox` from `./templates`; `LorePage`, `PageImage` from `./types`.
- Produces:
  - `addImage(pageId: string, dataUrl: string): Promise<string>`
  - `updateImageCaption(id: string, caption: string): Promise<void>`
  - `deleteImage(id: string): Promise<void>`
  - `reorderImages(pageId: string, orderedIds: string[]): Promise<void>`
  - `setAsPortrait(page: LorePage, dataUrl: string): Promise<void>`
  - `deletePage` additionally removes the page's images.

- [ ] **Step 1: Write the failing tests**

Append to `src/db/images.test.ts` (add the imports at the top — extend the existing import line to pull the helpers):

```ts
import { db, addImage, updateImageCaption, deleteImage, reorderImages, setAsPortrait, createPage, deletePage } from '../db'
```

Add these describe blocks at the end of the file:

```ts
describe('images CRUD', () => {
  beforeEach(async () => {
    await db.images.clear()
  })

  it('addImage appends at the next order, starting at 0', async () => {
    await addImage('p1', 'data:image/png;base64,A')
    await addImage('p1', 'data:image/png;base64,B')
    const rows = await db.images.where('pageId').equals('p1').sortBy('order')
    expect(rows.map((r) => r.order)).toEqual([0, 1])
    expect(rows.map((r) => r.caption)).toEqual(['', ''])
  })

  it('addImage uses max+1 so it never collides after a delete', async () => {
    const a = await addImage('p1', 'data:image/png;base64,A') // order 0
    const b = await addImage('p1', 'data:image/png;base64,B') // order 1
    await deleteImage(a)
    const c = await addImage('p1', 'data:image/png;base64,C') // must be order 2, not 1
    const orders = (await db.images.where('pageId').equals('p1').toArray())
      .sort((x, y) => x.order - y.order)
      .map((r) => `${r.id}:${r.order}`)
    expect(orders).toEqual([`${b}:1`, `${c}:2`])
  })

  it('updateImageCaption sets the caption', async () => {
    const id = await addImage('p1', 'data:image/png;base64,A')
    await updateImageCaption(id, 'a hero')
    expect((await db.images.get(id))?.caption).toBe('a hero')
  })

  it('reorderImages reassigns order to 0..n-1 in the given sequence', async () => {
    const a = await addImage('p1', 'data:image/png;base64,A')
    const b = await addImage('p1', 'data:image/png;base64,B')
    const c = await addImage('p1', 'data:image/png;base64,C')
    await reorderImages('p1', [c, a, b])
    const rows = await db.images.where('pageId').equals('p1').sortBy('order')
    expect(rows.map((r) => r.id)).toEqual([c, a, b])
    expect(rows.map((r) => r.order)).toEqual([0, 1, 2])
  })
})

describe('setAsPortrait', () => {
  beforeEach(async () => {
    await db.images.clear()
    await db.pages.clear()
  })

  it('writes the data URL into an existing infobox image', async () => {
    const pageId = await createPage({ title: 'Hero', category: 'Character' })
    const page = (await db.pages.get(pageId))!
    expect(page.infobox).toBeDefined() // createPage seeds a default infobox
    await setAsPortrait(page, 'data:image/png;base64,PORTRAIT')
    expect((await db.pages.get(pageId))?.infobox?.image).toBe('data:image/png;base64,PORTRAIT')
  })

  it('creates a default infobox first when the page has none', async () => {
    const pageId = await createPage({ title: 'Bare', category: 'Character' })
    await db.pages.update(pageId, { infobox: undefined })
    const page = (await db.pages.get(pageId))!
    expect(page.infobox).toBeUndefined()
    await setAsPortrait(page, 'data:image/png;base64,NEW')
    const after = await db.pages.get(pageId)
    expect(after?.infobox).toBeDefined()
    expect(after?.infobox?.image).toBe('data:image/png;base64,NEW')
  })
})

describe('deletePage cascade', () => {
  beforeEach(async () => {
    await db.images.clear()
    await db.pages.clear()
  })

  it('removes a page\'s gallery images when the page is deleted', async () => {
    const pageId = await createPage({ title: 'Doomed' })
    await addImage(pageId, 'data:image/png;base64,A')
    await addImage(pageId, 'data:image/png;base64,B')
    expect(await db.images.where('pageId').equals(pageId).count()).toBe(2)
    await deletePage(pageId)
    expect(await db.images.where('pageId').equals(pageId).count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/db/images.test.ts`
Expected: FAIL — `addImage` / `setAsPortrait` / etc. are not exported; cascade test still finds 2 images.

- [ ] **Step 3: Create the images CRUD module**

Create `src/db/images.ts`:

```ts
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
 *  count) so an add after a delete never collides with an existing order. */
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

/** Reassign order to 0..n-1 following the given id sequence, in one transaction. */
export async function reorderImages(pageId: string, orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.images, async () => {
    await Promise.all(orderedIds.map((imageId, index) => db.images.update(imageId, { order: index })))
  })
}

/** Promote a gallery image to the page's infobox portrait. Creates a default
 *  infobox first when the page has none (mirrors PageRoute's "Add infobox"). */
export async function setAsPortrait(page: LorePage, dataUrl: string): Promise<void> {
  const infobox = page.infobox ?? (await defaultInfobox(page.category))
  await db.pages.update(page.id, { infobox: { ...infobox, image: dataUrl }, updatedAt: now() })
}
```

- [ ] **Step 4: Add the cascade delete to `deletePage`**

In `src/db/pages.ts`, replace `deletePage` (lines 33-38) with:

```ts
export async function deletePage(id: string): Promise<void> {
  await db.pages.delete(id)
  // Remove this page's gallery images so no orphans are left behind.
  await db.images.where('pageId').equals(id).delete()
  // Unlink any pins that pointed at this page.
  const linked = await db.pins.where('pageId').equals(id).toArray()
  await Promise.all(linked.map((p) => db.pins.update(p.id, { pageId: null })))
}
```

- [ ] **Step 5: Register the new helpers in the barrel test**

In `src/db/barrel.test.ts`, after the `// maps.ts` group (line 24-26), add a new group:

```ts
  // images.ts
  'addImage', 'updateImageCaption', 'deleteImage', 'reorderImages', 'setAsPortrait',
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:run -- src/db/images.test.ts src/db/barrel.test.ts`
Expected: PASS.

- [ ] **Step 7: Build + lint**

Run: `npm run build && npm run lint`
Expected: PASS. (`images.ts` is picked up by the barrel's `export *`; no `index.ts` edit needed.)

- [ ] **Step 8: Commit**

```bash
git add src/db/images.ts src/db/pages.ts src/db/barrel.test.ts src/db/images.test.ts
git commit -m "feat(gallery): images CRUD, deletePage cascade, setAsPortrait (#19)"
```

---

## Task 3: Backup wiring — export, import, migration, sanitization

**Files:**
- Modify: `src/db/backup.ts` (multiple sites — see steps)
- Test: `src/db/backup.test.ts` (extend)

**Interfaces:**
- Consumes: `PageImage` from `./types`; `db.images` (Task 1); `CURRENT_SCHEMA_VERSION === 8` (Task 1).
- Produces: `BackupData.images?: PageImage[]`; `BackupCounts.images: number`; `exportAll()`/`importAll()` cover images; `MIGRATIONS[7]`; an import-time `data:image/` whitelist.

- [ ] **Step 1: Write the failing tests**

In `src/db/backup.test.ts`, inside the existing `describe('importAll — round-trips', …)` block (after the last round-trip test, before the block's closing brace near line 195), add:

```ts
  it('round-trips gallery images', async () => {
    await db.images.add({ id: 'img1', pageId: 'p1', dataUrl: 'data:image/png;base64,AAA', caption: 'cape', order: 0, createdAt: 1 })

    const json = await exportAll()
    await db.images.clear()
    await importAll(json)

    expect(await db.images.get('img1')).toMatchObject({ id: 'img1', pageId: 'p1', caption: 'cape', order: 0 })
  })

  it('drops imported images whose dataUrl is not a data:image URL', async () => {
    const json = JSON.stringify({
      schemaVersion: 8,
      pages: [],
      images: [
        { id: 'ok', pageId: 'p1', dataUrl: 'data:image/jpeg;base64,GOOD', caption: '', order: 0, createdAt: 1 },
        { id: 'evil', pageId: 'p1', dataUrl: 'javascript:alert(1)', caption: '', order: 1, createdAt: 2 },
      ],
    })
    await importAll(json)
    expect(await db.images.get('ok')).toBeDefined()
    expect(await db.images.get('evil')).toBeUndefined()
  })
```

Add a new top-level describe block at the end of the file:

```ts
describe('images migration', () => {
  it('MIGRATIONS step normalizes a missing images table to an empty array', () => {
    const out = migrateBackup({ schemaVersion: 7, pages: [] })
    expect(out.images).toEqual([])
  })
})
```

Also extend the counts test: find the test that asserts `counts` from `parseBackup` (in `describe('parseBackup — version reporting'…)` or the counts assertions) and confirm it tolerates the new `images` count. If a test does a strict `toEqual` on the whole counts object, add `images: 0` to its expected object. (Search the file for `counts:` / `pages: 1` to locate it; most assertions read individual fields and need no change.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/db/backup.test.ts`
Expected: FAIL — round-trip finds no `img1` (export omits images), the filter test keeps `evil`, and `migrateBackup` returns no `images` field.

- [ ] **Step 3: Add `images` to the type imports and BackupData/BackupCounts**

In `src/db/backup.ts`, extend the type import (lines 6-14) to add `PageImage`:

```ts
import type {
  Calendar,
  InfoboxTemplate,
  LorePage,
  MapPin,
  MapRegion,
  PageImage,
  TimelineEvent,
  WorldMap,
} from './types'
```

In `BackupData` (after `events?: TimelineEvent[]`, line 41):

```ts
  events?: TimelineEvent[]
  images?: PageImage[]
```

In `BackupCounts` (after `events: number`, line 52):

```ts
  events: number
  images: number
```

- [ ] **Step 4: Add the migration step**

In `src/db/backup.ts`, inside the `MIGRATIONS` object, after the v7 comment block (line 79) and before the closing `}`:

```ts
  // v8 added the per-page image gallery table; fill it in for older backups.
  7: (d) => ({ ...d, images: asArray(d.images) }),
```

- [ ] **Step 5: Count images in `parseBackup`**

In `parseBackup`'s returned `counts` object (lines 122-130), add:

```ts
      events: asArray(data.events).length,
      images: asArray(data.images).length,
```

- [ ] **Step 6: Export and import images**

In `exportAll()` (lines 134-156), add `db.images.toArray()` to the `Promise.all` and the result:

```ts
  const [pages, maps, pins, regions, templates, calendars, events, images] = await Promise.all([
    db.pages.toArray(),
    db.maps.toArray(),
    db.pins.toArray(),
    db.regions.toArray(),
    db.templates.toArray(),
    db.calendars.toArray(),
    db.events.toArray(),
    db.images.toArray(),
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
  })
```

In `sanitizeBackup` (lines 168-174), add the data-URL whitelist for images:

```ts
function sanitizeBackup(data: BackupData): BackupData {
  return {
    ...data,
    pages: asArray(data.pages).map((p) => ({ ...p, content: sanitizeHtml(p.content) })),
    events: asArray(data.events).map((e) => ({ ...e, description: sanitizeHtml(e.description) })),
    // Images carry no HTML; defend against a non-image payload smuggled into dataUrl.
    images: asArray(data.images).filter((img) => typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:image/')),
  }
}
```

In `importAll()` (lines 176-191), add `db.images` to the transaction table list, the clear, and the bulkAdd:

```ts
  await db.transaction('rw', [db.pages, db.maps, db.pins, db.regions, db.templates, db.calendars, db.events, db.images], async () => {
    await Promise.all([
      db.pages.clear(), db.maps.clear(), db.pins.clear(), db.regions.clear(),
      db.templates.clear(), db.calendars.clear(), db.events.clear(), db.images.clear(),
    ])
    await db.pages.bulkAdd(asArray(data.pages))
    await db.maps.bulkAdd(asArray(data.maps))
    await db.pins.bulkAdd(asArray(data.pins))
    await db.regions.bulkAdd(asArray(data.regions))
    await db.templates.bulkAdd(asArray(data.templates))
    await db.calendars.bulkAdd(asArray(data.calendars))
    await db.events.bulkAdd(asArray(data.events))
    await db.images.bulkAdd(asArray(data.images))
  })
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:run -- src/db/backup.test.ts`
Expected: PASS (round-trip, filter, migration, and existing tests).

- [ ] **Step 8: Build + full test run**

Run: `npm run build && npm run test:run`
Expected: PASS (whole suite).

- [ ] **Step 9: Commit**

```bash
git add src/db/backup.ts src/db/backup.test.ts
git commit -m "feat(gallery): backup export/import + data-URL sanitize for images (#19)"
```

---

## Task 4: Lightbox + ImageGallery components

**Files:**
- Create: `src/components/Lightbox.tsx`
- Create: `src/components/ImageGallery.tsx`
- Modify: `src/index.css` (append gallery + lightbox styles)

**Interfaces:**
- Consumes: `PageImage`, `LorePage` from `../db`; `addImage`/`updateImageCaption`/`deleteImage`/`reorderImages`/`setAsPortrait`/`db` from `../db` (Task 2); `compressImage` from `../imageUtils`.
- Produces (for Task 5): default-exported `ImageGallery` with props `{ page: LorePage; editable: boolean }`.

No unit test — pure-visual React is verified via build + manual smoke, consistent with the codebase (e.g. `MapView` has no test). Logic-bearing helpers were unit-tested in Tasks 2-3.

- [ ] **Step 1: Create the Lightbox component**

Create `src/components/Lightbox.tsx`:

```tsx
import { useEffect } from 'react'
import type { PageImage } from '../db'

interface Props {
  images: PageImage[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
}

/** Fullscreen image viewer with prev/next (arrows + ←/→ keys) and Esc-to-close.
 *  Self-contained: it takes the list + active index + callbacks, so it knows
 *  nothing about Dexie and works in both view and edit mode. Navigation clamps
 *  at the ends (no wrap). */
export default function Lightbox({ images, index, onClose, onNavigate }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onNavigate(Math.max(0, index - 1))
      else if (e.key === 'ArrowRight') onNavigate(Math.min(images.length - 1, index + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onClose, onNavigate])

  const image = images[index]
  if (!image) return null
  const atStart = index === 0
  const atEnd = index === images.length - 1

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose} aria-label="Close">×</button>
        {!atStart && (
          <button className="lightbox-nav lightbox-prev" onClick={() => onNavigate(index - 1)} aria-label="Previous">‹</button>
        )}
        <figure className="lightbox-figure">
          <img src={image.dataUrl} alt={image.caption} />
          {image.caption && <figcaption>{image.caption}</figcaption>}
        </figure>
        {!atEnd && (
          <button className="lightbox-nav lightbox-next" onClick={() => onNavigate(index + 1)} aria-label="Next">›</button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the ImageGallery component**

Create `src/components/ImageGallery.tsx`:

```tsx
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, addImage, updateImageCaption, deleteImage, reorderImages, setAsPortrait,
  type LorePage,
} from '../db'
import { compressImage } from '../imageUtils'
import Lightbox from './Lightbox'

interface Props {
  page: LorePage
  editable: boolean
}

/** The "Images" section below a page body: a thumbnail grid with a lightbox.
 *  In edit mode it adds file-picker / drag-drop upload, per-image caption,
 *  delete, "set as portrait", and native drag-to-reorder. Hidden entirely in
 *  view mode when the page has no images. */
export default function ImageGallery({ page, editable }: Props) {
  const images = useLiveQuery(
    () => db.images.where('pageId').equals(page.id).sortBy('order'),
    [page.id],
  ) ?? []

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const dataUrl = await compressImage(file, 1600)
      await addImage(page.id, dataUrl)
    }
  }

  function onDropFiles(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }

  async function onDropThumb(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      return
    }
    const ids = images.map((img) => img.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setDragId(null)
    await reorderImages(page.id, ids)
  }

  // Nothing to show and nothing to add — keep view mode clean.
  if (!editable && images.length === 0) return null

  return (
    <section className="image-gallery">
      <h2 className="gallery-heading">Images</h2>

      {editable && (
        <div
          className="gallery-dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropFiles}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          Drop images here, or click to choose files
        </div>
      )}

      <div className="gallery-grid">
        {images.map((img, i) => (
          <figure
            key={img.id}
            className="gallery-item"
            draggable={editable}
            onDragStart={() => editable && setDragId(img.id)}
            onDragOver={(e) => { if (editable) e.preventDefault() }}
            onDrop={() => { if (editable) onDropThumb(img.id) }}
          >
            <button className="gallery-thumb" onClick={() => setLightboxIndex(i)}>
              <img src={img.dataUrl} alt={img.caption} />
            </button>
            {editable ? (
              <>
                <input
                  className="gallery-caption-input"
                  placeholder="caption…"
                  value={img.caption}
                  onChange={(e) => updateImageCaption(img.id, e.target.value)}
                />
                <div className="gallery-item-actions">
                  <button className="ghost-btn" onClick={() => setAsPortrait(page, img.dataUrl)} title="Use as infobox portrait">★ Portrait</button>
                  <button className="ghost-btn danger" onClick={() => deleteImage(img.id)} title="Delete image">🗑</button>
                </div>
              </>
            ) : (
              img.caption && <figcaption className="gallery-caption">{img.caption}</figcaption>
            )}
          </figure>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </section>
  )
}
```

- [ ] **Step 3: Add the styles**

In `src/index.css`, append:

```css
/* Per-page image gallery (#19) */
.image-gallery { margin-top: 28px; }
.gallery-heading { font-size: 18px; margin: 0 0 12px; }
.gallery-dropzone {
  border: 1px dashed var(--border); border-radius: var(--radius); padding: 18px;
  text-align: center; color: var(--ink-faint); cursor: pointer; margin-bottom: 14px;
  font-size: 13px;
}
.gallery-dropzone:hover { background: var(--bg-2); color: var(--ink); }
.gallery-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;
}
.gallery-item { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.gallery-thumb {
  padding: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  background: var(--bg-2); cursor: zoom-in; aspect-ratio: 1; display: block;
}
.gallery-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gallery-caption { font-size: 12px; color: var(--ink-dim); text-align: center; }
.gallery-caption-input {
  width: 100%; background: var(--bg-2); border: 1px solid var(--border); color: var(--ink);
  border-radius: 6px; padding: 4px 6px; font-size: 12px;
}
.gallery-item-actions { display: flex; gap: 4px; justify-content: center; }
.gallery-item-actions .ghost-btn { font-size: 11px; padding: 3px 6px; }

.lightbox-backdrop {
  position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,.85);
  display: flex; align-items: center; justify-content: center; padding: 32px;
}
.lightbox-content { position: relative; max-width: 90vw; max-height: 90vh; display: flex; align-items: center; }
.lightbox-figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.lightbox-figure img { max-width: 86vw; max-height: 82vh; object-fit: contain; border-radius: 6px; }
.lightbox-figure figcaption { color: #e0e0e0; font-size: 14px; text-align: center; }
.lightbox-close {
  position: absolute; top: -28px; right: 0; background: none; border: none; color: #fff;
  font-size: 28px; line-height: 1; cursor: pointer;
}
.lightbox-nav {
  background: rgba(0,0,0,.4); border: none; color: #fff; font-size: 40px; line-height: 1;
  cursor: pointer; padding: 8px 14px; border-radius: 8px; position: absolute; top: 50%;
  transform: translateY(-50%);
}
.lightbox-prev { left: -56px; }
.lightbox-next { right: -56px; }
.lightbox-nav:hover { background: rgba(0,0,0,.7); }
```

(If a referenced CSS variable doesn't exist, grep `src/index.css` for the nearest equivalent — `--ink-faint`/`--ink-dim`/`--bg-2`/`--radius`/`--border` are used elsewhere in this file; reuse whatever the file already defines.)

- [ ] **Step 4: Build + lint**

Run: `npm run build && npm run lint`
Expected: PASS. The two components compile; they're not yet imported anywhere (Task 5 wires them) — an unused *file* is fine, ESLint flags unused *locals*, not unused modules.

- [ ] **Step 5: Commit**

```bash
git add src/components/Lightbox.tsx src/components/ImageGallery.tsx src/index.css
git commit -m "feat(gallery): ImageGallery grid + Lightbox components (#19)"
```

---

## Task 5: Wire the gallery into PageRoute

**Files:**
- Modify: `src/routes/PageRoute.tsx:5-8` (import), `:222-231` (render after editor)

**Interfaces:**
- Consumes: `ImageGallery` (Task 4); the page object already loaded in `PageRoute` and the `editing` flag.
- Produces: nothing downstream.

No unit test (route wiring verified via build + manual smoke, consistent with the codebase).

- [ ] **Step 1: Import the component**

In `src/routes/PageRoute.tsx`, after the `Backlinks` import (line 7), add:

```ts
import ImageGallery from '../components/ImageGallery'
```

- [ ] **Step 2: Render the gallery after the editor**

In `src/routes/PageRoute.tsx`, in the `.page-main` div (lines 222-231), add `<ImageGallery>` right after `</LoreEditor>`'s closing:

```tsx
        <div className="page-main" ref={mainRef}>
          <LoreEditor
            key={id}
            content={page.content}
            editable={editing}
            onChange={(html) => updatePage(id, { content: html })}
            onWikiClick={followWikiLink}
            knownTitles={knownTitles}
          />
          <ImageGallery page={page} editable={editing} />
        </div>
```

- [ ] **Step 3: Build + lint + full test run**

Run: `npm run lint && npm run build && npm run test:run`
Expected: PASS (lint clean — `ImageGallery` is now used; build clean; all tests green).

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`, open `http://localhost:5174/#/page/<some-id>` (create a page if needed). Verify:
- Click **✎ Edit**: an "Images" section with a dropzone appears below the body.
- Add 3 images via the file picker and via drag-drop onto the dropzone — thumbnails appear; large images are downscaled (data URL via `compressImage`).
- Type a caption under one thumbnail; it persists after toggling edit off/on.
- Drag a thumbnail onto another to reorder; order persists after reload.
- Click **★ Portrait** on an image → it becomes the infobox image in the right sidebar (if the page had no infobox, one is created).
- Click **🗑** → the image is removed.
- Click **✓ Done** (view mode): the grid shows captions; the dropzone/edit controls are gone. A page with no images shows no Images section.
- Click a thumbnail → lightbox opens; ‹ › and ←/→ navigate (clamped at ends); Esc / backdrop / × close.

- [ ] **Step 5: Commit**

```bash
git add src/routes/PageRoute.tsx
git commit -m "feat(gallery): render ImageGallery on the page (#19)"
```

---

## Task 6: HTML export + backup-overdue change tracking

**Files:**
- Modify: `src/htmlExport.ts` (gallery render + per-page image fetch + CSS)
- Modify: `src/backup.ts:69-103` (`latestChangeTime`, `unbackedChangeCount`)

**Interfaces:**
- Consumes: `db.images` (Task 1); `PageImage` from `./db`.
- Produces: exported static pages include a gallery; the backup-overdue nudge counts image additions.

No unit test (`src/htmlExport.ts` and `src/backup.ts` storage helpers have no existing test files; verified via build + manual smoke, consistent with the codebase).

- [ ] **Step 1: Render galleries in the HTML export**

In `src/htmlExport.ts`, extend the type import (line 3):

```ts
import type { LorePage, PageImage } from './db'
```

Add a gallery renderer after `renderInfobox` (after line 33):

```ts
function renderGallery(images: PageImage[]): string {
  if (images.length === 0) return ''
  const items = images
    .map((img) => {
      const cap = img.caption ? `<figcaption>${img.caption}</figcaption>` : ''
      return `<figure class="gallery-item"><img src="${img.dataUrl}" alt="">${cap}</figure>`
    })
    .join('\n')
  return `<section class="gallery"><h2>Images</h2><div class="gallery-grid">${items}</div></section>`
}
```

Change `pageHtml`'s signature and body to accept + render images. Replace lines 35-59:

```ts
function pageHtml(page: LorePage, body: string, backlinks: LorePage[], images: PageImage[]): string {
  const bl = backlinks.length
    ? `<section class="backlinks"><h2>What links here</h2><ul>${backlinks.map(b => `<li><a href="./${b.id}.html">${b.title}</a></li>`).join('')}</ul></section>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${page.title}</title>
<link rel="stylesheet" href="../style.css">
</head>
<body>
<article class="page">
  <header class="page-header">
    <h1>${page.title}</h1>
    <span class="category-chip">${page.category}</span>
  </header>
  ${renderInfobox(page)}
  <div class="page-body">${body}</div>
  ${renderGallery(images)}
  ${bl}
</article>
</body>
</html>`
}
```

Add gallery CSS to the `CSS` template literal (after the `.page-body img` rule, line 102):

```css
.gallery { clear: both; margin-top: 32px; }
.gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.gallery-item { margin: 0; }
.gallery-item img { width: 100%; border-radius: 6px; display: block; }
.gallery-item figcaption { font-size: 0.8rem; color: var(--ink-dim); text-align: center; margin-top: 4px; }
```

In `exportAsHtml()`, build a per-page image index before the page loop (after line 123, before `const zip = new JSZip()`):

```ts
  // Group gallery images by page, sorted by their grid order.
  const imagesByPage = new Map<string, PageImage[]>()
  for (const img of await db.images.toArray()) {
    const list = imagesByPage.get(img.pageId) ?? []
    list.push(img)
    imagesByPage.set(img.pageId, list)
  }
  for (const list of imagesByPage.values()) list.sort((a, b) => a.order - b.order)
```

Pass them into `pageHtml` in the loop (replace line 133):

```ts
    pagesFolder.file(`${page.id}.html`, pageHtml(page, body, backlinks, imagesByPage.get(page.id) ?? []))
```

- [ ] **Step 2: Count image changes toward the backup nudge**

In `src/backup.ts`, update `latestChangeTime` (lines 69-79) to include images (images have only `createdAt`; scan in memory like events, since `createdAt` isn't indexed):

```ts
export async function latestChangeTime(): Promise<number> {
  const [newestPage, newestMap, events, calendars, images] = await Promise.all([
    db.pages.orderBy('updatedAt').last(),
    db.maps.orderBy('createdAt').last(),
    db.events.toArray(),
    db.calendars.toArray(),
    db.images.toArray(),
  ])
  const newestEvent = events.reduce((max, e) => Math.max(max, e.updatedAt), 0)
  const newestCalendar = calendars.reduce((max, c) => Math.max(max, c.createdAt), 0)
  const newestImage = images.reduce((max, i) => Math.max(max, i.createdAt), 0)
  return Math.max(newestPage?.updatedAt ?? 0, newestMap?.createdAt ?? 0, newestEvent, newestCalendar, newestImage)
}
```

Update `unbackedChangeCount` (lines 94-103) to include new images:

```ts
export async function unbackedChangeCount(lastBackup: number | null): Promise<number> {
  const since = lastBackup ?? 0
  const [pages, maps, events, images] = await Promise.all([
    db.pages.where('updatedAt').above(since).count(),
    db.maps.where('createdAt').above(since).count(),
    db.events.toArray(),
    db.images.toArray(),
  ])
  const eventChanges = events.filter((e) => e.updatedAt > since).length
  const imageChanges = images.filter((i) => i.createdAt > since).length
  return pages + maps + eventChanges + imageChanges
}
```

- [ ] **Step 3: Build + lint + full test run**

Run: `npm run lint && npm run build && npm run test:run`
Expected: PASS (whole suite — 151 prior tests + the new images/backup tests).

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`. Add images to a page (from Task 5). Then:
- Home → **Export as HTML site**: open the downloaded zip, open `pages/<id>.html` in a browser — the page shows an "Images" grid with captions; thumbnails render from the embedded data URLs.
- Add a new image and confirm the backup banner / Home "overdue" count reflects the change (it now counts image additions).

- [ ] **Step 5: Commit**

```bash
git add src/htmlExport.ts src/backup.ts
git commit -m "feat(gallery): include images in HTML export + backup nudge (#19)"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** Images table → Task 1; CRUD + cascade + setAsPortrait → Task 2; backup export/import/migrate/sanitize → Task 3; grid + add (picker & drag-drop) + caption + reorder + lightbox → Task 4; placement below body in `.page-main` → Task 5; HTML export + change-tracking → Task 6. The reinterpreted "store locally" criterion is satisfied by the IndexedDB `images` table (Task 1).
- **Type consistency:** `PageImage` fields (`id`/`pageId`/`dataUrl`/`caption`/`order`/`createdAt`) are identical across types.ts (Task 1), images.ts (Task 2), backup.ts (Task 3), the components (Task 4), and htmlExport (Task 6). `ImageGallery` props `{ page: LorePage; editable: boolean }` match between its definition (Task 4) and its use (Task 5). `Lightbox` props match between definition and use within Task 4. `setAsPortrait(page, dataUrl)` and `reorderImages(pageId, orderedIds)` signatures match between Task 2 and Task 4 call sites.
- **Schema-version invariant:** `CURRENT_SCHEMA_VERSION` (backup.ts) and the Dexie store version are both moved to 8 in Task 1, keeping the mirror invariant intact within a single task; the `MIGRATIONS[7]` step and image payload land in Task 3 (the export *shape* gains images there, but the version constant already reflects the DB schema).
- **Order integrity:** `addImage` uses max+1 (not count) so an add after a delete never collides — covered by a dedicated test in Task 2.
- **Lint coupling:** Task 4's components are unused until Task 5 wires them; ESLint flags unused *locals*, not unused *modules*, so Task 4 builds/lints clean on its own.
