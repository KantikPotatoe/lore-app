# Visual Phase 1 — Navigation & Wayfinding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lore Codex easier to navigate — route fade transitions, a page breadcrumb, collapsible per-world sidebar groups, a recently-viewed list, scroll reset, and a back-to-top button.

**Architecture:** Two new React-free localStorage helpers (`recents.ts`, `sidebarPrefs.ts`), both per-world keyed, unit-tested in isolation. A presentational `Breadcrumb` component. Wiring into the three existing shell files (`App.tsx`, `Sidebar.tsx`, `PageRoute.tsx`) plus additive CSS. Everything rides the existing CSS-variable theme; no new dependencies.

**Tech Stack:** React 18 + TypeScript (strict), react-router-dom (hash routing), Dexie/`useLiveQuery`, Vitest + happy-dom.

## Global Constraints

- TypeScript is `strict` — no `any` leaks, handle `undefined`.
- No literal `Date.now()` / `Math.random()` in React render bodies (react-hooks/purity lint rule). Not needed here, but keep clear.
- Per-world data is keyed by `currentLoreId()` (from `src/lores.ts`); localStorage keys follow `lore:<loreId>:<name>`.
- Reduced motion is already handled globally in `src/index.css` (`@media (prefers-reduced-motion: reduce)` zeroes animation/transition/scroll). New animations need no per-rule guard.
- Run `npm run lint && npm run build && npm run test:run` before claiming done; all green.
- Commit messages end with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 1: Recents store — `src/recents.ts`

Per-world recently-viewed page-id list in localStorage: prepend, dedupe, cap at 6, prune unknown ids. React-free pure functions (mirrors `src/storageError.ts` / `src/wikiLinkHover.ts` style).

**Files:**
- Create: `src/recents.ts`
- Test: `src/recents.test.ts`

**Interfaces:**
- Consumes: `currentLoreId()` from `./lores` (returns `string`).
- Produces:
  - `getRecent(loreId?: string): string[]` — most-recent-first ids.
  - `recordRecent(id: string, loreId?: string): string[]` — prepend+dedupe+cap, returns new list.
  - `pruneRecent(known: Set<string>, loreId?: string): string[]` — drop ids not in `known`, returns new list.

- [ ] **Step 1: Write the failing tests**

```ts
// src/recents.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { getRecent, recordRecent, pruneRecent } from './recents'

const L = 'test-lore'

beforeEach(() => localStorage.clear())

describe('recents', () => {
  it('starts empty', () => {
    expect(getRecent(L)).toEqual([])
  })

  it('prepends most-recent-first', () => {
    recordRecent('a', L)
    recordRecent('b', L)
    expect(getRecent(L)).toEqual(['b', 'a'])
  })

  it('dedupes — re-visiting moves an id to the front', () => {
    recordRecent('a', L)
    recordRecent('b', L)
    recordRecent('a', L)
    expect(getRecent(L)).toEqual(['a', 'b'])
  })

  it('caps the list at 6', () => {
    for (const id of ['1', '2', '3', '4', '5', '6', '7']) recordRecent(id, L)
    expect(getRecent(L)).toEqual(['7', '6', '5', '4', '3', '2'])
  })

  it('is scoped per world', () => {
    recordRecent('a', 'world-1')
    recordRecent('b', 'world-2')
    expect(getRecent('world-1')).toEqual(['a'])
    expect(getRecent('world-2')).toEqual(['b'])
  })

  it('prunes ids not in the known set', () => {
    recordRecent('a', L)
    recordRecent('b', L)
    recordRecent('c', L)
    expect(pruneRecent(new Set(['a', 'c']), L)).toEqual(['c', 'a'])
    expect(getRecent(L)).toEqual(['c', 'a'])
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('lore:test-lore:recentPages', '{not json')
    expect(getRecent(L)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/recents.test.ts`
Expected: FAIL — `Cannot find module './recents'`.

- [ ] **Step 3: Implement `src/recents.ts`**

```ts
import { currentLoreId } from './lores'

const CAP = 6
const keyFor = (loreId: string) => `lore:${loreId}:recentPages`

function read(loreId: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(loreId))
    const arr: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function write(loreId: string, ids: string[]): string[] {
  try {
    localStorage.setItem(keyFor(loreId), JSON.stringify(ids))
  } catch {
    // recents are non-critical — ignore quota/serialisation failures
  }
  return ids
}

export function getRecent(loreId: string = currentLoreId()): string[] {
  return read(loreId)
}

export function recordRecent(id: string, loreId: string = currentLoreId()): string[] {
  return write(loreId, [id, ...read(loreId).filter((x) => x !== id)].slice(0, CAP))
}

export function pruneRecent(known: Set<string>, loreId: string = currentLoreId()): string[] {
  return write(loreId, read(loreId).filter((id) => known.has(id)))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/recents.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/recents.ts src/recents.test.ts
git commit -m "feat(nav): per-world recently-viewed store (#68)"
```

---

### Task 2: Sidebar collapse prefs — `src/sidebarPrefs.ts`

Per-world set of collapsed sidebar group names in localStorage. Default empty (all open). The RECENT section uses the reserved name `__recent__`.

**Files:**
- Create: `src/sidebarPrefs.ts`
- Test: `src/sidebarPrefs.test.ts`

**Interfaces:**
- Consumes: `currentLoreId()` from `./lores`.
- Produces:
  - `getCollapsedGroups(loreId?: string): string[]` — collapsed group names.
  - `toggleCollapsedGroup(name: string, loreId?: string): string[]` — flip membership, returns new list.
  - `RECENT_GROUP = '__recent__'` — reserved name for the recents section.

- [ ] **Step 1: Write the failing tests**

```ts
// src/sidebarPrefs.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { getCollapsedGroups, toggleCollapsedGroup, RECENT_GROUP } from './sidebarPrefs'

const L = 'test-lore'

beforeEach(() => localStorage.clear())

describe('sidebarPrefs', () => {
  it('defaults to all-open (empty)', () => {
    expect(getCollapsedGroups(L)).toEqual([])
  })

  it('toggles a group collapsed then open', () => {
    expect(toggleCollapsedGroup('Characters', L)).toEqual(['Characters'])
    expect(getCollapsedGroups(L)).toEqual(['Characters'])
    expect(toggleCollapsedGroup('Characters', L)).toEqual([])
    expect(getCollapsedGroups(L)).toEqual([])
  })

  it('is scoped per world', () => {
    toggleCollapsedGroup('Places', 'world-1')
    expect(getCollapsedGroups('world-1')).toEqual(['Places'])
    expect(getCollapsedGroups('world-2')).toEqual([])
  })

  it('supports the reserved recent-section name', () => {
    toggleCollapsedGroup(RECENT_GROUP, L)
    expect(getCollapsedGroups(L)).toEqual(['__recent__'])
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('lore:test-lore:collapsedGroups', 'nope')
    expect(getCollapsedGroups(L)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sidebarPrefs.test.ts`
Expected: FAIL — `Cannot find module './sidebarPrefs'`.

- [ ] **Step 3: Implement `src/sidebarPrefs.ts`**

```ts
import { currentLoreId } from './lores'

export const RECENT_GROUP = '__recent__'

const keyFor = (loreId: string) => `lore:${loreId}:collapsedGroups`

function read(loreId: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(loreId))
    const arr: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function getCollapsedGroups(loreId: string = currentLoreId()): string[] {
  return read(loreId)
}

export function toggleCollapsedGroup(name: string, loreId: string = currentLoreId()): string[] {
  const cur = read(loreId)
  const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]
  try {
    localStorage.setItem(keyFor(loreId), JSON.stringify(next))
  } catch {
    // non-critical — ignore
  }
  return next
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sidebarPrefs.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sidebarPrefs.ts src/sidebarPrefs.test.ts
git commit -m "feat(nav): per-world sidebar group collapse prefs (#68)"
```

---

### Task 3: Breadcrumb component + PageRoute wiring

A `Category › Title` breadcrumb atop the page header, and recording each viewed page into recents.

**Files:**
- Create: `src/components/Breadcrumb.tsx`
- Modify: `src/routes/PageRoute.tsx` (imports, recents effect, render breadcrumb)
- Modify: `src/index.css` (breadcrumb styles)

**Interfaces:**
- Consumes: `recordRecent` (Task 1); `categoryColor` (existing, from `../db`).
- Produces: `<Breadcrumb category={string} title={string} color={string} />`.

- [ ] **Step 1: Create `src/components/Breadcrumb.tsx`**

```tsx
import { Link } from 'react-router-dom'

export default function Breadcrumb({
  category,
  title,
  color,
}: {
  category: string
  title: string
  color: string
}) {
  return (
    <nav className="page-breadcrumb" aria-label="Breadcrumb">
      <Link
        to={`/browse/${encodeURIComponent(category)}`}
        className="page-crumb-link"
        style={{ color }}
      >
        {category}
      </Link>
      <span className="page-crumb-sep">›</span>
      <span className="page-crumb-current">{title}</span>
    </nav>
  )
}
```

- [ ] **Step 2: Wire recents + breadcrumb into `src/routes/PageRoute.tsx`**

Add imports near the top (with the other component imports):

```tsx
import Breadcrumb from '../components/Breadcrumb'
import { recordRecent } from '../recents'
```

Add this effect immediately after the `pinLocations` live query (before the
`prevId` reset block), so it runs on every page load. It is a real `useEffect`,
so it must sit above the early `return`s:

```tsx
  // Record this page in the per-world "recently viewed" list once it has loaded.
  useEffect(() => {
    if (page?.id === id && id) recordRecent(id)
  }, [page?.id, id])
```

Add `useEffect` to the existing React import:

```tsx
import { useEffect, useRef, useState } from 'react'
```

Render the breadcrumb as the first child inside `<header className="page-header" …>`,
above `<div className="page-header-row">`:

```tsx
        <Breadcrumb category={page.category} title={page.title} color={categoryColor(page.category)} />
```

- [ ] **Step 3: Add breadcrumb styles to `src/index.css`**

Add near the `/* --- Page view --- */` section:

```css
.page-breadcrumb {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; margin-bottom: 12px; min-width: 0;
}
.page-crumb-link { font-weight: 600; }
.page-crumb-link:hover { text-decoration: underline; }
.page-crumb-sep { color: var(--ink-faint); }
.page-crumb-current {
  color: var(--ink-dim); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
```

- [ ] **Step 4: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: no errors. Manually: open a page → breadcrumb shows `Category › Title`; clicking the category goes to `/browse/:category`.

- [ ] **Step 5: Commit**

```bash
git add src/components/Breadcrumb.tsx src/routes/PageRoute.tsx src/index.css
git commit -m "feat(nav): page breadcrumb + record recently-viewed (#68)"
```

---

### Task 4: Sidebar — RECENT section + collapsible groups

Add a collapsible RECENT section above the category groups, and a chevron toggle to each category group. Clicking a group label still navigates to `/browse/:category`; the chevron toggles collapse.

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/index.css` (group-head row, chevron, recent section)

**Interfaces:**
- Consumes: `getRecent`/`pruneRecent` (Task 1); `getCollapsedGroups`/`toggleCollapsedGroup`/`RECENT_GROUP` (Task 2); existing `currentLoreId`, `categoryColor`, `statusColor`, `pageStatus`, `showPageHover`, `scheduleWikiHoverClose`.

- [ ] **Step 1: Add imports + collapse state to `src/components/Sidebar.tsx`**

Add imports:

```tsx
import { useMemo, useState } from 'react'
import { getRecent, pruneRecent } from '../recents'
import { getCollapsedGroups, toggleCollapsedGroup, RECENT_GROUP } from '../sidebarPrefs'
```

Inside the component, after `const loreName = …`, add the lore id + collapse state:

```tsx
  const loreId = currentLoreId()
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(getCollapsedGroups(loreId)))
  const toggle = (name: string) => setCollapsed(new Set(toggleCollapsedGroup(name, loreId)))
```

- [ ] **Step 2: Derive the recents list (by id → live page)**

After the `grouped` useMemo, add a memo that resolves recent ids to live pages and
prunes any that no longer exist:

```tsx
  // Resolve per-world recent ids to live page records; drop any that were deleted.
  const recentPages = useMemo(() => {
    const byId = new Map(pages.map((p) => [p.id, p]))
    const ids = getRecent(loreId)
    const present = ids.filter((id) => byId.has(id))
    if (present.length !== ids.length) pruneRecent(new Set(byId.keys()), loreId)
    return present.map((id) => byId.get(id)!)
  }, [pages, loreId])
```

- [ ] **Step 3: Render the RECENT section + make group headers collapsible**

Replace the `<div className="page-list">` block with:

```tsx
      <div className="page-list">
        {recentPages.length > 0 && (
          <div className="page-group">
            <div className="group-head">
              <button
                className="group-toggle"
                aria-expanded={!collapsed.has(RECENT_GROUP)}
                onClick={() => toggle(RECENT_GROUP)}
              >
                {collapsed.has(RECENT_GROUP) ? '▸' : '▾'}
              </button>
              <span className="group-label group-label-static">Recent</span>
            </div>
            {!collapsed.has(RECENT_GROUP) &&
              recentPages.map((p) => (
                <Link
                  key={p.id}
                  to={`/page/${p.id}`}
                  className={p.id === currentId ? 'page-link active' : 'page-link'}
                  onMouseEnter={(e) => showPageHover(p.id, p.title, e.currentTarget.getBoundingClientRect())}
                  onMouseLeave={scheduleWikiHoverClose}
                >
                  <span className="dot" style={{ background: categoryColor(p.category) }} />
                  <span className="page-link-title">{p.title}</span>
                  <span className="status-pip" title={pageStatus(p)} style={{ background: statusColor(pageStatus(p)) }} />
                </Link>
              ))}
          </div>
        )}

        {grouped.length === 0 && <p className="empty-hint">No pages yet. Create your first one!</p>}
        {grouped.map(([category, items]) => (
          <div key={category} className="page-group">
            <div className="group-head">
              <button
                className="group-toggle"
                aria-expanded={!collapsed.has(category)}
                onClick={() => toggle(category)}
              >
                {collapsed.has(category) ? '▸' : '▾'}
              </button>
              <Link
                to={`/browse/${encodeURIComponent(category)}`}
                className={`group-label${browseCategory === category ? ' active' : ''}`}
                style={{ color: categoryColor(category) }}
              >
                {category} <span className="group-count">{items.length}</span>
              </Link>
            </div>
            {!collapsed.has(category) &&
              items.map((p) => (
                <Link
                  key={p.id}
                  to={`/page/${p.id}`}
                  className={p.id === currentId ? 'page-link active' : 'page-link'}
                  onMouseEnter={(e) => showPageHover(p.id, p.title, e.currentTarget.getBoundingClientRect())}
                  onMouseLeave={scheduleWikiHoverClose}
                >
                  <span className="dot" style={{ background: categoryColor(p.category) }} />
                  <span className="page-link-title">{p.title}</span>
                  <span className="status-pip" title={pageStatus(p)} style={{ background: statusColor(pageStatus(p)) }} />
                </Link>
              ))}
          </div>
        ))}
      </div>
```

- [ ] **Step 4: Add styles to `src/index.css`**

In the sidebar section:

```css
.group-head { display: flex; align-items: center; gap: 2px; }
.group-toggle {
  background: none; border: none; color: var(--ink-faint);
  font-size: 10px; line-height: 1; padding: 6px 2px 4px 4px; cursor: pointer; flex-shrink: 0;
}
.group-toggle:hover { color: var(--ink); }
.group-head .group-label { flex: 1; min-width: 0; }
.group-label-static {
  font-family: var(--display); font-size: 12px; text-transform: uppercase;
  letter-spacing: 1px; padding: 8px 8px 4px 2px; color: var(--ink-dim);
}
```

- [ ] **Step 5: Verify build + lint, then commit**

Run: `npm run lint && npm run build`
Expected: clean. Manually: visit a few pages → RECENT fills (most-recent-first, deduped); collapse a group and the RECENT section, reload → state persists; switch worlds → recents/collapse are independent.

```bash
git add src/components/Sidebar.tsx src/index.css
git commit -m "feat(nav): collapsible sidebar groups + recent section (#68)"
```

---

### Task 5: App — route transitions, scroll reset, back-to-top

Fade/slide content on navigation, reset the scroll container on route change, and add a floating back-to-top button.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css` (route-fade keyframes, back-to-top)

**Interfaces:**
- Consumes: existing `useLocation`; the `.content` `<main>` element via a ref.
- Produces: no exported API (internal shell behavior).

- [ ] **Step 1: Add ref + scroll behavior to `src/App.tsx`**

Extend the React import and add state/refs inside `App`:

```tsx
import { useEffect, useRef, useState } from 'react'
```

Inside `App`, after `const [searchOpen, setSearchOpen] = useState(false)`:

```tsx
  const contentRef = useRef<HTMLElement>(null)
  const [showTop, setShowTop] = useState(false)

  // Reset the scroll container to the top whenever the route path changes.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  // Show the back-to-top button once the content is scrolled well down.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const onScroll = () => setShowTop(el.scrollTop > 600)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
```

- [ ] **Step 2: Wrap routes in the fade container + add the button**

Replace the shell `<main>…</main>` block with:

```tsx
      <main className="content" ref={contentRef}>
        <BackupBanner />
        <div className="route-fade" key={location.pathname}>
          <Routes>
            <Route path="/home" element={<HomeRoute />} />
            <Route path="/page/:id" element={<PageRoute />} />
            <Route path="/map" element={<MapRoute />} />
            <Route path="/graph" element={<GraphRoute />} />
            <Route path="/timeline" element={<TimelineRoute />} />
            <Route path="/templates" element={<TemplatesRoute />} />
            <Route path="/browse/:category" element={<CategoryRoute />} />
          </Routes>
        </div>
        {showTop && (
          <button
            className="back-to-top"
            aria-label="Back to top"
            onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            ↑
          </button>
        )}
      </main>
```

Note: `/map`, `/graph`, `/timeline` use full-height (`height: 100%`) layouts. The new
`.route-fade` wrapper sits between `.content` and the route, so it must carry
`height: 100%` itself (see Step 3) or those layouts collapse. Verify the map still
fills the viewport after this change.

- [ ] **Step 3: Add styles to `src/index.css`**

```css
/* Route transition: content fades in and rises slightly on navigation. */
.route-fade { height: 100%; animation: route-fade-in 120ms ease-out; }
@keyframes route-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}

/* Floating back-to-top, bottom-right of the viewport (clear of the sidebar). */
.back-to-top {
  position: fixed; bottom: 22px; right: 22px; z-index: 50;
  width: 40px; height: 40px; border-radius: 50%;
  background: linear-gradient(180deg, var(--accent-soft), var(--accent));
  color: #2a210b; border: none; font-size: 18px; line-height: 1;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}
.back-to-top:hover { filter: brightness(1.07); }
```

- [ ] **Step 4: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: clean. Manually: navigating fades content in; long pages show the back-to-top button past ~600px and it scrolls to top; switching pages resets scroll to top; the `/map` and `/graph` full-height layouts still fill the viewport.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/index.css
git commit -m "feat(nav): route fade, scroll reset, back-to-top (#68)"
```

---

### Task 6: Full verification

- [ ] **Step 1: Run the whole gate**

Run: `npm run lint && npm run build && npm run test:run`
Expected: lint clean, build succeeds, all tests pass (including the 12 new Task 1/2 tests).

- [ ] **Step 2: Manual smoke per the spec's Testing section**

Navigate between pages (fade + scroll reset), collapse a group and reload (persists, per-world), fill RECENT and reload, breadcrumb category link returns to browse, back-to-top on a long page, and confirm `prefers-reduced-motion` (OS setting) neutralizes the fade.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/visual-phase-1-nav
gh pr create --base main --title "feat(nav): Visual Phase 1 — navigation & wayfinding (#68)" \
  --milestone "Visual & Navigation Polish" --body "Closes #68. Implements the Phase 1 spec: route transitions, page breadcrumb, collapsible per-world sidebar groups, recently-viewed, scroll reset + back-to-top. See docs/superpowers/specs/2026-06-24-visual-phase-1-nav-design.md."
```

---

## Self-Review

**Spec coverage:**
- Route transitions → Task 5 ✓
- Page breadcrumb → Task 3 ✓
- Collapsible sidebar groups (per-world) → Task 2 (store) + Task 4 (UI) ✓
- Recently viewed (top of sidebar, per-world, prune deleted) → Task 1 (store) + Task 4 (UI) ✓
- Back-to-top + scroll reset → Task 5 ✓
- Unit tests for recents + collapse persistence → Tasks 1 & 2 ✓

**Type consistency:** `getRecent`/`recordRecent`/`pruneRecent`, `getCollapsedGroups`/`toggleCollapsedGroup`/`RECENT_GROUP` are used in Task 4 exactly as defined in Tasks 1–2. `Breadcrumb` props (`category`/`title`/`color`) match the Task 3 call site.

**Placeholder scan:** none — every code step shows complete content.

**Note on file naming:** the spec mentioned `src/recents.ts` and an inline `useCollapsedGroups` hook; this plan keeps `recents.ts` and splits collapse persistence into its own focused `src/sidebarPrefs.ts` module (testable in isolation) rather than an inline hook. Same behavior, cleaner boundaries.
