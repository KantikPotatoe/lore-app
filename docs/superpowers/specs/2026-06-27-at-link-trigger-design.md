# `@` as a second wiki-link trigger

**Issue:** #85 (Link System milestone, Roadmap #2)
**Date:** 2026-06-27

## Goal

Add `@`-typing as an additional input trigger that opens the existing wiki-link
autocomplete and produces the **same** `wikiLink` node. Purely ergonomic — `[[…]]`
stays the canonical stored form everywhere (infobox ref tokens, `renderText`,
backlinks scan, `html.ts`, autocomplete query, import sanitize). No migration, no
new storage shape.

## Key insight

The autocomplete pipeline is already trigger-agnostic. In `LoreEditor.tsx`,
`computeSuggest(editor)` reads the text before the cursor, calls
`findOpenWikiQuery`, and yields a `{ query, from, to, index }` anchor.
`acceptSuggestion(title)` then deletes the `[from, to]` range and inserts a
`wikiLink` node. Only the **detection** step (`findOpenWikiQuery` in
`src/wikiAutocomplete.ts`) knows about `[[`. The feature therefore lives almost
entirely in that one pure function.

## Design

### 1. `src/wikiAutocomplete.ts` — generalize `findOpenWikiQuery`

Recognize either open trigger, returning the same `{ query, matchLength }` shape
so the caller is unchanged.

- **`[[` rule (unchanged), checked first:** `/\[\[([^[\]]*)$/`.
- **New `@` rule:** `/(^|\s)@([^\s@]*)$/`
  - Fires only at line start or after whitespace (**word boundary** — so
    `foo@bar` does not trigger).
  - Query runs until the next whitespace (**stop at whitespace** — page titles
    with spaces are still reachable by typing one word and picking from the
    narrowed menu).
  - `matchLength = query.length + 1` (the `@` plus the query), so
    `from = to - matchLength` lands on the `@`, which is consumed on accept.

Because `[[` is checked first, `[[@foo` still resolves as a `[[` query (the `@`
is just part of the query text) — no conflict. An empty `@` (just typed) returns
`query: ''`, surfacing the full title menu, identical to an empty `[[`.

### 2. No new InputRule

`[[Title]]` auto-converts on the closing `]]` via the `WikiLink` InputRule. `@`
has no terminator, so it produces a node **only** by accepting a menu item
(Enter / Tab / click). This is intended: it keeps `[[…]]` as the sole canonical
*typed* form, so nothing in storage, backlinks, `html.ts`, or import sanitize
changes.

### 3. `src/components/LoreEditor.tsx`

No logic change required — `computeSuggest` / `acceptSuggestion` are already
generic. Optional polish: extend the toolbar hint
`Type [[Name]] to link a page` to also mention `@Name`.

## Testing

Extend `src/wikiAutocomplete.test.ts`:

- `@` at a word boundary opens a query; mid-word (`foo@bar`) does not.
- Whitespace ends the `@` query (`@drag lord` → no open query).
- Empty `@` returns `query: ''`.
- `matchLength` for `@drag` is 5 (points `from` at the `@`).
- Existing `[[` behavior preserved, including `[[@foo` resolving as a `[[` query.

## Out of scope

- No migration or change to the canonical `[[…]]` storage form.
- No `@` InputRule / typed-out terminator.
- No change to backlinks, graph, hover, or import logic.
