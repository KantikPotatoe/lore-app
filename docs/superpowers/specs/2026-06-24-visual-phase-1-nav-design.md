# Visual Phase 1 — Navigation & wayfinding — Design

**Date:** 2026-06-24
**Status:** Approved, ready for implementation plan
**Phase:** 1 of 4 in the [Visual & Navigation Polish roadmap](../../visual-polish-roadmap.md) (issue #68)

## Context

Lore Codex is a local-first worldbuilding wiki. The app already has a mature dark
parchment-and-ink identity (`src/index.css`), recently reinforced by a "Visual
foundations" pass (PR #67). This phase makes the app **more agreeable to navigate**
without changing the identity — all changes are additive and ride on the existing
CSS-variable system.

The shell is established (`src/App.tsx`): `/` renders the full-screen
`LoreSelectorRoute`; every other path renders inside a `<Sidebar>` + `<main
className="content">` shell. `.content` is the scroll container
(`overflow-y: auto`). The sidebar (`src/components/Sidebar.tsx`) groups pages by
category. Pages (`src/routes/PageRoute.tsx`) have a header but no breadcrumb — only
the map has wayfinding crumbs today.

### Roadmap (agreed; this spec covers Phase 1 only)

1. **Navigation & wayfinding** ← this spec.
2. **Depth & texture.** Parchment overlay, layered elevation, ornamental dividers.
3. **Page identity.** Type-tinted page chrome + category glyph.
4. **Empty & first-run states.** Designed empty states + first-run nudge.

Each phase is its own spec → plan → build cycle.

## Goal

Make it easy to know where you are, move between pages, and get back to recent work —
with motion that reads as intentional, not jarring.

## Design

### 1. Route transitions — `src/App.tsx` + `src/index.css`

- Wrap the `<Routes>` element in a container keyed by `location.pathname`. On key
  change the content mounts with a CSS animation: fade `opacity 0 → 1` plus
  `translateY(6px → 0)` over ~120ms ease-out.
- One class, `.route-fade`, with an `@keyframes route-fade-in`. The existing
  `@media (prefers-reduced-motion: reduce)` block already zeroes animation duration
  globally, so no extra guard is needed.
- The `/` lore-selector branch (returned before the shell) is **not** wrapped — it
  has its own full-screen treatment.
- Constraint: keying on `pathname` remounts route components on navigation. This is
  already the effective behavior for `/page/:id` (keyed editor by `id`); confirm no
  route relies on cross-navigation component state (none do — state is in Dexie /
  localStorage).

### 2. Page context header (breadcrumb) — `src/components/Breadcrumb.tsx` (new)

- New presentational component: renders `Category › Title`, the category as a
  `<Link to="/browse/:category">`, the title as plain dimmed text.
- The category crumb is tinted with `categoryColor(page.category)` (sets up Phase 3).
- Rendered at the very top of `PageRoute`'s `<header className="page-header">`, above
  the title row. Hidden in edit mode is **not** required — it stays visible.
- Styling reuses the map's crumb idiom (`.map-breadcrumb` / `.map-crumb-*`) as a
  reference but gets its own `.page-breadcrumb` classes to avoid coupling.

### 3. Collapsible sidebar groups — `src/components/Sidebar.tsx` + new persistence helper

- Each `.page-group` header gains a chevron (`▸`/`▾`) and toggles its item list.
- Collapse state persists in `localStorage`, **keyed per-world**:
  `lore:<loreId>:collapsedGroups` → JSON array of collapsed category names.
  Default = empty array (all groups open), so existing users see no change until
  they collapse something.
- The header stays a category link to `/browse/:category`; the chevron is a separate
  click target so the link still works (clicking the chevron toggles, clicking the
  label navigates). Keyboard accessible (button with `aria-expanded`).
- A small inline hook `useCollapsedGroups(loreId)` returns `{ collapsed, toggle }`,
  reading/writing the localStorage key. Pure enough to unit-test.

### 4. Recently viewed — `src/recents.ts` (new) + `Sidebar.tsx` + `PageRoute.tsx`

- `recents.ts` owns a per-world recents list in `localStorage`
  (`lore:<loreId>:recentPages` → array of page ids, most-recent-first):
  - `recordRecent(id)` — unshift, dedupe, cap at 6. Called from `PageRoute` on page
    load (in an effect keyed by `id`).
  - `getRecent()` — returns the id list.
  - These are React-free pure functions (like `wikiLinkHover.ts` / `storageError.ts`).
- A new `RECENT` collapsible section renders at the **top of the sidebar
  `.page-list`**, above the category groups (matches the approved mockup). It maps
  recent ids → live page records (from the sidebar's existing `pages` live query),
  **skipping ids no longer present** (self-prunes deleted pages from display; the
  stored list is pruned opportunistically on next `recordRecent`).
- Entries reuse `.page-link` markup (category dot + title) and the existing
  `showPageHover` / `scheduleWikiHoverClose` hover-preview wiring.
- The section is hidden entirely when there are no recents (clean first run).
- Uses the same per-world collapse mechanism as category groups (its own pseudo-key,
  e.g. collapsed name `"__recent__"`).

### 5. Back-to-top + scroll reset — `src/App.tsx` (or a small `ScrollManager`) + `src/index.css`

- **Scroll reset:** on `location.pathname` change, reset the `.content` element's
  `scrollTop` to 0. Implemented in `App.tsx` via a ref on `<main className="content">`
  + an effect on `location.pathname` (the lore-selector branch is unaffected).
  Exception: do not fight in-page anchor scrolling (TOC) — TOC scrolls a child after
  mount; the reset only fires on pathname change, not hash change, so they don't
  conflict.
- **Back-to-top button:** a floating `.back-to-top` button, fixed bottom-right of
  `.content`, appears once `scrollTop > 600px`, scrolls smoothly to top on click.
  Respects reduced-motion (smooth → auto via the global block / `scroll-behavior`).
  Lives in `App.tsx` alongside the scroll manager so it has the `.content` ref.

## Files

**New:**
- `src/components/Breadcrumb.tsx` — page breadcrumb.
- `src/recents.ts` — per-world recents list (pure).
- `src/recents.test.ts` — record/dedupe/cap/prune unit tests.

**Changed:**
- `src/App.tsx` — route-fade wrapper, scroll reset, back-to-top.
- `src/components/Sidebar.tsx` — collapsible groups, RECENT section.
- `src/routes/PageRoute.tsx` — render `<Breadcrumb>`, call `recordRecent` on load.
- `src/index.css` — `.route-fade`/keyframes, `.page-breadcrumb*`, group chevron,
  `.back-to-top`, RECENT section.

## Testing

- **Unit (Vitest):** `recents.ts` — record prepends, dedupes, caps at 6, prunes
  unknown ids; collapse-state read/write round-trips and is per-world keyed.
- **Build + lint:** `npm run lint && npm run build && npm run test:run` all green.
- **Manual:** navigate between pages (fade fires, scroll resets); collapse a group
  and reload (state persists, scoped to the world); visit pages and confirm RECENT
  fills, dedupes, and survives reload; breadcrumb category link returns to browse;
  back-to-top appears on a long page; verify reduced-motion neutralizes the fade.

## Out of scope (later phases / tiers)

Depth/texture, type-tinted chrome, designed empty states, theme switching. Recents is
display-only (no "clear history" UI this phase — revisit if wanted).
