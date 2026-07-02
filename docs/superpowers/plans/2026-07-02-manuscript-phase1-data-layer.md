# Manuscript Authoring — Phase 1: Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the persistent data layer for the manuscript authoring feature — the Book/Chapter/Scene/Plotline/Beat tables, their CRUD, word-count computation, and integration into backup/import and snapshots — with no UI yet.

**Architecture:** Five new per-lore Dexie tables in a new `src/db/manuscript.ts` module, added at Dexie schema **v11** (v10 already holds `docLinks`). Types live in `src/db/types.ts`; the public API is re-exported from the `src/db/index.ts` barrel. Backup and snapshots are extended to cover the new tables. Follows the exact patterns of the existing `docLinks.ts`, `schema.ts`, and `backup.ts`.

**Tech Stack:** TypeScript (strict), Dexie 4, Vitest + fake-indexeddb + happy-dom.

**Spec:** `docs/superpowers/specs/2026-07-02-manuscript-authoring-design.md`

## Global Constraints

- TypeScript `strict` — no `any`, no non-null assertions on possibly-undefined values.
- All new public API MUST be re-exported from `src/db/index.ts` or `barrel.test.ts` fails.
- Dexie store version and `CURRENT_SCHEMA_VERSION` (in `backup.ts`) bump together; every store-version bump that changes the exported shape needs a `MIGRATIONS` step.
- Import is the untrusted-data boundary: HTML fields are sanitized via `sanitizeHtml()`; plain-text fields are left for React to escape.
- Ids via `uid()`, timestamps via `now()` (both from `./schema`) — never literal `crypto.randomUUID()`/`Date.now()` in modules that render (lint rule).
- Tests run under happy-dom by default; no DOMPurify paths in this phase, so no `// @vitest-environment jsdom` needed.
- Run `npm run lint`, `npm run build`, and `npm run test:run` green before considering the phase done.

---

### Task 1: Data-model types

**Files:**
- Modify: `src/db/types.ts` (append after the `DocLink` interface, ~line 72)
- Test: none (pure type declarations; exercised by later tasks)

**Interfaces:**
- Produces: `Book`, `Chapter`, `Scene`, `SceneStatus`, `StructureType`, `Plotline`, `Beat` interfaces/types.

- [ ] **Step 1: Add the interfaces**

Append to `src/db/types.ts`:

```ts
// ---------------------------------------------------------------------------
// Manuscript authoring (the author's real novel — distinct from wiki pages and
// from the in-world Document page type). Book → Chapter → Scene, plus a Plottr-
// style plotline grid (Plotline lanes × Scene columns, Beat cells).
// ---------------------------------------------------------------------------

/** A book/volume in the world. A world can hold several (a series). */
export interface Book {
  id: string
  title: string
  synopsis: string          // short, plain text
  order: number             // position in the world's book list
  targetWordCount?: number  // optional word-count goal
  createdAt: number
  updatedAt: number
}

/** A chapter within a book. */
export interface Chapter {
  id: string
  bookId: string
  title: string
  order: number             // position within the book
  targetWordCount?: number
  createdAt: number
  updatedAt: number
}

/** A scene's draft state, distinct from the page `STATUSES`. */
export type SceneStatus = 'outline' | 'draft' | 'revised' | 'done'

/** A scene — the atomic writing unit. Holds the prose. */
export interface Scene {
  id: string
  bookId: string
  chapterId: string
  title: string
  content: string           // Tiptap HTML (rendered by LoreEditor)
  synopsis: string          // short card summary, plain text
  notes: string             // private notes, plain text
  status: SceneStatus
  order: number             // position within the chapter
  wordCount: number         // cached, recomputed on every content write
  targetWordCount?: number
  povPageId: string | null  // wiki page: POV character
  castPageIds: string[]     // wiki pages present in the scene
  locationPageIds: string[] // wiki pages: setting(s)
  createdAt: number
  updatedAt: number
}

/** Which built-in story structure a structure-track lane was seeded from. */
export type StructureType = 'save-the-cat' | 'heros-journey' | 'snowflake'

/** A lane on the grid. 'plot' = a storyline you track; 'structure' = a
 *  story-structure track (fixed named beats). At most one 'structure' lane per book. */
export interface Plotline {
  id: string
  bookId: string
  name: string
  color: string
  kind: 'plot' | 'structure'
  structureType?: StructureType   // set only when kind==='structure'
  order: number
  createdAt: number
  updatedAt: number
}

/** A cell on the grid: what a plotline does in a scene. */
export interface Beat {
  id: string
  bookId: string
  plotlineId: string
  sceneId: string | null    // null = a structure beat not yet aligned to a scene
  label: string             // structure beats carry a fixed name ("Catalyst"); plot beats optional
  note: string              // the card text
  order: number             // structure beats: canonical order; plot beats: placement fallback
  createdAt: number
  updatedAt: number
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors (types are unused so far, which is fine).

- [ ] **Step 3: Commit**

```bash
git add src/db/types.ts
git commit -m "feat(manuscript): add Book/Chapter/Scene/Plotline/Beat types"
```

---

### Task 2: Schema v11 — five new tables

**Files:**
- Modify: `src/db/schema.ts` (imports ~line 3-15; `LoreDB` fields ~line 99-109; add `this.version(11)` after the v10 block ~line 217)
- Test: `src/db/manuscript.test.ts` (create)

**Interfaces:**
- Consumes: `Book`, `Chapter`, `Scene`, `Plotline`, `Beat` from Task 1.
- Produces: `db.books`, `db.chapters`, `db.scenes`, `db.plotlines`, `db.beats` tables.

- [ ] **Step 1: Write the failing test**

Create `src/db/manuscript.test.ts`:

```ts
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
    // A round-trip through each table proves the store exists and is writable.
    await db.books.add({
      id: 'b1', title: 'Book One', synopsis: '', order: 0,
      createdAt: 1, updatedAt: 1,
    })
    expect(await db.books.get('b1')).toMatchObject({ title: 'Book One' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: FAIL — `db.books` is undefined (`Cannot read properties of undefined`).

- [ ] **Step 3: Add the table typings and imports**

In `src/db/schema.ts`, add to the `import type { … } from './types'` block:

```ts
  Book,
  Chapter,
  Scene,
  Plotline,
  Beat,
```

Add to the `LoreDB` class field declarations (after `docLinks!` ~line 109):

```ts
  books!: Table<Book, string>
  chapters!: Table<Chapter, string>
  scenes!: Table<Scene, string>
  plotlines!: Table<Plotline, string>
  beats!: Table<Beat, string>
```

- [ ] **Step 4: Add the v11 store version**

In `src/db/schema.ts`, immediately after the `this.version(10).stores({ … })` block (ends ~line 217), add:

```ts
    // v11 adds the manuscript authoring tables (books, chapters, scenes, plotlines,
    // beats); existing data is preserved (new tables need no data migration).
    this.version(11).stores({
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
      books: 'id, order',
      chapters: 'id, bookId, order',
      scenes: 'id, bookId, chapterId, order, updatedAt',
      plotlines: 'id, bookId, order',
      beats: 'id, bookId, plotlineId, sceneId',
    })
```

(Note: `scenes.updatedAt` is indexed because the snapshot change-counter queries it — Task 9.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/manuscript.test.ts
git commit -m "feat(manuscript): add v11 schema tables for books/chapters/scenes/plotlines/beats"
```

---

### Task 3: `manuscript.ts` scaffold — statuses, word count, book CRUD

**Files:**
- Create: `src/db/manuscript.ts`
- Test: `src/db/manuscript.test.ts` (extend)

**Interfaces:**
- Consumes: `db`, `uid`, `now` from `./schema`; `stripHtml` from `../html`; types from `./types`.
- Produces:
  - `SCENE_STATUSES: readonly { name: SceneStatus; label: string; color: string }[]`
  - `sceneStatusColor(status: SceneStatus): string`
  - `computeWordCount(html: string): number`
  - `createBook(title: string): Promise<Book>`
  - `updateBook(id: string, patch: Partial<Omit<Book, 'id' | 'createdAt'>>): Promise<void>`
  - `deleteBook(id: string): Promise<void>` (cascades chapters/scenes/plotlines/beats)
  - `listBooks(): Promise<Book[]>` (ordered by `order`)
  - `reorderBooks(orderedIds: string[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

Append to `src/db/manuscript.test.ts`:

```ts
import {
  SCENE_STATUSES, sceneStatusColor, computeWordCount,
  createBook, updateBook, deleteBook, listBooks, reorderBooks,
} from './manuscript'

describe('computeWordCount', () => {
  it('counts words in stripped HTML', () => {
    expect(computeWordCount('<p>Hello brave new world</p>')).toBe(4)
  })
  it('is zero for empty or tag-only HTML', () => {
    expect(computeWordCount('')).toBe(0)
    expect(computeWordCount('<p></p>')).toBe(0)
  })
})

describe('scene statuses', () => {
  it('has the four ordered states with colors', () => {
    expect(SCENE_STATUSES.map((s) => s.name)).toEqual(['outline', 'draft', 'revised', 'done'])
    expect(sceneStatusColor('draft')).toMatch(/^#/)
  })
})

describe('book CRUD', () => {
  it('creates books with incrementing order', async () => {
    const a = await createBook('Alpha')
    const b = await createBook('Beta')
    expect(a.order).toBe(0)
    expect(b.order).toBe(1)
    expect((await listBooks()).map((x) => x.title)).toEqual(['Alpha', 'Beta'])
  })

  it('updates a book and bumps updatedAt', async () => {
    const a = await createBook('Alpha')
    await updateBook(a.id, { title: 'Alpha Prime' })
    const got = (await listBooks()).find((x) => x.id === a.id)
    expect(got?.title).toBe('Alpha Prime')
    expect(got?.updatedAt).toBeGreaterThanOrEqual(a.updatedAt)
  })

  it('reorders books to match the given id order', async () => {
    const a = await createBook('Alpha')
    const b = await createBook('Beta')
    await reorderBooks([b.id, a.id])
    expect((await listBooks()).map((x) => x.title)).toEqual(['Beta', 'Alpha'])
  })

  it('deleteBook cascades its chapters, scenes, plotlines and beats', async () => {
    const a = await createBook('Alpha')
    await db.chapters.add({ id: 'c1', bookId: a.id, title: 'Ch', order: 0, createdAt: 1, updatedAt: 1 })
    await db.scenes.add({
      id: 's1', bookId: a.id, chapterId: 'c1', title: 'Sc', content: '', synopsis: '',
      notes: '', status: 'outline', order: 0, wordCount: 0, povPageId: null,
      castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: 1,
    })
    await db.plotlines.add({ id: 'p1', bookId: a.id, name: 'Main', color: '#fff', kind: 'plot', order: 0, createdAt: 1, updatedAt: 1 })
    await db.beats.add({ id: 'bt1', bookId: a.id, plotlineId: 'p1', sceneId: 's1', label: '', note: 'x', order: 0, createdAt: 1, updatedAt: 1 })
    await deleteBook(a.id)
    expect(await db.chapters.count()).toBe(0)
    expect(await db.scenes.count()).toBe(0)
    expect(await db.plotlines.count()).toBe(0)
    expect(await db.beats.count()).toBe(0)
    expect(await db.books.get(a.id)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: FAIL — cannot resolve `./manuscript` exports.

- [ ] **Step 3: Write the implementation**

Create `src/db/manuscript.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/manuscript.ts src/db/manuscript.test.ts
git commit -m "feat(manuscript): scene statuses, word count, book CRUD"
```

---

### Task 4: Chapter CRUD

**Files:**
- Modify: `src/db/manuscript.ts`
- Test: `src/db/manuscript.test.ts` (extend)

**Interfaces:**
- Consumes: `db`, `uid`, `now`; `Chapter` type.
- Produces:
  - `createChapter(bookId: string, title: string): Promise<Chapter>`
  - `updateChapter(id: string, patch: Partial<Omit<Chapter, 'id' | 'bookId' | 'createdAt'>>): Promise<void>`
  - `listChapters(bookId: string): Promise<Chapter[]>` (ordered by `order`)
  - `reorderChapters(bookId: string, orderedIds: string[]): Promise<void>`
  - `deleteChapter(id: string): Promise<void>` (cascades its scenes + those scenes' plot beats; structure beats revert to unplaced)

- [ ] **Step 1: Write the failing test**

Append to `src/db/manuscript.test.ts` (inside a new `describe('chapter CRUD', …)`):

```ts
import { createChapter, updateChapter, listChapters, reorderChapters, deleteChapter } from './manuscript'

describe('chapter CRUD', () => {
  it('creates chapters ordered within their book', async () => {
    const book = await createBook('B')
    const c1 = await createChapter(book.id, 'One')
    const c2 = await createChapter(book.id, 'Two')
    expect(c1.order).toBe(0)
    expect(c2.order).toBe(1)
    expect((await listChapters(book.id)).map((c) => c.title)).toEqual(['One', 'Two'])
  })

  it('scopes ordering per book', async () => {
    const b1 = await createBook('B1')
    const b2 = await createBook('B2')
    await createChapter(b1.id, 'A')
    const other = await createChapter(b2.id, 'B')
    expect(other.order).toBe(0) // independent of b1's chapters
  })

  it('deleteChapter removes its scenes', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    await db.scenes.add({
      id: 's1', bookId: book.id, chapterId: ch.id, title: 'Sc', content: '', synopsis: '',
      notes: '', status: 'outline', order: 0, wordCount: 0, povPageId: null,
      castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: 1,
    })
    await deleteChapter(ch.id)
    expect(await db.chapters.get(ch.id)).toBeUndefined()
    expect(await db.scenes.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: FAIL — chapter functions not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/db/manuscript.ts` (extend the `import type` to include `Chapter`, and add a helper for scene-beat cleanup that Task 5 also reuses):

```ts
// (extend the top import)
import type { Book, Chapter, SceneStatus } from './types'

// --- Beat cleanup helper (shared by scene/chapter delete) -------------------
// When a scene is removed, its plot beats are deleted, but a structure beat that
// was aligned to it reverts to unplaced (sceneId=null) rather than vanishing.
// Must run inside an rw transaction covering plotlines + beats.
async function detachBeatsForScene(sceneId: string): Promise<void> {
  const beats = await db.beats.where('sceneId').equals(sceneId).toArray()
  for (const beat of beats) {
    const lane = await db.plotlines.get(beat.plotlineId)
    if (lane?.kind === 'structure') {
      await db.beats.update(beat.id, { sceneId: null, updatedAt: now() })
    } else {
      await db.beats.delete(beat.id)
    }
  }
}

// --- Chapters ---------------------------------------------------------------

export async function createChapter(bookId: string, title: string): Promise<Chapter> {
  const existing = await db.chapters.where('bookId').equals(bookId).toArray()
  const order = existing.reduce((max, c) => Math.max(max, c.order + 1), 0)
  const chapter: Chapter = {
    id: uid(), bookId, title, order, createdAt: now(), updatedAt: now(),
  }
  await db.chapters.add(chapter)
  return chapter
}

export async function updateChapter(
  id: string,
  patch: Partial<Omit<Chapter, 'id' | 'bookId' | 'createdAt'>>,
): Promise<void> {
  await db.chapters.update(id, { ...patch, updatedAt: now() })
}

export async function listChapters(bookId: string): Promise<Chapter[]> {
  return db.chapters.where('bookId').equals(bookId).sortBy('order')
}

export async function reorderChapters(bookId: string, orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.chapters, async () => {
    const byId = new Map((await db.chapters.where('bookId').equals(bookId).toArray()).map((c) => [c.id, c]))
    let index = 0
    for (const id of orderedIds) {
      if (byId.has(id)) {
        await db.chapters.update(id, { order: index })
        index++
      }
    }
  })
}

export async function deleteChapter(id: string): Promise<void> {
  await db.transaction('rw', [db.chapters, db.scenes, db.plotlines, db.beats], async () => {
    const scenes = await db.scenes.where('chapterId').equals(id).toArray()
    for (const scene of scenes) {
      await detachBeatsForScene(scene.id)
      await db.scenes.delete(scene.id)
    }
    await db.chapters.delete(id)
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/manuscript.ts src/db/manuscript.test.ts
git commit -m "feat(manuscript): chapter CRUD with scene cascade"
```

---

### Task 5: Scene CRUD + word-count upkeep + rollups

**Files:**
- Modify: `src/db/manuscript.ts`
- Test: `src/db/manuscript.test.ts` (extend)

**Interfaces:**
- Consumes: `db`, `uid`, `now`, `computeWordCount`, `detachBeatsForScene`; `Scene`, `SceneStatus` types.
- Produces:
  - `createScene(bookId: string, chapterId: string, title: string): Promise<Scene>`
  - `updateScene(id: string, patch: Partial<Omit<Scene, 'id' | 'bookId' | 'createdAt'>>): Promise<void>` (recomputes `wordCount` whenever `content` is in the patch)
  - `listScenes(chapterId: string): Promise<Scene[]>` (ordered by `order`)
  - `reorderScenes(chapterId: string, orderedIds: string[]): Promise<void>`
  - `moveScene(sceneId: string, toChapterId: string, toIndex: number): Promise<void>`
  - `deleteScene(id: string): Promise<void>`
  - `chapterWordCount(chapterId: string): Promise<number>`
  - `bookWordCount(bookId: string): Promise<number>`

- [ ] **Step 1: Write the failing test**

Append to `src/db/manuscript.test.ts`:

```ts
import {
  createScene, updateScene, listScenes, reorderScenes, moveScene, deleteScene,
  chapterWordCount, bookWordCount,
} from './manuscript'

describe('scene CRUD', () => {
  it('creates a scene with sensible defaults', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    const sc = await createScene(book.id, ch.id, 'Opening')
    expect(sc).toMatchObject({
      status: 'outline', order: 0, wordCount: 0, content: '',
      povPageId: null, castPageIds: [], locationPageIds: [],
    })
  })

  it('recomputes wordCount when content changes', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    const sc = await createScene(book.id, ch.id, 'Opening')
    await updateScene(sc.id, { content: '<p>one two three</p>' })
    expect((await db.scenes.get(sc.id))?.wordCount).toBe(3)
  })

  it('does not touch wordCount when content is not in the patch', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    const sc = await createScene(book.id, ch.id, 'Opening')
    await updateScene(sc.id, { content: '<p>a b</p>' })
    await updateScene(sc.id, { status: 'draft' })
    expect((await db.scenes.get(sc.id))?.wordCount).toBe(2)
  })

  it('rolls up word counts by chapter and book', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    const a = await createScene(book.id, ch.id, 'A')
    const b = await createScene(book.id, ch.id, 'B')
    await updateScene(a.id, { content: '<p>one two</p>' })
    await updateScene(b.id, { content: '<p>three</p>' })
    expect(await chapterWordCount(ch.id)).toBe(3)
    expect(await bookWordCount(book.id)).toBe(3)
  })

  it('moves a scene to another chapter at an index', async () => {
    const book = await createBook('B')
    const c1 = await createChapter(book.id, 'One')
    const c2 = await createChapter(book.id, 'Two')
    const sc = await createScene(book.id, c1.id, 'Wanderer')
    await moveScene(sc.id, c2.id, 0)
    const moved = await db.scenes.get(sc.id)
    expect(moved?.chapterId).toBe(c2.id)
    expect((await listScenes(c1.id)).length).toBe(0)
    expect((await listScenes(c2.id)).map((s) => s.id)).toEqual([sc.id])
  })

  it('deleteScene removes plot beats but unplaces structure beats', async () => {
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'One')
    const sc = await createScene(book.id, ch.id, 'A')
    await db.plotlines.bulkAdd([
      { id: 'plot', bookId: book.id, name: 'Main', color: '#fff', kind: 'plot', order: 0, createdAt: 1, updatedAt: 1 },
      { id: 'struct', bookId: book.id, name: 'Save the Cat', color: '#000', kind: 'structure', structureType: 'save-the-cat', order: 1, createdAt: 1, updatedAt: 1 },
    ])
    await db.beats.bulkAdd([
      { id: 'plotBeat', bookId: book.id, plotlineId: 'plot', sceneId: sc.id, label: '', note: 'x', order: 0, createdAt: 1, updatedAt: 1 },
      { id: 'structBeat', bookId: book.id, plotlineId: 'struct', sceneId: sc.id, label: 'Catalyst', note: '', order: 0, createdAt: 1, updatedAt: 1 },
    ])
    await deleteScene(sc.id)
    expect(await db.beats.get('plotBeat')).toBeUndefined()
    expect((await db.beats.get('structBeat'))?.sceneId).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: FAIL — scene functions not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/db/manuscript.ts` (extend the `import type` to include `Scene`):

```ts
// (extend the top import)
import type { Book, Chapter, Scene, SceneStatus } from './types'

// --- Scenes -----------------------------------------------------------------

export async function createScene(
  bookId: string,
  chapterId: string,
  title: string,
): Promise<Scene> {
  const existing = await db.scenes.where('chapterId').equals(chapterId).toArray()
  const order = existing.reduce((max, s) => Math.max(max, s.order + 1), 0)
  const scene: Scene = {
    id: uid(), bookId, chapterId, title, content: '', synopsis: '', notes: '',
    status: 'outline', order, wordCount: 0, povPageId: null,
    castPageIds: [], locationPageIds: [], createdAt: now(), updatedAt: now(),
  }
  await db.scenes.add(scene)
  return scene
}

export async function updateScene(
  id: string,
  patch: Partial<Omit<Scene, 'id' | 'bookId' | 'createdAt'>>,
): Promise<void> {
  const next: Partial<Scene> = { ...patch, updatedAt: now() }
  if (typeof patch.content === 'string') {
    next.wordCount = computeWordCount(patch.content)
  }
  await db.scenes.update(id, next)
}

export async function listScenes(chapterId: string): Promise<Scene[]> {
  return db.scenes.where('chapterId').equals(chapterId).sortBy('order')
}

export async function reorderScenes(chapterId: string, orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.scenes, async () => {
    const byId = new Map((await db.scenes.where('chapterId').equals(chapterId).toArray()).map((s) => [s.id, s]))
    let index = 0
    for (const id of orderedIds) {
      if (byId.has(id)) {
        await db.scenes.update(id, { order: index })
        index++
      }
    }
  })
}

export async function moveScene(
  sceneId: string,
  toChapterId: string,
  toIndex: number,
): Promise<void> {
  await db.transaction('rw', db.scenes, async () => {
    const scene = await db.scenes.get(sceneId)
    if (!scene) return
    const target = (await db.scenes.where('chapterId').equals(toChapterId).sortBy('order'))
      .filter((s) => s.id !== sceneId)
    target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, { ...scene, chapterId: toChapterId })
    let index = 0
    for (const s of target) {
      await db.scenes.update(s.id, {
        chapterId: toChapterId, order: index, updatedAt: now(),
      })
      index++
    }
  })
}

export async function deleteScene(id: string): Promise<void> {
  await db.transaction('rw', [db.scenes, db.plotlines, db.beats], async () => {
    await detachBeatsForScene(id)
    await db.scenes.delete(id)
  })
}

// --- Word-count rollups -----------------------------------------------------

export async function chapterWordCount(chapterId: string): Promise<number> {
  const scenes = await db.scenes.where('chapterId').equals(chapterId).toArray()
  return scenes.reduce((sum, s) => sum + s.wordCount, 0)
}

export async function bookWordCount(bookId: string): Promise<number> {
  const scenes = await db.scenes.where('bookId').equals(bookId).toArray()
  return scenes.reduce((sum, s) => sum + s.wordCount, 0)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/manuscript.ts src/db/manuscript.test.ts
git commit -m "feat(manuscript): scene CRUD, word-count upkeep, rollups"
```

---

### Task 6: Barrel re-export

**Files:**
- Modify: `src/db/index.ts` (add export line + doc comment ~line 28-32)
- Test: `src/db/barrel.test.ts` (existing — verifies the public surface)

**Interfaces:**
- Produces: all `manuscript.ts` exports available via `'../db'`.

- [ ] **Step 1: Add the barrel export**

In `src/db/index.ts`, add to the module-list doc comment (after the `docLinks.ts` line):

```
//   manuscript.ts — books/chapters/scenes/plotlines/beats CRUD, word count
```

And add the re-export (after `export * from './docLinks'`):

```ts
export * from './manuscript'
```

- [ ] **Step 2: Run the barrel test**

Run: `npm run test:run -- src/db/barrel.test.ts`
Expected: PASS (the new exports resolve; no name collisions).

- [ ] **Step 3: Verify a consumer can import from the barrel**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/index.ts
git commit -m "feat(manuscript): re-export manuscript API from db barrel"
```

---

### Task 7: Backup / import coverage

**Files:**
- Modify: `src/db/backup.ts` (imports; `CURRENT_SCHEMA_VERSION`; `BackupData`; `BackupCounts`; `MIGRATIONS`; `parseBackup` counts; `exportAll`; `sanitizeBackup`; `importAll`)
- Test: `src/db/backup.test.ts` (extend)

**Interfaces:**
- Consumes: `Book`, `Chapter`, `Scene`, `Plotline`, `Beat` types; `sanitizeHtml`.
- Produces: manuscript tables included in export/import; `CURRENT_SCHEMA_VERSION === 11`; migration step at key `10`.

- [ ] **Step 1a: Write the failing round-trip + migration test**

Append to `src/db/backup.test.ts`. Match the file's existing style: import from the `'../db'` barrel, and reuse the file's existing `beforeEach` DB-reset (do NOT add a second reset). This file runs under the default **happy-dom** — so it must NOT assert `<script>` removal (happy-dom's parser lets `<script>` survive DOMPurify; that assertion lives in Step 1b under jsdom):

```ts
import { db } from '../db' // (barrel already imported at top of file; add these names to it)

describe('backup — manuscript tables', () => {
  it('CURRENT_SCHEMA_VERSION is 11', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(11)
  })

  it('round-trips books/chapters/scenes/plotlines/beats', async () => {
    await db.books.add({ id: 'b1', title: 'B', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 })
    await db.chapters.add({ id: 'c1', bookId: 'b1', title: 'C', order: 0, createdAt: 1, updatedAt: 1 })
    await db.scenes.add({
      id: 's1', bookId: 'b1', chapterId: 'c1', title: 'S', content: '<p>hi</p>', synopsis: '',
      notes: '', status: 'draft', order: 0, wordCount: 1, povPageId: null,
      castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: 1,
    })
    await db.plotlines.add({ id: 'p1', bookId: 'b1', name: 'Main', color: '#fff', kind: 'plot', order: 0, createdAt: 1, updatedAt: 1 })
    await db.beats.add({ id: 'bt1', bookId: 'b1', plotlineId: 'p1', sceneId: 's1', label: '', note: 'note', order: 0, createdAt: 1, updatedAt: 1 })

    const json = await exportAll()
    await importAll(json) // clears then restores
    expect(await db.books.count()).toBe(1)
    expect(await db.chapters.count()).toBe(1)
    expect(await db.scenes.count()).toBe(1)
    expect(await db.plotlines.count()).toBe(1)
    expect(await db.beats.count()).toBe(1)
  })

  it('an old backup (schemaVersion 10) imports with empty manuscript tables', () => {
    const { data, counts } = parseBackup(JSON.stringify({ schemaVersion: 10, pages: [] }))
    expect(data.books).toEqual([])
    expect(counts.books).toBe(0)
  })
})
```

Add `exportAll` (if not already imported), `parseBackup`, `CURRENT_SCHEMA_VERSION`, and `db` to the file's existing top-of-file barrel import as needed.

- [ ] **Step 1b: Write the failing sanitize test (jsdom)**

Create `src/db/manuscript-backup.sanitize.test.ts` — a dedicated file with the **jsdom** pragma, because asserting `<script>` is *stripped* requires jsdom's parser (see the `dompurify-needs-jsdom-in-tests` convention; happy-dom lets `<script>` survive, which would make this assertion pass falsely-or-fail unpredictably):

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { db, exportAll, importAll } from '../db'

afterEach(async () => {
  await Promise.all([db.books.clear(), db.chapters.clear(), db.scenes.clear(), db.pages.clear()])
})

describe('backup sanitizes scene content on import', () => {
  it('strips <script> from scene.content', async () => {
    await db.books.add({ id: 'b1', title: 'B', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 })
    await db.chapters.add({ id: 'c1', bookId: 'b1', title: 'C', order: 0, createdAt: 1, updatedAt: 1 })
    await db.scenes.add({
      id: 's1', bookId: 'b1', chapterId: 'c1', title: 'S',
      content: '<p>ok</p><script>alert(1)</script>', synopsis: '', notes: '',
      status: 'draft', order: 0, wordCount: 1, povPageId: null,
      castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: 1,
    })
    const json = await exportAll()
    await importAll(json)
    expect((await db.scenes.get('s1'))?.content).not.toContain('<script>')
  })
})
```

- [ ] **Step 2: Run both to verify they fail**

Run: `npm run test:run -- src/db/backup.test.ts src/db/manuscript-backup.sanitize.test.ts`
Expected: FAIL — `CURRENT_SCHEMA_VERSION` is 10; manuscript tables not in export; scene content not sanitized.

- [ ] **Step 3: Update `backup.ts` — types and version**

In `src/db/backup.ts`:

Add to the `import type { … } from './types'` block:

```ts
  Book,
  Chapter,
  Scene,
  Plotline,
  Beat,
```

Change the constant:

```ts
export const CURRENT_SCHEMA_VERSION = 11
```

Add to `BackupData` (after `docLinks?`):

```ts
  books?: Book[]
  chapters?: Chapter[]
  scenes?: Scene[]
  plotlines?: Plotline[]
  beats?: Beat[]
```

Add to `BackupCounts` (after `docLinks: number`):

```ts
  books: number
  chapters: number
  scenes: number
  plotlines: number
  beats: number
```

- [ ] **Step 4: Update `backup.ts` — migration, counts, export, sanitize, import**

Add the migration step to `MIGRATIONS` (after the `9:` entry):

```ts
  // v11 added the manuscript authoring tables; fill them in for older backups.
  10: (d) => ({
    ...d,
    books: asArray(d.books),
    chapters: asArray(d.chapters),
    scenes: asArray(d.scenes),
    plotlines: asArray(d.plotlines),
    beats: asArray(d.beats),
  }),
```

Add to the `counts` object in `parseBackup` (after `docLinks: …`):

```ts
      books: asArray(data.books).length,
      chapters: asArray(data.chapters).length,
      scenes: asArray(data.scenes).length,
      plotlines: asArray(data.plotlines).length,
      beats: asArray(data.beats).length,
```

In `exportAll`, extend the `Promise.all` destructure and reads:

```ts
  const [pages, maps, pins, regions, templates, calendars, events, images, docLinks,
    books, chapters, scenes, plotlines, beats] = await Promise.all([
    db.pages.toArray(),
    db.maps.toArray(),
    db.pins.toArray(),
    db.regions.toArray(),
    db.templates.toArray(),
    db.calendars.toArray(),
    db.events.toArray(),
    db.images.toArray(),
    db.docLinks.toArray(),
    db.books.toArray(),
    db.chapters.toArray(),
    db.scenes.toArray(),
    db.plotlines.toArray(),
    db.beats.toArray(),
  ])
```

and add `books, chapters, scenes, plotlines, beats` to the returned `JSON.stringify({ … })` payload (after `docLinks`).

In `sanitizeBackup`, add scene-content scrubbing to the returned object (after the `docLinks` block):

```ts
    scenes: asArray(data.scenes).map((s) => ({ ...s, content: sanitizeHtml(s.content) })),
```

(`synopsis`, `notes`, `title` are plain text rendered as React text — left untouched, like `summary`.)

In `importAll`, add the five tables to the transaction scope, the `clear()` batch, and the `bulkAdd` sequence:

```ts
  await db.transaction('rw', [db.pages, db.maps, db.pins, db.regions, db.templates, db.calendars, db.events, db.images, db.docLinks, db.books, db.chapters, db.scenes, db.plotlines, db.beats], async () => {
    await Promise.all([
      db.pages.clear(), db.maps.clear(), db.pins.clear(), db.regions.clear(),
      db.templates.clear(), db.calendars.clear(), db.events.clear(), db.images.clear(),
      db.docLinks.clear(), db.books.clear(), db.chapters.clear(), db.scenes.clear(),
      db.plotlines.clear(), db.beats.clear(),
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
    await db.books.bulkAdd(asArray(data.books))
    await db.chapters.bulkAdd(asArray(data.chapters))
    await db.scenes.bulkAdd(asArray(data.scenes))
    await db.plotlines.bulkAdd(asArray(data.plotlines))
    await db.beats.bulkAdd(asArray(data.beats))
  })
```

- [ ] **Step 5: Run both tests to verify they pass**

Run: `npm run test:run -- src/db/backup.test.ts src/db/manuscript-backup.sanitize.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/backup.ts src/db/backup.test.ts src/db/manuscript-backup.sanitize.test.ts
git commit -m "feat(manuscript): include manuscript tables in backup/import (schema v11)"
```

---

### Task 8: Snapshot change-tracking

**Files:**
- Modify: `src/snapshots.ts` (the `takeSnapshot` change count ~line 30-35)
- Test: `src/snapshots.test.ts` (extend if present; otherwise add a focused test file `src/snapshots.test.ts`)

**Interfaces:**
- Consumes: `db.scenes` indexed on `updatedAt` (Task 2).
- Produces: scene writes counted toward the snapshot change threshold.

- [ ] **Step 1: Write the failing test**

Add to `src/snapshots.test.ts` (create if it does not exist; mirror existing db-test setup with fake-indexeddb):

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { db, setMeta } from './db'
import { maybeTakeSnapshot } from './snapshots'

afterEach(async () => {
  await Promise.all([db.scenes.clear(), db.snapshots.clear(), db.pages.clear()])
})

describe('snapshots count scene changes', () => {
  it('takes a snapshot after enough scene edits', async () => {
    await setMeta('snapshot-last-time', 0)
    // Add 50 scenes updated after the last snapshot time to cross the default threshold.
    const scenes = Array.from({ length: 50 }, (_, i) => ({
      id: `s${i}`, bookId: 'b', chapterId: 'c', title: 't', content: '', synopsis: '',
      notes: '', status: 'outline' as const, order: i, wordCount: 0, povPageId: null,
      castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: Date.now(),
    }))
    await db.scenes.bulkAdd(scenes)
    await maybeTakeSnapshot()
    expect(await db.snapshots.count()).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/snapshots.test.ts`
Expected: FAIL — no snapshot taken (scenes not counted).

- [ ] **Step 3: Update `takeSnapshot`**

In `src/snapshots.ts`, extend the change count. Replace the `Promise.all` + `changed` computation (~line 30-35):

```ts
  const [pagesChanged, events, scenesChanged] = await Promise.all([
    db.pages.where('updatedAt').above(lastTime).count(),
    db.events.toArray(),
    db.scenes.where('updatedAt').above(lastTime).count(),
  ])
  const eventsChanged = events.filter((e) => e.updatedAt > lastTime).length
  const changed = pagesChanged + eventsChanged + scenesChanged
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/snapshots.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/snapshots.ts src/snapshots.test.ts
git commit -m "feat(manuscript): count scene edits toward auto-snapshots"
```

---

### Task 9: Full green gate

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `tsc -b` + vite build succeed.

- [ ] **Step 3: Full test suite**

Run: `npm run test:run`
Expected: all tests pass (new manuscript, backup, snapshot tests included).

- [ ] **Step 4: Commit any incidental fixes**

```bash
git add -A
git commit -m "chore(manuscript): phase 1 data layer green (lint+build+test)"
```

---

## Self-Review

**Spec coverage (Phase 1 scope):**
- Five tables + types → Tasks 1, 2. ✓
- Book/Chapter/Scene CRUD + reorder + cascade → Tasks 3, 4, 5. ✓
- Word-count compute + cache + rollups → Tasks 3, 5. ✓
- Scene status set (colors) → Task 3. ✓
- Structured refs (povPageId/castPageIds/locationPageIds) on Scene → Task 1 type + Task 5 defaults. ✓
- Backup/import + schema-version bump + migration + scene sanitize → Task 7. ✓
- Snapshot change-tracking → Task 8. ✓
- Barrel re-export → Task 6. ✓
- Plotline/Beat tables exist (for backup + cascade correctness) though their grid CRUD is Phase 4 → Tasks 1, 2, and cascade logic in Tasks 3–5. ✓

**Deferred to later phases (correctly out of Phase 1):** all UI/routes (Phase 2), `sceneAppearances` (Phase 3), plotline/beat CRUD + grid (Phase 4), structure definitions (Phase 5), export (Phase 6).

**Placeholder scan:** no TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `SceneStatus` values (`outline|draft|revised|done`) match across types, `SCENE_STATUSES`, and tests. `detachBeatsForScene` defined in Task 4, reused in Task 5. `CURRENT_SCHEMA_VERSION === 11` matches Dexie `version(11)`. Scene index on `updatedAt` (Task 2) is what Task 8 queries. ✓
