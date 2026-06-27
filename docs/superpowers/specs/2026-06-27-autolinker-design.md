# Autolinker — Design

**Issue:** #86 (Link-System milestone, Roadmap #35)
**Date:** 2026-06-27
**Milestone:** Link-system arc, piece 3 of 3. Builds on alias/flavor links
(`[[Target|display]]`) and the `@` trigger.

## Problem

Authors have to explicitly `[[link]]` every cross-reference. We want body text to
auto-detect mentions of known page titles and render them as links (cf. World
Anvil's autolinker), without the author marking them up.

## Decisions (locked during brainstorming)

- **Render-time only.** Autolinks are computed when a page is *viewed*; stored HTML
  is never modified. Self-healing — renaming/creating a page re-links every body
  with no reprocessing. Manual `[[links]]` remain the only links in storage.
- **First occurrence per page.** Only the first mention of each title in a body is
  linked; later mentions stay plain text.
- **Global per-world toggle.** One on/off setting (`autolinkEnabled`, default **on**).
  Manual links always win regardless.
- **Visual only.** Autolinks are clickable in the body but do **not** affect
  backlinks, the relationship graph, or broken-link stats. No full-text scanning is
  added to those computations.

### Mechanical rules (design defaults)

- Case-insensitive, **whole-word** matching (so "Iron" is not matched inside
  "Ironclad"). Unicode-aware word boundaries so accented titles match correctly.
- **Longest title wins** on overlap ("Iron Guard" beats "Iron" when both exist).
- Never link: the page's **own title** (self-link), text already inside a manual
  link or a `wikiLink` node, text with a `code` mark, or text inside `heading` /
  `codeBlock` blocks.
- A title already carried by an explicit `wikiLink` node anywhere in the body is
  treated as already-handled and is not auto-linked again (manual wins, no doubles).

## Render mechanism — ProseMirror decorations

Page bodies render through a read-only Tiptap editor. Of the render-time options —
(a) a ProseMirror decoration plugin, (b) a post-render DOM pass wrapping text in
anchors, (c) preprocessing the HTML string — we use **(a)**.

Decorations are ProseMirror-native, recompute on doc/state change, and **do not
change `textContent`** (so the TOC heading scan and broken-link pass are
unaffected). They never appear in `getHTML()`, guaranteeing autolinks never enter
storage. DOM-wrapping (b) fights ProseMirror's DOM ownership; (c) would round-trip
through the schema.

## Components

### `src/autolink.ts` (new, pure — no React/Tiptap)

```ts
export interface TitleMatcher { regex: RegExp; byLower: Map<string, string> }
export interface AutolinkMatch { from: number; to: number; title: string }

export function buildTitleMatcher(titles: string[]): TitleMatcher | null
export function findAutolinkMatches(text: string, matcher: TitleMatcher): AutolinkMatch[]
export function planAutolinks(
  segments: { text: string; pos: number }[],
  preSeen: Iterable<string>,
  matcher: TitleMatcher,
): AutolinkMatch[]
```

- `buildTitleMatcher` — trims, de-dupes, drops empties, sorts **longest-first**, and
  builds one global regex:
  `new RegExp(`(?<![\p{L}\p{N}])(?:alt1|alt2|…)(?![\p{L}\p{N}])`, 'giu')`
  where each alternative is regex-escaped. `byLower` maps lowercase → canonical
  casing. Returns `null` for an empty title set. (Lookbehind + `\p{…}`/`u` are
  supported in modern Firefox and in Node/Vitest.)
- `findAutolinkMatches` — runs the matcher over one string, resolving each hit's
  canonical casing via `byLower`; returns offsets within that string. Guards against
  zero-length matches.
- `planAutolinks` — the document-level policy. Seeds a `seen` set from `preSeen`
  (lowercased), then walks `segments` in order, taking the **first** unseen match per
  title and mapping its offset to an absolute doc position (`seg.pos + m.from`).
  This is where first-occurrence dedup, manual-link precedence, and self-skip all
  land — and it is pure, so it carries the test weight.

### `src/extensions/Autolink.ts` (new Tiptap extension)

A `Extension` exposing one ProseMirror plugin (`autolinkKey = new PluginKey('autolink')`):

- **Plugin state** `{ enabled: boolean; matcher: TitleMatcher | null }`, updated by a
  `tr.setMeta(autolinkKey, { enabled, titles })` transaction. `apply` rebuilds the
  matcher from `titles` (so it recompiles only when titles change).
- **`props.decorations(state)`** returns `null` when `!enabled`, `matcher === null`,
  or `editor.isEditable` (autolinks are view-mode only). Otherwise it builds the
  decoration set:
  1. Walk `doc.descendants`; return `false` to skip the subtree of any `heading` or
     `codeBlock` node.
  2. Collect every `wikiLink` node's `title` into `preSeen`.
  3. For each text node **without** a `link` or `code` mark, push
     `{ text: node.text, pos }` into `segments`.
  4. `planAutolinks(segments, preSeen, matcher)` → for each match,
     `Decoration.inline(from, to, { class: 'wiki-link autolink', 'data-title': title, 'data-wikilink': '' })`.
  5. `DecorationSet.create(doc, decorations)`.

  (`editor` is captured from `this.editor` inside `addProseMirrorPlugins`.)

### `src/components/LoreEditor.tsx`

- Add `Autolink` to the extensions list.
- New props: `autolinkTitles?: string[]` (canonical titles, excluding the current
  page) and `autolinkEnabled?: boolean`.
- Effect: on change of `editor`, `autolinkTitles`, `autolinkEnabled`, or `editable`,
  dispatch
  `editor.view.dispatch(editor.state.tr.setMeta(autolinkKey, { enabled: !!autolinkEnabled && !editable, titles: autolinkTitles ?? [] }))`.
- Broaden the click selector `el.closest('a.wiki-link')` → `el.closest('.wiki-link')`
  and the hover selectors `closest('a[data-wikilink]')` → `closest('[data-wikilink]')`
  so the decoration `<span>`s navigate and hover exactly like real wiki links. The
  external-link branch (`a[href]:not(.wiki-link)`) is unaffected.

### `src/routes/PageRoute.tsx`

- `autolinkTitles` via `useLiveQuery`: all page titles where `p.id !== id` (self-skip
  at the source).
- `autolinkEnabled` from `useLiveQuery(() => getSettings())` → `settings?.autolinkEnabled ?? true`.
- Pass both to `<LoreEditor>`. Infobox (which uses `WikiText`, not `LoreEditor`) is
  untouched — autolinking is body-only by design.

### `src/settings.ts`

- Add `autolinkEnabled: boolean` to `LoreSettings`; `DEFAULT_SETTINGS.autolinkEnabled = true`.
- `updateSettings` currently clamps **every** patch field as a number. Fix it to pass
  boolean fields through unchanged (clamp only numbers). `getSettings`'s
  `{ ...DEFAULT_SETTINGS, ...stored }` merge already backfills the default for
  pre-existing worlds — no migration.

### `src/routes/SettingsRoute.tsx`

- A new section (e.g. "Linking") with a checkbox bound to `s.autolinkEnabled`, wired
  through the existing `setField({ autolinkEnabled: e.target.checked })` draft flow.

### `src/index.css`

Manual `.wiki-link` already uses a **dotted** underline, so a dotted underline can't
distinguish autolinks. Instead, autolinks reuse `.wiki-link` (same link color) but
**drop the underline until hover**:

```css
.wiki-link.autolink { border-bottom-color: transparent; }
.wiki-link.autolink:hover { border-bottom-color: var(--accent-soft); }
```

Manual links stay always-underlined; broken links are red-dashed — so the three are
visually distinct.

## Code paths verified unaffected

- **Storage / backlinks / graph / export** — decorations never enter `getHTML()`, so
  `wikiLinkTitles()`, `linkedTitles`, `buildGraphData`, `htmlExport` see only manual
  links. ✓ (matches the "visual only" decision)
- **TOC** (`TableOfContents.tsx`) — scans heading `textContent`; inline decorations
  don't alter text, and headings are skipped anyway. ✓
- **Broken-link DOM pass** (`LoreEditor.tsx`) — `querySelectorAll('a.wiki-link')`
  matches only `<a>`; decoration `<span>`s are ignored, and they only ever point at
  existing titles. ✓
- **Sanitize / import** — operate on stored HTML, which has no autolink markup. ✓

## Testing

- **`src/autolink.test.ts`** (pure, the bulk):
  - case-insensitive match; whole-word only ("Iron" unmatched in "Ironclad",
    matched in "the Iron gate"); longest-title-wins; correct offsets; multiple
    titles in order; empty/whitespace titles → `null` matcher; accented-letter
    boundaries; regex-special chars in titles escaped.
  - `planAutolinks`: first-occurrence-per-title dedup; `preSeen` skip
    (manual-link precedence) and self-skip; absolute-position mapping across
    multiple segments.
- **`src/settings.test.ts`**: `autolinkEnabled` default `true`; `updateSettings`
  round-trips the boolean without clamping (and still clamps numbers).
- **Extension glue** (doc→segments→`planAutolinks`→decorations) is thin and covered
  by a manual view-mode smoke check (open a page that mentions another page's title;
  confirm the first mention links, later ones don't, manual links aren't doubled,
  headings/code aren't linked, and edit mode shows plain text).
- Run `npm run lint && npm run build && npm run test:run` before claiming done (CI gate).

## Rollout / migration

None. Additive: no schema bump, no backup migration. Existing worlds inherit
`autolinkEnabled: true` through the settings-merge default.

## Out of scope

- Backlinks/graph participation for autolinked mentions (visual-only decision).
- Per-page opt-out, per-occurrence skip syntax, or "link every occurrence" mode.
- Autolinking infobox fields or event descriptions (body-only).
