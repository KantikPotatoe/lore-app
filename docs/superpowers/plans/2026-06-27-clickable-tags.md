# Clickable Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `#tag` pills on a page clickable, opening a dedicated `/tag/:tag` view that lists every page carrying that tag.

**Architecture:** Extract the shared `browse-card` markup into a `BrowseCard` component used by both `CategoryRoute` and the new `TagRoute`. `TagRoute` mirrors the `CategoryRoute` card-grid, querying pages with an in-memory `filter` (tags aren't indexed). View-mode tag pills in `PageRoute` become `<Link>`s to `/tag/<tag>`; edit-mode pills stay as removable spans.

**Tech Stack:** React, react-router-dom (`<Routes>`, `<Link>`, `useParams`), Dexie + `useLiveQuery`, Vitest + @testing-library/react + MemoryRouter.

## Global Constraints

- TypeScript `strict` — no `any`, no unused vars.
- Reuse existing `.browse-*` CSS classes; add CSS only for the anchor-pill reset.
- Tests use happy-dom; `useLiveQuery` components require `afterEach(cleanup)` or teardown throws "window is not defined".
- Run `npm run lint`, `npm run build`, and `npm run test:run` before claiming done (CI runs all three).
- Commit after each task; do not push (user pushes manually).

---

### Task 1: Extract a shared `BrowseCard` component

Pull the page-card markup currently inline in `CategoryRoute` into a reusable
`BrowseCard`, and refactor `CategoryRoute` to use it. Pure refactor — no
behavior change. Each card computes its own category color from `page.category`
(equivalent for `CategoryRoute`, where every page shares the route's category,
and correct for the mixed-category `TagRoute` to come).

**Files:**
- Create: `src/components/BrowseCard.tsx`
- Create: `src/components/BrowseCard.test.tsx`
- Modify: `src/routes/CategoryRoute.tsx` (replace inline card with `<BrowseCard>`)

**Interfaces:**
- Consumes: `categoryColor`, `statusColor`, `pageStatus`, `type LorePage` from `'../db'`; `Link` from `'react-router-dom'`.
- Produces: `export default function BrowseCard({ page }: { page: LorePage })` — renders a `<Link to={`/page/${page.id}`} className="browse-card">…`.

- [ ] **Step 1: Write the failing test**

Create `src/components/BrowseCard.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BrowseCard from './BrowseCard'
import type { LorePage } from '../db'

afterEach(cleanup)

function makePage(over: Partial<LorePage> = {}): LorePage {
  return {
    id: 'p1', title: 'Fireball', category: 'Spell', content: '', summary: 'A fiery blast',
    status: 'Draft', tags: [], infobox: undefined, createdAt: 0, updatedAt: 0, ...over,
  }
}

describe('BrowseCard', () => {
  it('links to the page and shows its name, summary, and status', () => {
    render(<MemoryRouter><BrowseCard page={makePage()} /></MemoryRouter>)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/page/p1')
    expect(screen.getByText('Fireball')).toBeTruthy()
    expect(screen.getByText('A fiery blast')).toBeTruthy()
    expect(screen.getByText('Draft')).toBeTruthy()
  })

  it('falls back to a placeholder initial when there is no infobox image', () => {
    render(<MemoryRouter><BrowseCard page={makePage({ title: 'Zephyr' })} /></MemoryRouter>)
    expect(screen.getByText('Z')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/BrowseCard.test.tsx`
Expected: FAIL — `Cannot find module './BrowseCard'`.

- [ ] **Step 3: Create the BrowseCard component**

Create `src/components/BrowseCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { categoryColor, statusColor, pageStatus, type LorePage } from '../db'

export default function BrowseCard({ page }: { page: LorePage }) {
  const color = categoryColor(page.category)
  return (
    <Link to={`/page/${page.id}`} className="browse-card">
      <div className="browse-card-img">
        {page.infobox?.image ? (
          <img src={page.infobox.image} alt={page.title} />
        ) : (
          <div className="browse-card-placeholder" style={{ background: color + '33' }}>
            <span style={{ color }}>{page.title.charAt(0).toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className="browse-card-body">
        <div className="browse-card-name">{page.title}</div>
        {page.summary && <div className="browse-card-summary">{page.summary}</div>}
        <span
          className="browse-card-status"
          style={{ borderColor: statusColor(pageStatus(page)), color: statusColor(pageStatus(page)) }}
        >
          {pageStatus(page)}
        </span>
      </div>
    </Link>
  )
}
```

- [ ] **Step 4: Refactor `CategoryRoute` to use `BrowseCard`**

In `src/routes/CategoryRoute.tsx`, add the import:

```tsx
import BrowseCard from '../components/BrowseCard'
```

Replace the entire `pages.map(...)` block (the `<Link key={page.id} … className="browse-card">…</Link>` JSX) with:

```tsx
          {pages.map((page) => (
            <BrowseCard key={page.id} page={page} />
          ))}
```

Then remove now-unused imports from `CategoryRoute.tsx`: `Link` (from react-router-dom — keep `useNavigate`, `useParams`), and `statusColor`/`pageStatus` (from `'../db'`). Keep `categoryColor` (still used for the header color) and `createPage`/`db`.

- [ ] **Step 5: Run tests, lint, and build**

Run: `npm run test:run -- src/components/BrowseCard.test.tsx && npm run lint && npm run build`
Expected: BrowseCard tests PASS; lint clean (no unused-import errors); build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/BrowseCard.tsx src/components/BrowseCard.test.tsx src/routes/CategoryRoute.tsx
git commit -m "refactor: extract shared BrowseCard from CategoryRoute (#80)"
```

---

### Task 2: TagRoute component, route, and tests

**Files:**
- Create: `src/routes/TagRoute.tsx`
- Create: `src/routes/TagRoute.test.tsx`
- Modify: `src/App.tsx` (add the route + import)

**Interfaces:**
- Consumes: `BrowseCard` from `'../components/BrowseCard'` (Task 1); `db` from `'../db'`; `EmptyState` from `'../components/EmptyState'`.
- Produces: `export default function TagRoute()` mounted at `path="/tag/:tag"`.

- [ ] **Step 1: Write the failing test**

Create `src/routes/TagRoute.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db, createPage } from '../db'
import TagRoute from './TagRoute'

afterEach(cleanup)

function renderAt(tag: string) {
  return render(
    <MemoryRouter initialEntries={[`/tag/${tag}`]}>
      <Routes>
        <Route path="/tag/:tag" element={<TagRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TagRoute', () => {
  beforeEach(async () => {
    await db.pages.clear()
  })

  it('lists pages carrying the tag and excludes others', async () => {
    await createPage({ title: 'Fireball', tags: ['magic'] })
    await createPage({ title: 'Wizard Tower', tags: ['magic', 'places'] })
    await createPage({ title: 'Tavern', tags: ['places'] })

    renderAt('magic')

    expect(await screen.findByText('Fireball')).toBeTruthy()
    expect(screen.getByText('Wizard Tower')).toBeTruthy()
    expect(screen.queryByText('Tavern')).toBeNull()
  })

  it('shows the empty state for a tag no page uses', async () => {
    await createPage({ title: 'Fireball', tags: ['magic'] })

    renderAt('nonexistent')

    expect(await screen.findByText(/no pages tagged/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/routes/TagRoute.test.tsx`
Expected: FAIL — `Cannot find module './TagRoute'` (component doesn't exist yet).

- [ ] **Step 3: Create the TagRoute component**

Create `src/routes/TagRoute.tsx`:

```tsx
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import BrowseCard from '../components/BrowseCard'
import EmptyState from '../components/EmptyState'

const NO_PAGES: import('../db').LorePage[] = []

export default function TagRoute() {
  const { tag = '' } = useParams<{ tag: string }>()

  const pages =
    useLiveQuery(
      () => db.pages.filter((p) => p.tags.includes(tag)).sortBy('title'),
      [tag],
    ) ?? NO_PAGES

  return (
    <div className="browse-route">
      <div className="browse-header">
        <h1 className="browse-title">
          #{tag}
          <span className="browse-count">{pages.length}</span>
        </h1>
      </div>

      {pages.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title={`No pages tagged #${tag}`}
          message="Add this tag to a page to see it listed here."
        />
      ) : (
        <div className="browse-grid">
          {pages.map((page) => (
            <BrowseCard key={page.id} page={page} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Register the route in `src/App.tsx`**

Add the import alongside the other route imports (near `import CategoryRoute from './routes/CategoryRoute'`):

```tsx
import TagRoute from './routes/TagRoute'
```

Add the route inside `<Routes>`, after the `/browse/:category` route:

```tsx
<Route path="/tag/:tag" element={<TagRoute />} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:run -- src/routes/TagRoute.test.tsx`
Expected: PASS — both tests green.

- [ ] **Step 6: Commit**

```bash
git add src/routes/TagRoute.tsx src/routes/TagRoute.test.tsx src/App.tsx
git commit -m "feat: add /tag/:tag route listing pages by tag (#80)"
```

---

### Task 3: Make view-mode tag pills clickable

**Files:**
- Modify: `src/routes/PageRoute.tsx` (import `Link`; change the tags `.map`)
- Modify: `src/index.css` (anchor-pill style reset)

**Interfaces:**
- Consumes: `TagRoute` mounted at `/tag/:tag` (Task 1).
- Produces: no new exports — wiring only.

- [ ] **Step 1: Add `Link` to the react-router import in `src/routes/PageRoute.tsx`**

Change line 2 from:

```tsx
import { useParams, useNavigate } from 'react-router-dom'
```

to:

```tsx
import { useParams, useNavigate, Link } from 'react-router-dom'
```

- [ ] **Step 2: Make view-mode pills into links**

Replace the tags `.map` block (currently around `src/routes/PageRoute.tsx:220-225`):

```tsx
          {page.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
              {editing && <button className="tag-x" onClick={() => removeTag(t)}>×</button>}
            </span>
          ))}
```

with:

```tsx
          {page.tags.map((t) =>
            editing ? (
              <span key={t} className="tag">
                #{t}
                <button className="tag-x" onClick={() => removeTag(t)}>×</button>
              </span>
            ) : (
              <Link key={t} to={`/tag/${encodeURIComponent(t)}`} className="tag">
                #{t}
              </Link>
            ),
          )}
```

- [ ] **Step 3: Add the anchor-pill style reset in `src/index.css`**

After the `.tag-input` rule (around `src/index.css:385`), add:

```css
a.tag { text-decoration: none; cursor: pointer; transition: border-color 0.12s, color 0.12s; }
a.tag:hover { border-color: var(--accent); color: var(--ink); }
```

- [ ] **Step 4: Verify the full suite, lint, and build pass**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all green — no type/lint errors; existing PageRoute behavior unchanged in edit mode; new link present in view mode.

- [ ] **Step 5: Commit**

```bash
git add src/routes/PageRoute.tsx src/index.css
git commit -m "feat: link view-mode tag pills to their /tag page (#80)"
```

---

## Notes for the implementer

- **Why `filter` not `where`:** `tags` is a `string[]` with no Dexie index, so `.where('tags')` isn't available. `db.pages.filter((p) => p.tags.includes(tag)).sortBy('title')` runs in memory — fine at this app's scale. A `*tags` multiEntry index is a deliberate future optimization, out of scope here.
- **Why the edit/view split:** in edit mode each pill carries an `×` remove button; turning it into a navigating link there would fight that interaction. Links are view-mode only.
- **`encodeURIComponent`:** tags may contain spaces; encode when building the URL. react-router decodes `:tag` automatically via `useParams`.
- **No "+ New" button** on `TagRoute` (unlike `CategoryRoute`) — you don't create a page *into* a tag.
