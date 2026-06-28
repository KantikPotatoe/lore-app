# Make tags navigable — sidebar Tags group (#103)

## Problem

Tags work (`/tag/:tag` → `TagRoute`) but are undiscoverable: the only way to
reach a tag is to click a tag chip on a page you already have open
(`PageRoute.tsx`). There is no index, cloud, or navigation entry, so a tag is
invisible unless you happen to land on a page that carries it.

## Goal

Surface every tag in the left sidebar as a collapsible **Tags** group, so any
tag is reachable from anywhere, ordered most-used first.

Non-goals (YAGNI): a Home tag cloud, tag renaming/merging, any tag-editing UI.
Tags are still added/removed on the page itself, exactly as today.

## Design

### 1. Pure helper — `src/tags.ts`

```ts
export function tagCounts(pages: LorePage[]): { tag: string; count: number }[]
```

Walk every page's `tags: string[]`, tally occurrences into a map, and return the
entries sorted by `count` descending, ties broken by `localeCompare` (A–Z).
Empty input → empty array. Pure (no React/Dexie), mirroring the existing
`toc.ts` / `autolink.ts` pure-core pattern, so the ordering logic is unit-tested
in isolation and the Sidebar stays declarative.

### 2. Collapse sentinel — `src/sidebarPrefs.ts`

Add `export const TAGS_GROUP = '__tags__'`, mirroring the existing
`RECENT_GROUP = '__recent__'`. No other change: the per-world collapsed-set
storage already handles arbitrary group keys. The sentinel cannot collide with a
real category name. Default state is **expanded** (absence from the collapsed
set), consistent with the category groups and Recent.

### 3. Sidebar — the Tags group — `src/components/Sidebar.tsx`

- Compute `const tags = useMemo(() => tagCounts(pages), [pages])`.
- Render one `page-group` **after** the category groups (tags are cross-cutting,
  so they sit below the per-category lists), and only when `tags.length > 0`.
- The group head reuses the existing `group-head` / `group-toggle` collapse
  control keyed on `TAGS_GROUP`, with a static label "Tags" (same treatment as
  the "Recent" group's `group-label-static`).
- When expanded, each tag renders as a leaf link to
  `/tag/${encodeURIComponent(tag)}`, displayed as `#tag` with a `group-count`
  pill showing its count, and an `active` class when the current route is that
  tag.
- Derive the active tag from `location.pathname` (decode `'/tag/'` prefix),
  mirroring the existing `browseCategory` derivation.

### 4. Styling — `src/index.css`

Add a `.tag-link` rule for the sidebar rows: a compact, `#`-prefixed, muted link
that reuses the existing `group-count` pill and indents like `page-link`. No new
structural classes — it reuses `page-group` / `group-head` / `group-toggle`.

## Data flow

`db.pages` (liveQuery, already in Sidebar) → `tagCounts(pages)` (memoized) →
rendered tag links. Reactive by construction: adding/removing a tag on any page
re-emits the pages query and the group updates. No new persistence beyond the
collapse sentinel.

## Testing

- `src/tags.test.ts` — aggregation across pages, dedupe, count-desc-then-A–Z
  ordering, and empty input.
- `Sidebar` render test (new or extended) — a seeded tag appears with its count
  and links to `/tag/:tag`; the Tags group is absent when no page has tags.

## Risks / edge cases

- **Many tags** → a long list. Acceptable: the page list already scrolls, and
  the group is collapsible (state persisted per world).
- **Whitespace/casing** — out of scope; tags are matched exactly as stored,
  consistent with `TagRoute`'s `tags.includes(tag)`.
- No conflict with the in-flight #104 (BrowseGrid) PR: disjoint files.
