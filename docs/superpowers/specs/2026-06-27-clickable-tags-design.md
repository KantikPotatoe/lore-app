# Clickable Tags — Design

**Issue:** #80 · **Roadmap:** #9 · **Milestone:** Quick Wins

## Problem

Tags are stored on every page (`page.tags: string[]`) and rendered as `#tag`
pills in `PageRoute`, but they're inert. There's no way to answer "what else is
tagged `magic`?" without manually searching. Tags should be a navigable facet,
the way categories already are.

## Goal

Clicking a tag pill opens a dedicated page listing every page that carries that
tag, mirroring the existing category browse experience.

## Behavior

- **View mode:** each `#tag` pill is a link to `/tag/<tag>`.
- **Edit mode:** tags render unchanged — plain pill plus the `×` remove button —
  so clicking a tag while editing does not navigate away from the page being
  edited.

## New route — `/tag/:tag` → `TagRoute`

A near-clone of `CategoryRoute`, deliberately reusing its structure and styles:

- Header: `#<tag>` title plus a `browse-count` of matching pages.
- Body: the existing `browse-grid` of `browse-card` links (image/placeholder,
  name, summary, status badge) — identical card markup to `CategoryRoute`.
- No "+ New" button: you don't create a page *into* a tag, so that control from
  `CategoryRoute` is omitted.
- Empty state: when no page carries the tag (e.g. a stale bookmarked URL), show
  the existing `EmptyState` component.

Reusing the `.browse-*` CSS means **no new styles** and visual consistency with
category browsing.

## Data query

`tags` is not a Dexie index, so filter in memory:

```ts
db.pages.filter((p) => p.tags.includes(tag)).sortBy('title')
```

At this app's scale (hundreds of pages, local IndexedDB) this is effectively
instant and avoids a schema-version bump. **Future optimization (not now):** if
tag volume ever grows enough to matter, add a `*tags` multiEntry index in a new
schema version and switch to `db.pages.where('tags').equals(tag)`. YAGNI for the
current scope.

## Edge cases

- **Spaces in tags:** tags may contain spaces, so build the link with
  `encodeURIComponent(tag)`. react-router decodes the `:tag` param automatically
  on the way back in.
- **Unused / stale tag in URL:** renders the `EmptyState`, not an error.

## Out of scope (possible follow-ups)

- A global "all tags" index/listing page.
- Making tags clickable elsewhere (graph filter, search results).
- Per-tag colors.

## Testing

A `TagRoute` render test following `SettingsRoute.test.tsx`'s pattern:

- renders cards for pages that carry the tag,
- excludes pages that don't,
- shows the empty state for a tag no page uses.

## Files touched

- `src/routes/TagRoute.tsx` — new component.
- `src/App.tsx` — register `<Route path="/tag/:tag" element={<TagRoute />} />`.
- `src/routes/PageRoute.tsx` — make view-mode tag pills link to `/tag/<tag>`.
- `src/routes/TagRoute.test.tsx` — new test.
