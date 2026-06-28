# Sidebar Tags Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every tag discoverable via a collapsible "Tags" group in the left sidebar, ordered most-used first.

**Architecture:** A pure `tagCounts(pages)` helper aggregates and sorts tags; the Sidebar renders them as a collapsible `page-group` (reusing the existing group/collapse machinery) of links to `/tag/:tag`. No new persistence beyond a collapse sentinel.

**Tech Stack:** React 19 + TypeScript (strict), Dexie `useLiveQuery`, Vitest + happy-dom + @testing-library/react.

## Global Constraints

- TypeScript `strict` — no `any`, no non-null hacks beyond existing patterns.
- All three of `npm run lint`, `npm run build`, `npm run test:run` must pass before done (CI gate).
- `useLiveQuery` component tests MUST `afterEach(cleanup)` or teardown throws "window is not defined".
- No literal `Date.now()`/`Math.random()` in component render (react-hooks/purity).
- Import data-layer symbols from `'../db'` (barrel), per repo convention.

---

### Task 1: Pure `tagCounts` helper

**Files:**
- Create: `src/tags.ts`
- Test: `src/tags.test.ts`

**Interfaces:**
- Consumes: `LorePage` from `'./db'`.
- Produces: `tagCounts(pages: LorePage[]): { tag: string; count: number }[]` — entries sorted by `count` desc, ties by `localeCompare` (A–Z).

- [ ] **Step 1: Write the failing test**

Create `src/tags.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { tagCounts } from './tags'
import type { LorePage } from './db'

function page(tags: string[]): LorePage {
  return {
    id: 'p', title: 't', category: 'Character', content: '', summary: '',
    status: 'Draft', tags, infobox: undefined, createdAt: 0, updatedAt: 0,
  }
}

describe('tagCounts', () => {
  it('returns an empty array for no pages', () => {
    expect(tagCounts([])).toEqual([])
  })

  it('tallies a tag across pages and dedupes', () => {
    const result = tagCounts([page(['magic']), page(['magic', 'lore']), page(['lore'])])
    expect(result).toEqual([
      { tag: 'lore', count: 2 },
      { tag: 'magic', count: 2 },
    ])
  })

  it('orders by count descending, then alphabetically', () => {
    const result = tagCounts([page(['magic']), page(['magic']), page(['lore'])])
    expect(result).toEqual([
      { tag: 'magic', count: 2 },
      { tag: 'lore', count: 1 },
    ])
  })

  it('breaks count ties alphabetically', () => {
    expect(tagCounts([page(['zebra', 'apple'])])).toEqual([
      { tag: 'apple', count: 1 },
      { tag: 'zebra', count: 1 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/tags.test.ts`
Expected: FAIL — cannot resolve `./tags` / `tagCounts is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/tags.ts`:

```ts
import type { LorePage } from './db'

/** Aggregate every page's tags into { tag, count } entries, most-used first
 *  (ties broken alphabetically). Pure — no React/Dexie — so the ordering is
 *  unit-testable on its own, mirroring toc.ts / autolink.ts. */
export function tagCounts(pages: LorePage[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of pages) {
    for (const tag of p.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/tags.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tags.ts src/tags.test.ts
git commit -m "feat: tagCounts helper aggregates tags by frequency (#103)"
```

---

### Task 2: Sidebar Tags group + collapse sentinel + styling

**Files:**
- Modify: `src/sidebarPrefs.ts` (add `TAGS_GROUP` sentinel)
- Modify: `src/components/Sidebar.tsx` (compute + render the group)
- Modify: `src/index.css` (add `.tag-link` rules)
- Test: `src/components/Sidebar.test.tsx` (create)

**Interfaces:**
- Consumes: `tagCounts` from `'../tags'`; `TAGS_GROUP` from `'../sidebarPrefs'`; existing `toggle`/`collapsed` state in Sidebar.
- Produces: a `<Link>` per tag → `/tag/${encodeURIComponent(tag)}` with class `tag-link` (`active` on the current tag), shown only when `tags.length > 0`.

- [ ] **Step 1: Write the failing test**

Create `src/components/Sidebar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, createPage } from '../db'
import Sidebar from './Sidebar'

afterEach(cleanup)

function renderSidebar(path = '/home') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar onOpenSearch={() => {}} />
    </MemoryRouter>,
  )
}

describe('Sidebar tags group', () => {
  beforeEach(async () => {
    await db.pages.clear()
  })

  it('lists tags with counts linking to the tag route', async () => {
    await createPage({ title: 'Fireball', tags: ['magic'] })
    await createPage({ title: 'Wizard Tower', tags: ['magic', 'places'] })

    renderSidebar()

    const link = await screen.findByRole('link', { name: /#magic/ })
    expect(link.getAttribute('href')).toBe('/tag/magic')
    expect(link.textContent).toContain('2') // magic is on 2 pages
  })

  it('omits the tags group when no page has tags', async () => {
    await createPage({ title: 'Untagged' })

    renderSidebar()

    await screen.findByText('Untagged') // wait for the page list to load
    expect(screen.queryByText('Tags')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/Sidebar.test.tsx`
Expected: FAIL — no `#magic` link found (group not rendered yet).

- [ ] **Step 3: Add the collapse sentinel**

In `src/sidebarPrefs.ts`, below the existing `RECENT_GROUP` line, add:

```ts
export const TAGS_GROUP = '__tags__'
```

- [ ] **Step 4: Wire the group into the Sidebar**

In `src/components/Sidebar.tsx`:

(a) Add imports — `tagCounts` and `TAGS_GROUP`:

```ts
import { tagCounts } from '../tags'
```

and extend the existing sidebarPrefs import to include `TAGS_GROUP`:

```ts
import { getCollapsedGroups, toggleCollapsedGroup, RECENT_GROUP, TAGS_GROUP } from '../sidebarPrefs'
```

(b) After the `grouped` `useMemo` block, add:

```ts
  const tags = useMemo(() => tagCounts(pages), [pages])
```

(c) Next to the existing `browseCategory` derivation, add:

```ts
  const currentTag = location.pathname.startsWith('/tag/')
    ? decodeURIComponent(location.pathname.split('/tag/')[1])
    : null
```

(d) Inside `<div className="page-list">`, immediately after the category
`{grouped.map(...)}` block and before the closing `</div>`, add:

```tsx
        {tags.length > 0 && (
          <div className="page-group">
            <div className="group-head">
              <button
                className="group-toggle"
                aria-expanded={!collapsed.has(TAGS_GROUP)}
                onClick={() => toggle(TAGS_GROUP)}
              >
                {collapsed.has(TAGS_GROUP) ? '▸' : '▾'}
              </button>
              <span className="group-label group-label-static">Tags</span>
            </div>
            {!collapsed.has(TAGS_GROUP) &&
              tags.map(({ tag, count }) => (
                <Link
                  key={tag}
                  to={`/tag/${encodeURIComponent(tag)}`}
                  className={currentTag === tag ? 'tag-link active' : 'tag-link'}
                >
                  <span className="tag-link-name">#{tag}</span>
                  <span className="group-count">{count}</span>
                </Link>
              ))}
          </div>
        )}
```

- [ ] **Step 5: Add the styling**

In `src/index.css`, immediately after the `.page-link.active { … }` rule block
(around line 186), add:

```css
.tag-link {
  display: flex; align-items: center; gap: 6px; padding: 5px 9px; border-radius: 7px;
  color: var(--ink-dim); font-size: 13px;
  transition: background 0.12s, color 0.12s, transform 0.12s;
}
.tag-link:hover { background: var(--panel); color: var(--ink); transform: translateX(2px); }
.tag-link.active {
  background: var(--panel-2); color: var(--ink);
  box-shadow: inset 2px 0 0 var(--accent), 0 0 0 1px var(--accent-glow);
}
.tag-link-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:run -- src/components/Sidebar.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Full verification (CI gate)**

Run: `npm run lint && npm run build && npm run test:run`
Expected: lint clean, build succeeds, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/sidebarPrefs.ts src/components/Sidebar.tsx src/index.css src/components/Sidebar.test.tsx
git commit -m "feat: collapsible Tags group in the sidebar (#103)"
```

---

## Self-Review

**Spec coverage:**
- `src/tags.ts` pure helper, count-desc-then-A–Z → Task 1. ✓
- `TAGS_GROUP` sentinel in sidebarPrefs → Task 2 Step 3. ✓
- Sidebar group below categories, count pill, `/tag/:tag` links, active state, only when tags exist → Task 2 Step 4. ✓
- `.tag-link` styling reusing group structure → Task 2 Step 5. ✓
- `tags.test.ts` (ordering/dedupe/empty) + Sidebar render test (link+count, absent when empty) → Task 1 / Task 2. ✓
- Non-goals (Home cloud, tag editing/merging) — not in any task. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `tagCounts(pages: LorePage[]) → { tag; count }[]` defined in Task 1 and consumed verbatim in Task 2. `TAGS_GROUP` string constant consistent across sidebarPrefs and Sidebar.
