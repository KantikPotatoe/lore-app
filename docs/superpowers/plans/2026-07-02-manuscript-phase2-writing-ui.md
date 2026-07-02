# Manuscript Authoring — Phase 2: Writing UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the manuscript usable in the app — a Manuscript books index, a per-book workspace with a chapter/scene binder and a scene editor (reusing `LoreEditor`) plus a scene metadata panel (status, goals, POV/cast/location wiki refs, synopsis, notes), reachable from a new sidebar nav entry.

**Architecture:** New routes `/manuscript` (`ManuscriptRoute`) and `/book/:bookId` (`BookRoute`). `BookRoute` toggles a **Write** view (binder + scene editor) and a **Grid** view (stubbed placeholder until Phase 4). All reads via `useLiveQuery`; all writes via the Phase 1 `manuscript.ts` CRUD. A new id-based `PagePicker` powers the POV/cast/location refs (Phase 1 scenes store page **ids**, so the title-based `RefField` is not a drop-in — `PagePicker` reuses RefField's CSS classes for a consistent look).

**Tech Stack:** React 19, react-router-dom (hash), dexie-react-hooks `useLiveQuery`, Vitest + @testing-library/react + happy-dom.

**Spec:** `docs/superpowers/specs/2026-07-02-manuscript-authoring-design.md`
**Depends on:** Phase 1 (data layer) — `manuscript.ts` CRUD, all merged.

## Global Constraints

- TypeScript `strict`; no `any`. No literal `Date.now()`/`Math.random()` in render (lint rule) — use `now()`/`uid()` from the db layer, already inside `manuscript.ts`.
- Do not mirror `useLiveQuery` into state via effects (lint `set-state-in-effect`); derive with `useMemo` (HomeRoute pattern).
- Component tests that use `useLiveQuery` MUST `afterEach(cleanup)` or teardown throws "window is not defined" (see repo convention).
- Reuse existing components/CSS: `LoreEditor`, RefField's `.ref-*` classes, sidebar `.nav-item`, route/card classes from `CategoryRoute`/`BrowseCard`.
- Run `npm run lint`, `npm run build`, `npm run test:run` green before the phase is done.

---

### Task 1: Sidebar nav entry + route registration (with placeholder routes)

**Files:**
- Modify: `src/components/Sidebar.tsx` (top-nav ~line 96-103)
- Modify: `src/App.tsx` (imports ~line 9-18; `<Routes>` ~line 74-84)
- Create: `src/routes/ManuscriptRoute.tsx` (placeholder)
- Create: `src/routes/BookRoute.tsx` (placeholder)
- Test: `src/routes/ManuscriptRoute.test.tsx`

**Interfaces:**
- Produces: routes `/manuscript` and `/book/:bookId`; a "Manuscript" nav link.

- [ ] **Step 1: Write the failing test**

Create `src/routes/ManuscriptRoute.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ManuscriptRoute from './ManuscriptRoute'

afterEach(cleanup)

describe('ManuscriptRoute', () => {
  it('renders the Manuscript heading', () => {
    render(
      <MemoryRouter>
        <ManuscriptRoute />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /manuscript/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/routes/ManuscriptRoute.test.tsx`
Expected: FAIL — cannot find `./ManuscriptRoute`.

- [ ] **Step 3: Create placeholder route components**

Create `src/routes/ManuscriptRoute.tsx`:

```tsx
export default function ManuscriptRoute() {
  return (
    <div className="manuscript-page">
      <h1 className="page-title">Manuscript</h1>
    </div>
  )
}
```

Create `src/routes/BookRoute.tsx`:

```tsx
import { useParams } from 'react-router-dom'

export default function BookRoute() {
  const { bookId } = useParams<{ bookId: string }>()
  return (
    <div className="book-workspace">
      <h1 className="page-title">Book {bookId}</h1>
    </div>
  )
}
```

- [ ] **Step 4: Register routes and nav**

In `src/App.tsx`, add imports after `SettingsRoute`:

```ts
import ManuscriptRoute from './routes/ManuscriptRoute'
import BookRoute from './routes/BookRoute'
```

Add routes inside `<Routes>` (after the `/settings` route):

```tsx
            <Route path="/manuscript" element={<ManuscriptRoute />} />
            <Route path="/book/:bookId" element={<BookRoute />} />
```

In `src/components/Sidebar.tsx`, add to `top-nav` (after the Timeline link):

```tsx
        <Link to="/manuscript" className={location.pathname.startsWith('/manuscript') || location.pathname.startsWith('/book/') ? 'nav-item active' : 'nav-item'}>Manuscript</Link>
```

- [ ] **Step 5: Run test + typecheck**

Run: `npm run test:run -- src/routes/ManuscriptRoute.test.tsx`
Expected: PASS.
Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx src/routes/ManuscriptRoute.tsx src/routes/BookRoute.tsx src/routes/ManuscriptRoute.test.tsx
git commit -m "feat(manuscript): sidebar nav + /manuscript and /book routes"
```

---

### Task 2: Books index — list, create, open

**Files:**
- Modify: `src/routes/ManuscriptRoute.tsx`
- Test: `src/routes/ManuscriptRoute.test.tsx` (extend)

**Interfaces:**
- Consumes: `db.books`, `listBooks`, `createBook`, `bookWordCount` from `../db`; `useLiveQuery`; `useNavigate`.
- Produces: a book-card grid; "＋ New book" creates a book and navigates to `/book/:id`.

- [ ] **Step 1: Write the failing test**

Extend `src/routes/ManuscriptRoute.test.tsx`:

```tsx
import { db } from '../db'

afterEach(async () => {
  cleanup()
  await Promise.all([db.books.clear(), db.chapters.clear(), db.scenes.clear()])
})

it('lists existing books', async () => {
  await db.books.add({ id: 'b1', title: 'The Long Road', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 })
  render(
    <MemoryRouter>
      <ManuscriptRoute />
    </MemoryRouter>,
  )
  expect(await screen.findByText('The Long Road')).toBeTruthy()
})

it('shows an empty hint when there are no books', async () => {
  render(
    <MemoryRouter>
      <ManuscriptRoute />
    </MemoryRouter>,
  )
  expect(await screen.findByText(/no books yet/i)).toBeTruthy()
})
```

(Replace the single `afterEach(cleanup)` with the async one above.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/routes/ManuscriptRoute.test.tsx`
Expected: FAIL — "The Long Road"/empty hint not found.

- [ ] **Step 3: Implement the books index**

Replace `src/routes/ManuscriptRoute.tsx`:

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db, createBook, type Book } from '../db'

const NO_BOOKS: Book[] = []

export default function ManuscriptRoute() {
  const navigate = useNavigate()
  const books = useLiveQuery(() => db.books.orderBy('order').toArray(), []) ?? NO_BOOKS

  async function handleNew() {
    const book = await createBook('Untitled Book')
    navigate(`/book/${book.id}`)
  }

  return (
    <div className="manuscript-page">
      <div className="manuscript-head">
        <h1 className="page-title">Manuscript</h1>
        <button className="primary-btn" onClick={handleNew}>＋ New book</button>
      </div>
      {books.length === 0 ? (
        <p className="empty-hint">No books yet. Start your first manuscript!</p>
      ) : (
        <div className="book-grid">
          {books.map((b) => (
            <Link key={b.id} to={`/book/${b.id}`} className="book-card">
              <span className="book-card-title">{b.title}</span>
              {b.synopsis && <span className="book-card-synopsis">{b.synopsis}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/routes/ManuscriptRoute.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/ManuscriptRoute.tsx src/routes/ManuscriptRoute.test.tsx
git commit -m "feat(manuscript): books index with create + open"
```

---

### Task 3: `PagePicker` — id-based wiki-page reference control

**Files:**
- Create: `src/components/PagePicker.tsx`
- Test: `src/components/PagePicker.test.tsx`

**Interfaces:**
- Consumes: `db.pages`, `categoryColor` from `../db`; `useLiveQuery`.
- Produces:
  ```ts
  interface PagePickerProps {
    value: string[]                 // selected page ids
    onChange: (ids: string[]) => void
    multiple?: boolean              // default true; false = single-select (POV)
    category?: string               // optional soft filter; absent = any page
    placeholder?: string
  }
  export default function PagePicker(props: PagePickerProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/PagePicker.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from '../db'
import PagePicker from './PagePicker'

afterEach(async () => {
  cleanup()
  await db.pages.clear()
})

async function seedPage(id: string, title: string, category = 'Character') {
  await db.pages.add({
    id, title, category, content: '', summary: '', tags: [],
    createdAt: 1, updatedAt: 1,
  } as never)
}

describe('PagePicker', () => {
  it('adds a page id when a suggestion is chosen', async () => {
    await seedPage('p1', 'Alice')
    const onChange = vi.fn()
    render(<PagePicker value={[]} onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ali' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Alice' }))
    expect(onChange).toHaveBeenCalledWith(['p1'])
  })

  it('renders selected ids as titled chips', async () => {
    await seedPage('p1', 'Alice')
    render(<PagePicker value={['p1']} onChange={() => {}} />)
    expect(await screen.findByText('Alice')).toBeTruthy()
  })

  it('single-select replaces the previous value', async () => {
    await seedPage('p1', 'Alice')
    await seedPage('p2', 'Bob')
    const onChange = vi.fn()
    render(<PagePicker value={['p1']} onChange={onChange} multiple={false} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bob' } })
    await waitFor(() => screen.getByRole('button', { name: 'Bob' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }))
    expect(onChange).toHaveBeenCalledWith(['p2'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/PagePicker.test.tsx`
Expected: FAIL — cannot find `./PagePicker`.

- [ ] **Step 3: Implement `PagePicker`**

Create `src/components/PagePicker.tsx`:

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, categoryColor, type LorePage } from '../db'

interface PagePickerProps {
  value: string[]
  onChange: (ids: string[]) => void
  multiple?: boolean
  category?: string
  placeholder?: string
}

const NO_PAGES: LorePage[] = []

/** Id-based wiki-page reference control. Mirrors RefField's look (.ref-* classes)
 *  but stores page ids (rename-safe) and can select any page type. */
export default function PagePicker({
  value, onChange, multiple = true, category, placeholder = 'Add page…',
}: PagePickerProps) {
  const [query, setQuery] = useState('')
  const pages = useLiveQuery(() => db.pages.orderBy('title').toArray(), []) ?? NO_PAGES
  const byId = new Map(pages.map((p) => [p.id, p]))
  const selected = new Set(value)

  const q = query.trim().toLowerCase()
  const matches = q
    ? pages
        .filter((p) => !selected.has(p.id) && p.title.toLowerCase().includes(q))
        .filter((p) => !category || p.category === category)
        .slice(0, 8)
    : []

  function add(id: string) {
    onChange(multiple ? [...value, id] : [id])
    setQuery('')
  }
  function remove(id: string) {
    onChange(value.filter((v) => v !== id))
  }

  return (
    <div className="ref-field">
      <div className="ref-chips">
        {value.map((id) => {
          const page = byId.get(id)
          return (
            <span key={id} className="ref-chip">
              <span className="dot" style={{ background: categoryColor(page?.category ?? '') }} />
              {page?.title ?? '(deleted)'}
              <button className="tag-x" title="Remove" onClick={() => remove(id)}>×</button>
            </span>
          )
        })}
      </div>
      <div className="ref-search">
        <input
          className="infobox-value-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {q && matches.length > 0 && (
          <div className="ref-results">
            {matches.map((p) => (
              <button key={p.id} className="ref-result" onClick={() => add(p.id)}>
                {p.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/PagePicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PagePicker.tsx src/components/PagePicker.test.tsx
git commit -m "feat(manuscript): id-based PagePicker for scene refs"
```

---

### Task 4: `BookRoute` shell — Write/Grid toggle + scene selection

**Files:**
- Modify: `src/routes/BookRoute.tsx`
- Create: `src/components/manuscript/BookWriteView.tsx` (placeholder body wired in Task 5-6)
- Test: `src/routes/BookRoute.test.tsx`

**Interfaces:**
- Consumes: `db.books`, `useParams`, `useSearchParams`.
- Produces: `BookRoute` with a segmented Write/Grid control; the selected scene id is read from `?scene=`; `BookWriteView` receives `{ bookId, selectedSceneId, onSelectScene }`.

- [ ] **Step 1: Write the failing test**

Create `src/routes/BookRoute.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db'
import BookRoute from './BookRoute'

afterEach(async () => {
  cleanup()
  await Promise.all([db.books.clear(), db.chapters.clear(), db.scenes.clear()])
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/book/:bookId" element={<BookRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BookRoute', () => {
  it('shows the book title and Write/Grid toggle', async () => {
    await db.books.add({ id: 'b1', title: 'My Novel', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 })
    renderAt('/book/b1')
    expect(await screen.findByText('My Novel')).toBeTruthy()
    expect(screen.getByRole('button', { name: /write/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /grid/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/routes/BookRoute.test.tsx`
Expected: FAIL — no Write/Grid buttons.

- [ ] **Step 3: Implement the shell + placeholder write view**

Create `src/components/manuscript/BookWriteView.tsx`:

```tsx
interface Props {
  bookId: string
  selectedSceneId: string | null
  onSelectScene: (id: string | null) => void
}

export default function BookWriteView(_props: Props) {
  return <div className="book-write" />
}
```

Replace `src/routes/BookRoute.tsx`:

```tsx
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import BookWriteView from '../components/manuscript/BookWriteView'

export default function BookRoute() {
  const { bookId } = useParams<{ bookId: string }>()
  const [view, setView] = useState<'write' | 'grid'>('write')
  const [searchParams, setSearchParams] = useSearchParams()
  const book = useLiveQuery(() => (bookId ? db.books.get(bookId) : undefined), [bookId])

  const selectedSceneId = searchParams.get('scene')
  function selectScene(id: string | null) {
    setSearchParams(id ? { scene: id } : {}, { replace: true })
  }

  if (!bookId) return null

  return (
    <div className="book-workspace">
      <div className="book-head">
        <h1 className="page-title">{book?.title ?? 'Book'}</h1>
        <div className="seg-control">
          <button className={view === 'write' ? 'seg active' : 'seg'} onClick={() => setView('write')}>Write</button>
          <button className={view === 'grid' ? 'seg active' : 'seg'} onClick={() => setView('grid')}>Grid</button>
        </div>
      </div>
      {view === 'write' ? (
        <BookWriteView bookId={bookId} selectedSceneId={selectedSceneId} onSelectScene={selectScene} />
      ) : (
        <div className="book-grid-view empty-hint">The plotline grid arrives in a later update.</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/routes/BookRoute.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/BookRoute.tsx src/components/manuscript/BookWriteView.tsx src/routes/BookRoute.test.tsx
git commit -m "feat(manuscript): book workspace shell with Write/Grid toggle"
```

---

### Task 5: `BinderTree` — chapters/scenes, create & select

**Files:**
- Create: `src/components/manuscript/BinderTree.tsx`
- Test: `src/components/manuscript/BinderTree.test.tsx`

**Interfaces:**
- Consumes: `db.chapters`, `db.scenes`, `createChapter`, `createScene`, `sceneStatusColor` from `../../db`; `useLiveQuery`.
- Produces:
  ```ts
  interface BinderTreeProps {
    bookId: string
    selectedSceneId: string | null
    onSelectScene: (id: string) => void
  }
  ```
  Renders chapters (each with its scenes), "＋ Chapter"/"＋ Scene" buttons; clicking a scene calls `onSelectScene`.

- [ ] **Step 1: Write the failing test**

Create `src/components/manuscript/BinderTree.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db, createChapter, createScene } from '../../db'
import BinderTree from './BinderTree'

afterEach(async () => {
  cleanup()
  await Promise.all([db.chapters.clear(), db.scenes.clear()])
})

describe('BinderTree', () => {
  it('renders chapters and their scenes', async () => {
    const ch = await createChapter('b1', 'Chapter One')
    await createScene('b1', ch.id, 'The Opening')
    render(<BinderTree bookId="b1" selectedSceneId={null} onSelectScene={() => {}} />)
    expect(await screen.findByText('Chapter One')).toBeTruthy()
    expect(await screen.findByText('The Opening')).toBeTruthy()
  })

  it('selects a scene on click', async () => {
    const ch = await createChapter('b1', 'Chapter One')
    const sc = await createScene('b1', ch.id, 'The Opening')
    const onSelect = vi.fn()
    render(<BinderTree bookId="b1" selectedSceneId={null} onSelectScene={onSelect} />)
    fireEvent.click(await screen.findByText('The Opening'))
    expect(onSelect).toHaveBeenCalledWith(sc.id)
  })

  it('adds a chapter via the button', async () => {
    render(<BinderTree bookId="b1" selectedSceneId={null} onSelectScene={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /chapter/i }))
    await waitFor(async () => expect(await db.chapters.where('bookId').equals('b1').count()).toBe(1))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/manuscript/BinderTree.test.tsx`
Expected: FAIL — cannot find `./BinderTree`.

- [ ] **Step 3: Implement `BinderTree`**

Create `src/components/manuscript/BinderTree.tsx`:

```tsx
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, createChapter, createScene, sceneStatusColor,
  type Chapter, type Scene,
} from '../../db'

interface BinderTreeProps {
  bookId: string
  selectedSceneId: string | null
  onSelectScene: (id: string) => void
}

const NO_CHAPTERS: Chapter[] = []
const NO_SCENES: Scene[] = []

export default function BinderTree({ bookId, selectedSceneId, onSelectScene }: BinderTreeProps) {
  const chapters = useLiveQuery(
    () => db.chapters.where('bookId').equals(bookId).sortBy('order'),
    [bookId],
  ) ?? NO_CHAPTERS
  const scenes = useLiveQuery(
    () => db.scenes.where('bookId').equals(bookId).sortBy('order'),
    [bookId],
  ) ?? NO_SCENES

  const scenesByChapter = useMemo(() => {
    const map = new Map<string, Scene[]>()
    for (const s of scenes) {
      const list = map.get(s.chapterId) ?? []
      list.push(s)
      map.set(s.chapterId, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order)
    return map
  }, [scenes])

  return (
    <div className="binder">
      {chapters.map((ch) => (
        <div key={ch.id} className="binder-chapter">
          <div className="binder-chapter-head">
            <span className="binder-chapter-title">{ch.title}</span>
            <button
              className="binder-add"
              title="Add scene"
              onClick={() => createScene(bookId, ch.id, 'New scene')}
            >＋ Scene</button>
          </div>
          {(scenesByChapter.get(ch.id) ?? []).map((sc) => (
            <button
              key={sc.id}
              className={sc.id === selectedSceneId ? 'binder-scene active' : 'binder-scene'}
              onClick={() => onSelectScene(sc.id)}
            >
              <span className="status-pip" style={{ background: sceneStatusColor(sc.status) }} />
              <span className="binder-scene-title">{sc.title}</span>
              <span className="binder-scene-words">{sc.wordCount || ''}</span>
            </button>
          ))}
        </div>
      ))}
      <button className="binder-add-chapter" onClick={() => createChapter(bookId, 'New chapter')}>
        ＋ Chapter
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/manuscript/BinderTree.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/manuscript/BinderTree.tsx src/components/manuscript/BinderTree.test.tsx
git commit -m "feat(manuscript): binder tree (chapters/scenes, create, select)"
```

---

### Task 6: `SceneMetaPanel` — status, goal, refs, synopsis, notes

**Files:**
- Create: `src/components/manuscript/SceneMetaPanel.tsx`
- Test: `src/components/manuscript/SceneMetaPanel.test.tsx`

**Interfaces:**
- Consumes: `updateScene`, `SCENE_STATUSES` from `../../db`; `PagePicker`; `Scene` type.
- Produces:
  ```ts
  interface SceneMetaPanelProps { scene: Scene }
  ```
  Edits `status`, `targetWordCount`, `povPageId`, `castPageIds`, `locationPageIds`, `synopsis`, `notes` — each change persists via `updateScene(scene.id, patch)`.

- [ ] **Step 1: Write the failing test**

Create `src/components/manuscript/SceneMetaPanel.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import type { Scene } from '../../db'
import SceneMetaPanel from './SceneMetaPanel'

const updateScene = vi.hoisted(() => vi.fn())
vi.mock('../../db', async (orig) => ({ ...(await orig()), updateScene }))

afterEach(() => { cleanup(); updateScene.mockClear() })

const scene: Scene = {
  id: 's1', bookId: 'b', chapterId: 'c', title: 'S', content: '', synopsis: '',
  notes: '', status: 'outline', order: 0, wordCount: 0, povPageId: null,
  castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: 1,
}

describe('SceneMetaPanel', () => {
  it('persists a status change', () => {
    render(<SceneMetaPanel scene={scene} />)
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'draft' } })
    expect(updateScene).toHaveBeenCalledWith('s1', { status: 'draft' })
  })

  it('persists a synopsis edit', () => {
    render(<SceneMetaPanel scene={scene} />)
    fireEvent.change(screen.getByLabelText(/synopsis/i), { target: { value: 'A duel at dawn' } })
    expect(updateScene).toHaveBeenCalledWith('s1', { synopsis: 'A duel at dawn' })
  })
}
)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/manuscript/SceneMetaPanel.test.tsx`
Expected: FAIL — cannot find `./SceneMetaPanel`.

- [ ] **Step 3: Implement `SceneMetaPanel`**

Create `src/components/manuscript/SceneMetaPanel.tsx`:

```tsx
import { updateScene, SCENE_STATUSES, type Scene, type SceneStatus } from '../../db'
import PagePicker from '../PagePicker'

export default function SceneMetaPanel({ scene }: { scene: Scene }) {
  return (
    <aside className="scene-meta">
      <label className="scene-meta-row">
        <span>Status</span>
        <select
          aria-label="Status"
          value={scene.status}
          onChange={(e) => updateScene(scene.id, { status: e.target.value as SceneStatus })}
        >
          {SCENE_STATUSES.map((s) => (
            <option key={s.name} value={s.name}>{s.label}</option>
          ))}
        </select>
      </label>

      <label className="scene-meta-row">
        <span>Word goal</span>
        <input
          type="number"
          min={0}
          value={scene.targetWordCount ?? ''}
          onChange={(e) =>
            updateScene(scene.id, {
              targetWordCount: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </label>

      <div className="scene-meta-row scene-meta-col">
        <span>POV</span>
        <PagePicker
          value={scene.povPageId ? [scene.povPageId] : []}
          multiple={false}
          placeholder="POV character…"
          onChange={(ids) => updateScene(scene.id, { povPageId: ids[0] ?? null })}
        />
      </div>

      <div className="scene-meta-row scene-meta-col">
        <span>Cast</span>
        <PagePicker
          value={scene.castPageIds}
          placeholder="Characters present…"
          onChange={(ids) => updateScene(scene.id, { castPageIds: ids })}
        />
      </div>

      <div className="scene-meta-row scene-meta-col">
        <span>Location</span>
        <PagePicker
          value={scene.locationPageIds}
          placeholder="Setting…"
          onChange={(ids) => updateScene(scene.id, { locationPageIds: ids })}
        />
      </div>

      <label className="scene-meta-row scene-meta-col">
        <span>Synopsis</span>
        <textarea
          aria-label="Synopsis"
          value={scene.synopsis}
          onChange={(e) => updateScene(scene.id, { synopsis: e.target.value })}
        />
      </label>

      <label className="scene-meta-row scene-meta-col">
        <span>Notes</span>
        <textarea
          aria-label="Notes"
          value={scene.notes}
          onChange={(e) => updateScene(scene.id, { notes: e.target.value })}
        />
      </label>
    </aside>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/manuscript/SceneMetaPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/manuscript/SceneMetaPanel.tsx src/components/manuscript/SceneMetaPanel.test.tsx
git commit -m "feat(manuscript): scene metadata panel (status, goal, refs, synopsis, notes)"
```

---

### Task 7: `SceneEditor` — prose editing via `LoreEditor` (debounced save)

**Files:**
- Create: `src/components/manuscript/SceneEditor.tsx`
- Test: `src/components/manuscript/SceneEditor.test.tsx`

**Interfaces:**
- Consumes: `updateScene`, `type Scene`; `LoreEditor`; `SceneMetaPanel`; `useNavigate`, `findPageIdByTitle`.
- Produces:
  ```ts
  interface SceneEditorProps { scene: Scene }
  ```
  Renders the scene title (editable), `LoreEditor` bound to `scene.content` (saves on change), and `SceneMetaPanel`. Wiki-link clicks navigate to the target page.

- [ ] **Step 1: Write the failing test**

Create `src/components/manuscript/SceneEditor.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Scene } from '../../db'
import SceneEditor from './SceneEditor'

const updateScene = vi.hoisted(() => vi.fn())
vi.mock('../../db', async (orig) => ({ ...(await orig()), updateScene }))
// LoreEditor is heavy (Tiptap); stub it to a textarea that calls onChange.
vi.mock('../LoreEditor', () => ({
  default: ({ content, onChange }: { content: string; onChange: (h: string) => void }) => (
    <textarea aria-label="Prose" value={content} onChange={(e) => onChange(e.target.value)} />
  ),
}))

afterEach(() => { cleanup(); updateScene.mockClear() })

const scene: Scene = {
  id: 's1', bookId: 'b', chapterId: 'c', title: 'Opening', content: '<p>hi</p>',
  synopsis: '', notes: '', status: 'outline', order: 0, wordCount: 1, povPageId: null,
  castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: 1,
}

describe('SceneEditor', () => {
  it('persists a title edit', () => {
    render(<MemoryRouter><SceneEditor scene={scene} /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/scene title/i), { target: { value: 'Prologue' } })
    expect(updateScene).toHaveBeenCalledWith('s1', { title: 'Prologue' })
  })

  it('persists a prose edit', () => {
    render(<MemoryRouter><SceneEditor scene={scene} /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/prose/i), { target: { value: '<p>new</p>' } })
    expect(updateScene).toHaveBeenCalledWith('s1', { content: '<p>new</p>' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/manuscript/SceneEditor.test.tsx`
Expected: FAIL — cannot find `./SceneEditor`.

- [ ] **Step 3: Implement `SceneEditor`**

Create `src/components/manuscript/SceneEditor.tsx`:

```tsx
import { useNavigate } from 'react-router-dom'
import { updateScene, findPageIdByTitle, type Scene } from '../../db'
import LoreEditor from '../LoreEditor'
import SceneMetaPanel from './SceneMetaPanel'

export default function SceneEditor({ scene }: { scene: Scene }) {
  const navigate = useNavigate()

  async function followWikiLink(title: string) {
    const id = await findPageIdByTitle(title)
    if (id) navigate(`/page/${id}`)
  }

  return (
    <div className="scene-editor">
      <div className="scene-editor-main">
        <input
          className="scene-title-input"
          aria-label="Scene title"
          value={scene.title}
          onChange={(e) => updateScene(scene.id, { title: e.target.value })}
        />
        <LoreEditor
          content={scene.content}
          editable
          onChange={(html) => updateScene(scene.id, { content: html })}
          onWikiClick={followWikiLink}
        />
      </div>
      <SceneMetaPanel scene={scene} />
    </div>
  )
}
```

Note: `updateScene` recomputes `wordCount` on every content write (Phase 1); no debounce is added here because `LoreEditor.onChange` already fires per-edit and Dexie writes are cheap/local — matching how `PageRoute` saves. If profiling later shows churn, add a debounce util then (YAGNI now).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/manuscript/SceneEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/manuscript/SceneEditor.tsx src/components/manuscript/SceneEditor.test.tsx
git commit -m "feat(manuscript): scene editor (LoreEditor + meta panel)"
```

---

### Task 8: Wire `BookWriteView` — binder + editor two-pane

**Files:**
- Modify: `src/components/manuscript/BookWriteView.tsx`
- Test: `src/components/manuscript/BookWriteView.test.tsx`

**Interfaces:**
- Consumes: `db.scenes`, `BinderTree`, `SceneEditor`; `useLiveQuery`.
- Produces: two-pane layout — `BinderTree` on the left, the selected `SceneEditor` (or an empty hint) on the right.

- [ ] **Step 1: Write the failing test**

Create `src/components/manuscript/BookWriteView.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, createChapter, createScene } from '../../db'
import BookWriteView from './BookWriteView'

// Stub LoreEditor (Tiptap) as in SceneEditor's test.
import { vi } from 'vitest'
vi.mock('../LoreEditor', () => ({
  default: ({ content }: { content: string }) => <div data-testid="prose">{content}</div>,
}))

afterEach(async () => {
  cleanup()
  await Promise.all([db.chapters.clear(), db.scenes.clear()])
})

describe('BookWriteView', () => {
  it('shows an empty hint when no scene is selected', async () => {
    render(
      <MemoryRouter>
        <BookWriteView bookId="b1" selectedSceneId={null} onSelectScene={() => {}} />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/select a scene/i)).toBeTruthy()
  })

  it('renders the selected scene editor', async () => {
    const ch = await createChapter('b1', 'Ch')
    const sc = await createScene('b1', ch.id, 'Opening')
    render(
      <MemoryRouter>
        <BookWriteView bookId="b1" selectedSceneId={sc.id} onSelectScene={() => {}} />
      </MemoryRouter>,
    )
    expect(await screen.findByDisplayValue('Opening')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/manuscript/BookWriteView.test.tsx`
Expected: FAIL — no empty hint / editor.

- [ ] **Step 3: Implement `BookWriteView`**

Replace `src/components/manuscript/BookWriteView.tsx`:

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import BinderTree from './BinderTree'
import SceneEditor from './SceneEditor'

interface Props {
  bookId: string
  selectedSceneId: string | null
  onSelectScene: (id: string | null) => void
}

export default function BookWriteView({ bookId, selectedSceneId, onSelectScene }: Props) {
  const scene = useLiveQuery(
    () => (selectedSceneId ? db.scenes.get(selectedSceneId) : undefined),
    [selectedSceneId],
  )

  return (
    <div className="book-write">
      <BinderTree bookId={bookId} selectedSceneId={selectedSceneId} onSelectScene={onSelectScene} />
      <div className="book-write-main">
        {scene ? (
          <SceneEditor key={scene.id} scene={scene} />
        ) : (
          <p className="empty-hint">Select a scene to start writing.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/manuscript/BookWriteView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/manuscript/BookWriteView.tsx src/components/manuscript/BookWriteView.test.tsx
git commit -m "feat(manuscript): wire binder + scene editor into the write view"
```

---

### Task 9: Book index polish — rename, delete, word-count/scene summary

**Files:**
- Modify: `src/routes/ManuscriptRoute.tsx`
- Test: `src/routes/ManuscriptRoute.test.tsx` (extend)

**Interfaces:**
- Consumes: `updateBook`, `deleteBook`, `db.scenes` for counts.
- Produces: each book card shows scene count + total words; a rename (inline) and delete (confirm) affordance.

- [ ] **Step 1: Write the failing test**

Extend `src/routes/ManuscriptRoute.test.tsx`:

```tsx
import { createBook, createChapter, createScene, updateScene } from '../db'

it('shows a book’s scene count and word total', async () => {
  const book = await createBook('Counted')
  const ch = await createChapter(book.id, 'C')
  const sc = await createScene(book.id, ch.id, 'S')
  await updateScene(sc.id, { content: '<p>one two three</p>' })
  render(<MemoryRouter><ManuscriptRoute /></MemoryRouter>)
  expect(await screen.findByText(/1 scene/i)).toBeTruthy()
  expect(await screen.findByText(/3 words/i)).toBeTruthy()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/routes/ManuscriptRoute.test.tsx`
Expected: FAIL — count/word text absent.

- [ ] **Step 3: Add the per-book summary line**

In `src/routes/ManuscriptRoute.tsx`, add a live scenes read and derive per-book stats, then render a stats line inside each `.book-card`:

```tsx
import { db, createBook, type Book, type Scene } from '../db'
// …
const NO_SCENES: Scene[] = []
// inside the component:
const scenes = useLiveQuery(() => db.scenes.toArray(), []) ?? NO_SCENES
const stats = useMemo(() => {
  const m = new Map<string, { count: number; words: number }>()
  for (const s of scenes) {
    const cur = m.get(s.bookId) ?? { count: 0, words: 0 }
    cur.count += 1
    cur.words += s.wordCount
    m.set(s.bookId, cur)
  }
  return m
}, [scenes])
```

Render inside the card (after the title/synopsis):

```tsx
              {(() => {
                const st = stats.get(b.id) ?? { count: 0, words: 0 }
                return (
                  <span className="book-card-stats">
                    {st.count} scene{st.count === 1 ? '' : 's'} · {st.words} words
                  </span>
                )
              })()}
```

Add `useMemo` to the React import.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/routes/ManuscriptRoute.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/ManuscriptRoute.tsx src/routes/ManuscriptRoute.test.tsx
git commit -m "feat(manuscript): per-book scene/word summary on the index"
```

---

### Task 10: Styles + full green gate + manual verification

**Files:**
- Modify: `src/index.css` (append a `/* Manuscript */` section)
- Verify only: lint, build, tests

**Interfaces:** none (styling + verification).

- [ ] **Step 1: Add styles**

Append a `/* Manuscript */` block to `src/index.css` styling the new class names introduced above (`.manuscript-page`, `.manuscript-head`, `.book-grid`, `.book-card`, `.book-card-title/synopsis/stats`, `.book-workspace`, `.book-head`, `.seg-control`/`.seg`, `.book-write`, `.book-write-main`, `.binder`, `.binder-chapter`, `.binder-chapter-head`, `.binder-scene`, `.scene-editor`, `.scene-editor-main`, `.scene-title-input`, `.scene-meta`, `.scene-meta-row`, `.scene-meta-col`). Follow the existing CSS variables and visual language (reuse `--accent`, `--panel`, `.page-aside` patterns). Keep the binder as a fixed-width left column and the editor fluid; make `.book-write` a two-column flex/grid.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Full test suite**

Run: `npm run test:run`
Expected: all pass.

- [ ] **Step 5: Manual verification (superpowers:verification-before-completion)**

Run `npm run dev`, then in the browser:
1. Sidebar → **Manuscript** → **＋ New book** → lands on `/book/:id`.
2. **＋ Chapter**, **＋ Scene**, select the scene, type prose, set status/POV/cast/location/synopsis.
3. Reload the page — content persists (IndexedDB).
4. Open a POV character's wiki page — (Phase 3 will add "Appears in"; for now just confirm the ref saved).
5. Settings → export a backup, confirm it includes the book/scenes (counts line shows books/scenes).

- [ ] **Step 6: Commit**

```bash
git add src/index.css
git commit -m "feat(manuscript): styles for manuscript workspace; phase 2 green"
```

---

## Self-Review

**Spec coverage (Phase 2 scope):**
- Sidebar "Manuscript" nav + `/manuscript` + `/book/:bookId` → Tasks 1, 4. ✓
- Books index (create/open/rename-delete-summary) → Tasks 2, 9. ✓
- Write view two-pane (binder + editor) → Tasks 5, 7, 8. ✓
- Scene editor reuses `LoreEditor` → Task 7. ✓
- Scene meta: status, goal, POV/cast/location, synopsis, notes → Task 6. ✓
- Scene selection via `?scene=` deep-link → Task 4. ✓
- Grid view placeholder (real grid is Phase 4) → Task 4. ✓
- Styles → Task 10. ✓

**Deviation from spec, noted:** spec said "POV/cast/location via the existing RefField." RefField is title-based and category-scoped; Phase 1 scenes store page **ids** (rename-safe) and refs may be any page type. So Task 3 builds a small id-based `PagePicker` reusing RefField's CSS instead. This better matches the data model; flagged here rather than silently diverging.

**Deferred (correctly out of Phase 2):** "Appears in" backlinks (Phase 3), plotline grid (Phase 4), structure track (Phase 5), export (Phase 6), drag-reorder of binder items (start with buttons/click; add DnD when the grid lands, to share one DnD approach).

**Placeholder scan:** no TBD/TODO; each code step shows complete code. Task 10 Step 1 describes CSS by class list rather than full rules — intentional (visual polish, not logic; exact values are a styling judgment against existing tokens). ✓

**Type consistency:** `onSelectScene` signature is `(id: string) => void` in `BinderTree` but `(id: string | null) => void` in `BookWriteView`/`BookRoute`; `BinderTree` only ever calls it with a string, which is assignable to the wider type — no conflict. `PagePicker` value is `string[]` everywhere; POV adapts via `[id]`/`ids[0] ?? null`. `updateScene` patch shapes match Phase 1's `Partial<Omit<Scene,'id'|'bookId'|'createdAt'>>`. ✓
