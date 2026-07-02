# Manuscript Authoring — Phase 3: "Appears in" Backlinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a worldbuilding page, show which manuscript scenes it appears in — via the scene's structured refs (POV / cast / location) and inline `[[wiki-links]]` in the prose.

**Architecture:** A pure `sceneAppearances(pageId)` query in `src/db/manuscript.ts` (already barrel-exported) resolves a page's appearances across scenes, joined to their chapter/book titles and tagged with a role. A new `SceneAppearances` component renders an "Appears in" section in the page aside, beside the existing `Backlinks` (kept visually distinct).

**Tech Stack:** TypeScript strict, dexie-react-hooks `useLiveQuery`, Vitest + @testing-library/react + happy-dom.

**Spec:** `docs/superpowers/specs/2026-07-02-manuscript-authoring-design.md`
**Depends on:** Phases 1–2 (branch `feat/manuscript-authoring`). This branch (`feat/manuscript-appears-in`) is stacked on it.

## Global Constraints

- TypeScript `strict`; no `any`. Ids/timestamps via `uid()`/`now()` where needed.
- Component tests using `useLiveQuery` MUST `afterEach(cleanup)`.
- Reuse `wikiLinkTitles()` from `src/html.ts` for the inline-link scan (don't re-parse HTML).
- Match `Backlinks.tsx` structure/classes for the new section.
- Run `npm run lint`, `npm run build`, `npm run test:run` green before done.

---

### Task 1: `sceneAppearances()` query

**Files:**
- Modify: `src/db/manuscript.ts` (add near the rollups; extend the `../html` import)
- Test: `src/db/manuscript.test.ts` (extend)

**Interfaces:**
- Consumes: `db.pages`, `db.scenes`, `db.chapters`, `db.books`; `wikiLinkTitles` from `../html`.
- Produces:
  ```ts
  export type AppearanceRole = 'pov' | 'cast' | 'location' | 'mention'
  export interface SceneAppearance {
    sceneId: string
    bookId: string
    bookTitle: string
    chapterTitle: string
    sceneTitle: string
    roles: AppearanceRole[]
  }
  export async function sceneAppearances(pageId: string): Promise<SceneAppearance[]>
  ```
  Roles: `pov` if `scene.povPageId === pageId`; `cast`/`location` if the id is in the respective array; `mention` if the page's title appears as an inline `[[wiki-link]]` in `scene.content`. Ordered by book.order → chapter.order → scene.order. Empty if the page or its manuscript refs don't exist.

- [ ] **Step 1: Write the failing test**

Append to `src/db/manuscript.test.ts`:

```ts
import { sceneAppearances } from './manuscript'

describe('sceneAppearances', () => {
  afterEach(async () => { await db.pages.clear() })

  async function seedPage(id: string, title: string) {
    await db.pages.add({
      id, title, category: 'Character', content: '', summary: '', tags: [],
      createdAt: 1, updatedAt: 1,
    } as never)
  }

  it('finds scenes by pov/cast/location refs', async () => {
    await seedPage('alice', 'Alice')
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'Chapter One')
    const sc = await createScene(book.id, ch.id, 'The Meeting')
    await updateScene(sc.id, { castPageIds: ['alice'] })
    const out = await sceneAppearances('alice')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      sceneTitle: 'The Meeting', chapterTitle: 'Chapter One', bookTitle: 'B',
    })
    expect(out[0].roles).toContain('cast')
  })

  it('finds scenes that mention the page via an inline wiki link', async () => {
    await seedPage('bob', 'Bob')
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'C')
    const sc = await createScene(book.id, ch.id, 'S')
    await updateScene(sc.id, {
      content: '<p><a data-wikilink="" data-title="Bob" class="wiki-link">Bob</a> arrives.</p>',
    })
    const out = await sceneAppearances('bob')
    expect(out).toHaveLength(1)
    expect(out[0].roles).toContain('mention')
  })

  it('returns empty for a page with no appearances', async () => {
    await seedPage('nobody', 'Nobody')
    expect(await sceneAppearances('nobody')).toEqual([])
  })

  it('collapses multiple roles for one scene into a single entry', async () => {
    await seedPage('alice', 'Alice')
    const book = await createBook('B')
    const ch = await createChapter(book.id, 'C')
    const sc = await createScene(book.id, ch.id, 'S')
    await updateScene(sc.id, {
      povPageId: 'alice',
      content: '<p><a data-wikilink="" data-title="Alice" class="wiki-link">Alice</a></p>',
    })
    const out = await sceneAppearances('alice')
    expect(out).toHaveLength(1)
    expect(out[0].roles).toEqual(expect.arrayContaining(['pov', 'mention']))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: FAIL — `sceneAppearances` not exported.

- [ ] **Step 3: Implement `sceneAppearances`**

In `src/db/manuscript.ts`, extend the html import:

```ts
import { stripHtml, wikiLinkTitles } from '../html'
```

Add the types + function (after the word-count rollups):

```ts
// --- "Appears in": which scenes reference a wiki page --------------------------

export type AppearanceRole = 'pov' | 'cast' | 'location' | 'mention'

export interface SceneAppearance {
  sceneId: string
  bookId: string
  bookTitle: string
  chapterTitle: string
  sceneTitle: string
  roles: AppearanceRole[]
}

/** Every manuscript scene that references `pageId` — via its POV/cast/location
 *  refs (id-based) or an inline [[wiki-link]] to the page's title in the prose.
 *  Ordered by book, then chapter, then scene. */
export async function sceneAppearances(pageId: string): Promise<SceneAppearance[]> {
  const page = await db.pages.get(pageId)
  if (!page) return []
  const titleLc = page.title.trim().toLowerCase()

  const [scenes, chapters, books] = await Promise.all([
    db.scenes.toArray(),
    db.chapters.toArray(),
    db.books.toArray(),
  ])
  const chapterById = new Map(chapters.map((c) => [c.id, c]))
  const bookById = new Map(books.map((b) => [b.id, b]))

  const out: (SceneAppearance & { _bookOrder: number; _chOrder: number; _scOrder: number })[] = []
  for (const s of scenes) {
    const roles: AppearanceRole[] = []
    if (s.povPageId === pageId) roles.push('pov')
    if (s.castPageIds.includes(pageId)) roles.push('cast')
    if (s.locationPageIds.includes(pageId)) roles.push('location')
    if (wikiLinkTitles(s.content).some((t) => t.trim().toLowerCase() === titleLc)) {
      roles.push('mention')
    }
    if (roles.length === 0) continue
    const ch = chapterById.get(s.chapterId)
    const bk = bookById.get(s.bookId)
    out.push({
      sceneId: s.id,
      bookId: s.bookId,
      bookTitle: bk?.title ?? '(book)',
      chapterTitle: ch?.title ?? '(chapter)',
      sceneTitle: s.title,
      roles,
      _bookOrder: bk?.order ?? 0,
      _chOrder: ch?.order ?? 0,
      _scOrder: s.order,
    })
  }

  out.sort((a, b) =>
    a._bookOrder - b._bookOrder || a._chOrder - b._chOrder || a._scOrder - b._scOrder,
  )
  return out.map(({ _bookOrder, _chOrder, _scOrder, ...rest }) => rest)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/manuscript.ts src/db/manuscript.test.ts
git commit -m "feat(manuscript): sceneAppearances() query for wiki-page appearances"
```

---

### Task 2: `SceneAppearances` component

**Files:**
- Create: `src/components/SceneAppearances.tsx`
- Test: `src/components/SceneAppearances.test.tsx`

**Interfaces:**
- Consumes: `sceneAppearances`, `type SceneAppearance` from `../db`; `useLiveQuery`; `Link`.
- Produces: `SceneAppearances({ pageId }: { pageId: string })` — renders an "Appears in" section, one row per scene linking to `/book/:bookId?scene=:sceneId`, with role chips. Renders nothing when there are no appearances (like `Backlinks` stays quiet, but this one returns null to avoid an empty box on pages with no manuscript at all).

- [ ] **Step 1: Write the failing test**

Create `src/components/SceneAppearances.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, createBook, createChapter, createScene, updateScene } from '../db'
import SceneAppearances from './SceneAppearances'

afterEach(async () => {
  cleanup()
  await Promise.all([db.pages.clear(), db.books.clear(), db.chapters.clear(), db.scenes.clear()])
})

async function seedPage(id: string, title: string) {
  await db.pages.add({
    id, title, category: 'Character', content: '', summary: '', tags: [],
    createdAt: 1, updatedAt: 1,
  } as never)
}

describe('SceneAppearances', () => {
  it('lists the scenes a page appears in', async () => {
    await seedPage('alice', 'Alice')
    const book = await createBook('The Saga')
    const ch = await createChapter(book.id, 'Chapter One')
    const sc = await createScene(book.id, ch.id, 'The Meeting')
    await updateScene(sc.id, { povPageId: 'alice' })
    render(<MemoryRouter><SceneAppearances pageId="alice" /></MemoryRouter>)
    expect(await screen.findByText('The Meeting')).toBeTruthy()
    expect(screen.getByText(/appears in/i)).toBeTruthy()
    expect(screen.getByText(/pov/i)).toBeTruthy()
  })

  it('renders nothing when the page has no appearances', async () => {
    await seedPage('nobody', 'Nobody')
    const { container } = render(<MemoryRouter><SceneAppearances pageId="nobody" /></MemoryRouter>)
    await new Promise((r) => setTimeout(r, 0))
    expect(container.textContent).toBe('')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/SceneAppearances.test.tsx`
Expected: FAIL — cannot find `./SceneAppearances`.

- [ ] **Step 3: Implement `SceneAppearances`**

Create `src/components/SceneAppearances.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { sceneAppearances, type AppearanceRole } from '../db'

const ROLE_LABEL: Record<AppearanceRole, string> = {
  pov: 'POV',
  cast: 'Cast',
  location: 'Location',
  mention: 'Mention',
}

/** "Appears in": manuscript scenes that reference this page (POV/cast/location
 *  refs or inline wiki links). Distinct from wiki backlinks. Quiet when empty. */
export default function SceneAppearances({ pageId }: { pageId: string }) {
  const appearances = useLiveQuery(() => sceneAppearances(pageId), [pageId])

  if (!appearances || appearances.length === 0) return null

  return (
    <div className="appears-in">
      <div className="appears-in-head">Appears in <span className="backlinks-count">{appearances.length}</span></div>
      <ul className="appears-in-list">
        {appearances.map((a) => (
          <li key={a.sceneId}>
            <Link to={`/book/${a.bookId}?scene=${a.sceneId}`} className="appears-in-row">
              <span className="appears-in-scene">{a.sceneTitle}</span>
              <span className="appears-in-loc">{a.bookTitle} › {a.chapterTitle}</span>
            </Link>
            <span className="appears-in-roles">
              {a.roles.map((r) => (
                <span key={r} className="appears-in-role">{ROLE_LABEL[r]}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/SceneAppearances.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SceneAppearances.tsx src/components/SceneAppearances.test.tsx
git commit -m "feat(manuscript): SceneAppearances 'Appears in' section component"
```

---

### Task 3: Wire into the page aside + styles

**Files:**
- Modify: `src/routes/PageRoute.tsx` (aside, after `<Backlinks pageId={id} />` ~line 333)
- Modify: `src/index.css` (append `.appears-in*` rules)
- Test: none new (covered by Task 2 + existing PageRoute render); verify via green gate

- [ ] **Step 1: Mount the component**

In `src/routes/PageRoute.tsx`, add the import beside the `Backlinks` import:

```ts
import SceneAppearances from '../components/SceneAppearances'
```

Add it right after `<Backlinks pageId={id} />`:

```tsx
          <Backlinks pageId={id} />
          <SceneAppearances pageId={id} />
```

- [ ] **Step 2: Add styles**

Append to `src/index.css`:

```css
/* "Appears in" — manuscript scene references on a wiki page */
.appears-in {
  margin-top: 1rem;
}
.appears-in-head {
  font-family: var(--display);
  font-size: 0.9rem;
  color: var(--ink-dim);
  margin-bottom: 0.5rem;
}
.appears-in-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.appears-in-row {
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: var(--ink);
}
.appears-in-row:hover .appears-in-scene {
  color: var(--accent);
}
.appears-in-scene {
  font-size: 0.9rem;
}
.appears-in-loc {
  font-size: 0.75rem;
  color: var(--ink-faint);
}
.appears-in-roles {
  display: inline-flex;
  gap: 0.25rem;
  margin-top: 0.15rem;
  flex-wrap: wrap;
}
.appears-in-role {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ink-dim);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/PageRoute.tsx src/index.css
git commit -m "feat(manuscript): mount Appears-in section on the page aside"
```

---

### Task 4: Full green gate

**Files:** none (verification only)

- [ ] **Step 1: Lint** — Run: `npm run lint` — Expected: clean.
- [ ] **Step 2: Build** — Run: `npm run build` — Expected: succeeds.
- [ ] **Step 3: Tests** — Run: `npm run test:run` — Expected: all pass.
- [ ] **Step 4: Commit any incidental fixes**

```bash
git add -A
git commit -m "chore(manuscript): phase 3 green (lint+build+test)"
```

---

## Self-Review

**Spec coverage (Phase 3):**
- `sceneAppearances(pageId)` scanning pov/cast/location + inline links → Task 1. ✓
- "Appears in" section on the page aside, distinct from wiki backlinks → Tasks 2, 3. ✓
- Reuses `wikiLinkTitles()` rather than re-parsing → Task 1. ✓

**Deferred (out of Phase 3):** plotline grid (4), structure track (5), export (6).

**Placeholder scan:** none. Every code step is complete.

**Type consistency:** `AppearanceRole`/`SceneAppearance` defined in Task 1, consumed by Task 2. Link target `/book/:bookId?scene=` matches the Phase-2 `BookRoute` `?scene=` selection. `sceneAppearances` returns the public shape (internal `_*Order` sort keys stripped before return). ✓
