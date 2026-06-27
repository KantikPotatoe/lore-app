# Citations in pages — design

_Issue #87 ("Citations in pages"), Roadmap #6 (Document / codex features)._

## Goal

Let an author cite claims in a page's body to **in-world sources**. A citation is an
inline superscript marker (`[1]`, `[2]`, …) in the body text that ties to a numbered
**References** section auto-rendered at the bottom of the page. A source is either:

- an existing **lore page** (with optional locator + quote), or
- **free text** (when no page exists for the source yet), also with optional locator + quote.

Each marker is independent: two markers pointing at the same page still get separate
numbers (no source-reuse / "named ref" machinery).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Purpose | In-world source attribution (cite claims to sources, often other pages). |
| Source kind | Lore page **or** free text. Page sources may add a locator + quote. |
| Storage / display | Inline marker (Tiptap node) + auto-generated References section. Data lives in the marker. |
| Reuse | Each marker independent; its own sequential number. |
| Insert UX | Toolbar **"Cite"** button → dialog. |
| Backlinks / graph | **Not** integrated. Citations stay separate from backlinks and the relationship graph. |
| Rename | `renamePage` **does** rewrite citation page-targets (mandatory for correctness). |
| HTML export | **In scope** — numbered markers + References section in the exported static site. |
| Edit existing | **In scope** — select a citation node to re-open the dialog pre-filled. |

Rejected alternative: a `citations[]` array on `LorePage` with markers referencing by id.
More structure, needs a Dexie schema bump + backup migration, and buys source-reuse we
don't want. Keeping data in the marker means citations travel with `content` through
export/import/sanitize for free.

## Components

### 1. `Citation` node — `src/extensions/Citation.ts`

A new inline **atom** node mirroring `src/extensions/WikiLink.ts`. Renders as:

```html
<sup data-citation
     data-target="Chronicle of the Vale"
     data-locator="Ch. 3"
     data-quote="…"
     class="citation"></sup>
```

Attributes (all default `''`):

- `target` — cited page title (canonical). Empty for a free-text source.
- `text` — free-text source description. Empty for a page source.
- `locator` — optional locator, e.g. "Ch. 3", "p. 42".
- `quote` — optional quoted excerpt.

`renderHTML` emits the `<sup>` with these as `data-*` attributes and `class="citation"`.
The `<sup>` carries **no number text** — the number is derived from document order, so
markers renumber automatically on insert/delete. `parseHTML` matches `sup[data-citation]`.
`renderText` (plain-text copy) emits something readable, e.g.
`[cite: <target|text>(, <locator>)]`, so copy/paste degrades gracefully.

The node is `atom: true`, `selectable: true` (so it can be selected for editing) — same
shape as `WikiLink`.

### 2. Numbering & navigation

- **Display number** — pure CSS counter, no JS:
  - page-main container: `counter-reset: cite;`
  - `sup[data-citation] { counter-increment: cite; }`
  - `sup[data-citation]::before { content: "[" counter(cite) "]"; }`
  - Numbers appear identically in view and edit mode.
- **Marker → References** — handled in `LoreEditor`'s existing `handleClick`: detect
  `closest('[data-citation]')`, compute its ordinal among
  `view.dom.querySelectorAll('sup[data-citation]')`, and scroll the matching reference
  entry into view. Since both `LoreEditor` and `References` render under `PageRoute`, this
  is wired with an `onCitationClick(ordinal)` callback prop the route forwards to
  `References` (no global bus needed).
- **Reference → marker** — each reference entry has a "↑" control that scrolls the nth
  `sup[data-citation]` in `page-main` into view.
- No ids are injected into Tiptap-managed DOM (Tiptap can clobber them on update);
  navigation is purely by ordinal.

### 3. Citation parsing — `src/citations.ts` (pure, not in the `db/` barrel)

Mirrors the spirit of `src/html.ts` / `src/calendar.ts` — pure, no React/Dexie.

```ts
export interface Citation {
  target: string   // cited page title, '' if free-text
  text: string     // free-text source, '' if page-cited
  locator: string  // '' if none
  quote: string    // '' if none
}

/** All citation markers in a body's HTML, in document order. */
export function parseCitations(html: string): Citation[]
```

Reads `sup[data-citation]` via `parseHtml` from `html.ts`, in order. Skips a `<sup>` that
has neither `target` nor `text` (malformed). Used by `References` and tests. A small
helper to build the node attrs from dialog state can also live here if useful.

### 4. References section — `src/components/References.tsx`

Rendered in `page-main` after `<LoreEditor>` (near `<ImageGallery>`). Props: `content`
(page HTML), `onWikiClick`, `knownTitles`, and a nav hook for marker scrolling. Behaviour:

- Parse `content` with `parseCitations`.
- Render nothing when there are zero citations.
- Heading is a styled `div.references-head` (like `Backlinks`) so it stays out of the TOC.
- Numbered list. Each entry:
  - **Page source** — render the title as a wiki-style link reusing `onWikiClick` +
    `is-broken` styling (same affordance as a body wiki link), then locator + quote.
  - **Free-text source** — render the text (React-escaped), then locator + quote.
  - A "↑" back-reference control scrolling to the matching marker.

### 5. Editor integration — `src/components/LoreEditor.tsx`

- Register `Citation` in the `extensions` array.
- Add a **"Cite"** toolbar button (in the link/insert cluster). Opens a citation dialog
  (new `citeDraft` state) styled like the existing `.link-popover` / `.wiki-link-edit`
  popovers. Dialog fields:
  - Source-type toggle: **Page** / **Free text**.
  - Page mode: text input with a filtered suggestion list reusing
    `rankWikiTitles(pageTitles, query)` (the same vocabulary the `[[` autocomplete uses).
  - Free-text mode: text input for the source description.
  - Locator input (optional).
  - Quote textarea (optional).
  - Insert button → inserts a `citation` node at the cursor.
- **Edit existing** — when a `citation` node is selected (`NodeSelection`, like
  `selectedWikiLink`), open the dialog pre-filled and write changes back with
  `setNodeMarkup` (mirrors the `editLink` / `applyEditLink` flow). Deleting is the normal
  node delete.

### 6. Rename integration — `src/db/pages.ts`

Extend `rewriteLinksInPage` so that, alongside the existing `<a data-wikilink>` and
infobox `[[…]]` rewrites, it rewrites `sup[data-citation][data-target="OldTitle"]`
(case-insensitive) → `newTitle`. Per the backlinks decision, `linkedTitles`,
`getBacklinks`, and the graph scan are **left untouched** — citations do not appear as
backlinks or graph edges.

### 7. Sanitizer — `src/sanitize.ts`

`sup` and `class` are already whitelisted and `data-*` passes via `ALLOW_DATA_ATTR`, so no
whitelist change is strictly required. Add a documenting comment noting the citation
`<sup>` and a test confirming a citation marker survives import sanitization (the
untrusted boundary). Free-text/locator/quote are stored as plain text in `data-*` attrs
and rendered React-escaped — no injection vector.

### 8. HTML export — `src/htmlExport.ts`

- Add the citation counter CSS to the exported `style.css` so markers show `[1]`, `[2]`, …
- Emit a per-page **References** section (built from `parseCitations`) in each exported
  `pages/<id>.html`, with page-source titles rewritten to the same relative file paths the
  existing wiki-link rewrite uses (free-text and broken targets render as plain text).

### 9. Styles

`.citation` superscript styling + counter rules; `.references` / `.references-head`
section styling; `counter-reset: cite` on the page-main container. (Exact stylesheet file
located during implementation.)

## Testing

- `src/citations.test.ts` — `parseCitations` returns target/text/locator/quote in document
  order; skips a `<sup>` with neither target nor text.
- `src/db/pages.test.ts` (or existing rename test) — renaming a cited page rewrites the
  citation's `data-target`; an uncited page is untouched.
- `src/sanitize.test.ts` — a citation `<sup>` (with its `data-*` attrs) survives
  `sanitizeHtml`.
- A focused `References` render test — page source renders a link; free-text renders text;
  zero citations renders nothing.
- HTML-export test — exported page contains numbered markers and a References section.

## Out of scope

- Source reuse / named refs (each marker independent).
- Citations contributing to backlinks or the relationship graph.
- A separate citations table or any Dexie schema / backup-format change.
- Manuscripts / long-form documents (separate parked roadmap item #34).
