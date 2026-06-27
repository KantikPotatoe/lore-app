# Alias / Flavor Links — Design

**Date:** 2026-06-27
**Status:** Approved, pending implementation plan
**Milestone:** Link-system arc, piece 1 of 3 (foundation). Followed by `@` trigger,
then Autolinker (which depends on this for overrides/skips).

## Problem

Wiki links always display their target's title. Authors want to link to a page but
show different text — "The stranger" pointing to `Odrian Borinor`, or "the capital"
pointing to `Veldhaven`. This is the foundation of the link-system arc: the
Autolinker later needs alias/skip overrides built on the same mechanism.

## Goal

Support pipe-delimited alias syntax everywhere a wiki link can appear:

- `[[Target]]` → links to *Target*, shows "Target" (unchanged).
- `[[Target|shown text]]` → links to *Target*, displays "shown text".

The display text is **purely cosmetic**. The canonical target is what everything
structural keys off.

## Non-goals

- Autolinker and `@` trigger (separate pieces of the arc).
- Per-page alias registries / "known aliases" (Autolinker's concern, not this).
- Fixing the infobox HTML-export gap (`htmlExport.ts` dumps raw field values, so
  infobox `[[…]]` tokens already render literally — pre-existing, out of scope).

## Core contract — syntax & parsing

A single pipe-delimited form, parsed identically in both code paths:

- Split on the **first** `|` only. Before = target, after = display. Both `.trim()`ed.
- `[[Target|]]` (empty display) → no alias; display falls back to target.
- Empty target → ignored (current behavior).
- **`data-title` always stores the canonical target.** Backlinks, the relationship
  graph, broken-link detection, hover popovers, and `wikiLinkTitles()` all read
  `data-title` and therefore need no changes — display never participates in
  resolution.

## Implementation

### Shared parse helper — `src/wikiLink.ts` (new, pure)

To avoid two copies of the split-on-first-`|` logic drifting apart, both code paths
call one pure helper (no React/Tiptap), unit-testable on its own:

```ts
export function parseWikiToken(raw: string): { target: string; display: string } | null
```

- Splits `raw` (the inside of `[[…]]`) on the first `|`; trims both halves.
- Returns `null` when the target is empty.
- When display is empty/absent, `display === target`.

The two regexes still differ (the input rule is `$`-anchored, `WikiText` is global),
but each hands its captured inner text to `parseWikiToken` for the actual splitting.

### Body — `src/extensions/WikiLink.ts`

- Add a `display` attribute to the node:
  - `parseHTML`: read `data-display`.
  - `renderHTML`: emit `data-display` **only when it differs from `title`**; render
    the display text (`attrs.display || attrs.title`) as the node's text content.
- `renderText`: return `[[title|display]]` when display differs from title, else
  `[[title]]` (preserves copy-paste round-tripping and the stored canonical form).
- Input rule regex: `/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/`. Capture group 1 = target,
  group 2 = optional display. Trim both; ignore empty target; empty display ⇒ no alias.
- `acceptSuggestion` in `LoreEditor.tsx` is unchanged — autocomplete inserts a plain
  target; aliasing is applied afterward via the edit popover.

### Infobox — `src/components/WikiText.tsx`

- Regex becomes `/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g`.
- Link the **target** (`onWikiClick(target)`, broken-check on `target.toLowerCase()`,
  hover keyed off target); render the **display** text (`display || target`).
- Infobox fields are edited as raw text, so authoring an alias there is just typing
  `[[Target|shown]]` directly — no popover needed.

### Sanitize — `src/sanitize.ts`

No change. `ALLOW_DATA_ATTR: true` already permits `data-display` through DOMPurify.

### Edit popover — body only, `src/components/LoreEditor.tsx`

When a `WikiLink` node is selected in edit mode:

- Detect selection via `onSelectionUpdate` → a `NodeSelection` whose node is a
  `wikiLink`. (Plain-clicking the atom node selects it; Ctrl/Cmd-click still
  navigates, per existing `handleClick`.)
- Show a small floating popover positioned with `editor.view.coordsAtPos(...)`,
  mirroring the autocomplete menu's viewport-fixed positioning (guard the
  `coordsAtPos` call in try/catch as the menu already does).
- Two inputs — **Target** and **Display (optional)** — pre-filled from node attrs.
  Committing updates the node's attrs via a transaction
  (`editor.chain().updateAttributes('wikiLink', { title, display }).run()` on the
  selected node). Empty/equal display clears the alias.
- This reuses the floating-UI pattern rather than the mark-based toolbar `linkBox`,
  which doesn't fit an atom node.

## Code paths verified unaffected

- `src/html.ts` `wikiLinkTitles()` — reads `data-title`. ✓
- `src/db/pages.ts` backlinks / `linkedTitles` — via `wikiLinkTitles`. ✓
- `src/db/graph.ts` `buildGraphData` — resolves by title. ✓
- `WikiLinkPopover.tsx` hover — fetches by `data-title`. ✓
- `src/htmlExport.ts` `rewriteWikiLinks` — uses the anchor's `inner` text, so body
  exports pick up display text automatically once the node renders it. ✓
- Broken-link DOM pass in `LoreEditor.tsx` — toggles `.is-broken` off `data-title`. ✓

## Testing

- **`wikiLink.test`** — pure `parseWikiToken` tests: target/display extraction,
  trimming, empty-display fallback, empty/whitespace target → null, `|` with no
  display, multiple `|` (split on first only).
- **`WikiText.test`** (or new): renders display text, links target, broken-check on
  target, alias with `|`, plain link still works.
- **`WikiLink` node**: input rule produces a node with the right `title`/`display`;
  `renderText` round-trips `[[t|d]]` and `[[t]]`; `renderHTML` omits `data-display`
  when equal.
- Run `npm run lint && npm run build && npm run test:run` before claiming done (CI gate).

## Rollout / migration

None. The change is additive: existing `[[Target]]` content parses identically, and
existing stored HTML has no `data-display` (so `display` defaults to title). No schema
bump, no backup migration.
