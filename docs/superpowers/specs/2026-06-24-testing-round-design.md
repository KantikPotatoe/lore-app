# Testing round: link core, graph, templates, HTML export

Date: 2026-06-24

## Goal

Add characterization tests for four pure-ish, currently-untested areas of the
codebase. Each test asserts the behavior the existing doc comments already
promise. If a test surfaces a real bug, stop and report it rather than codifying
the bug.

All tests use the existing Vitest + happy-dom + fake-indexeddb setup. `html.ts`
and `graph.ts` are environment-agnostic; `pages.ts`/`templates.ts` tests hit the
in-memory Dexie DB exactly like the existing `db/*.test.ts` files (clear tables
in `beforeEach`).

## Scope

### 1. `src/html.test.ts` — pure, no DB

- `stripHtml`: empty input → `''`; tags stripped + entities decoded; nested tags.
- `wikiLinkTitles`: returns `data-title` values (trimmed, original casing); skips
  anchors with no `data-title`; fast-path `[]` when no `data-wikilink` present.

### 2. `src/db/graph.test.ts` — pure (page arrays passed directly)

- Every page becomes a node, including link-less pages (lone dots).
- Resolved link → one edge; missing target → no edge; self-link dropped.
- A→B and B→A collapse to a single undirected edge.
- `degree` counts distinct neighbours.
- Case-insensitive title resolution.
- Links sourced from both body anchors and infobox `[[refs]]`.

### 3. `src/db/pages.test.ts` — in-memory DB

- `findPageIdByTitle`: case-insensitive hit; trims input; `null` when absent.
- `renamePage`: rewrites body anchors (attribute + visible text) and infobox
  `[[tokens]]` across *other* pages; throws on title clash; no-ops on empty or
  unchanged title; leaves unreferenced pages untouched.
- `getBacklinks`: finds linkers via body and infobox; excludes self; sorted by
  title.

### 4. `src/db/templates.test.ts` — in-memory DB + pure helpers

- `applyTemplate`: rows become exactly the template's; matching-label values
  carried over; `carryValue` drops non-`[[ref]]` text from ref fields and
  non-numeric strings from number fields; image/caption preserved; separators get
  fresh rows.
- `parseRefTitles` / `serializeRefTitles` round-trip.
- `seedTemplates`: adds missing built-ins; drops obsolete built-ins; leaves
  custom (`builtin: false`) templates alone; backfills missing colour/icon without
  overwriting user edits.

### 5. `src/htmlExport.ts` refactor + `src/htmlExport.test.ts`

`exportAsHtml` currently keeps all its logic in unexported helpers and ends in a
`void` browser download — no seam to assert on. Refactor (approved):

- Extract a pure `buildHtmlSite(pages, images): Record<string, string>` that
  returns a path→content map (`style.css`, `index.html`, `pages/<id>.html`).
- `exportAsHtml` becomes: read DB → `buildHtmlSite(...)` → write files into JSZip
  → download. The download path stays trivial and untested.

Tests over `buildHtmlSite`:

- Produces `index.html`, `style.css`, and a `pages/<id>.html` per page.
- `index.html` groups pages by category.
- Wiki links rewritten to `./<id>.html`; unresolved targets → `broken-link` span.
- Infobox rendered; empty fields dropped; separators only when a later field has
  a value.
- Gallery rendered from images, sorted by `order`; empty gallery omitted.
- Backlinks ("What links here") computed from body `data-title` references.

## Out of scope

- The `exportAsHtml` download mechanics (blob/anchor/click) — covered only by the
  thin wrapper, not unit-tested.
- The stray `ImageGallery (# Name clash …).tsx` sync artifact in the working tree.

## Verification

`npm run lint`, `npm run build`, and `npm run test:run` must all pass before the
work is claimed done (per CLAUDE.md / CI).
