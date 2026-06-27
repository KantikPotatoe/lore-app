# TOC Includes H1 — Design

**Issue:** #81 · **Roadmap:** #5 · **Milestone:** Quick Wins

## Problem

The page Table of Contents (`src/components/TableOfContents.tsx`) scans only
`h2` and `h3` headings. The editor (Tiptap StarterKit) allows `h1` in article
bodies and the toolbar exposes an H1 button, so an author who uses a top-level
H1 section gets it silently dropped from the TOC. (The page *title* is a
separate field rendered outside the editor, so a body H1 is a legitimate
section heading, not a duplicate of the title.)

## Goal

Include `h1` headings in the TOC, with indentation that nests correctly without
changing how existing H2/H3-only pages look.

## Behavior

- The TOC scans `h1, h2, h3` (was `h2, h3`).
- **Relative-depth indentation:** a heading's visual indent is its depth
  relative to the shallowest heading level present on the page, not its absolute
  level. With `minLevel = min(levels present)`, each entry's depth is
  `level − minLevel` ∈ {0, 1, 2}.
  - A page using only H2/H3 has `minLevel = 2`: H2 → depth 0, H3 → depth 1 —
    pixel-identical to today.
  - A page using H1/H2/H3 has `minLevel = 1`: H1 → 0, H2 → 1, H3 → 2.
- Unchanged: slugified heading ids, the IntersectionObserver active-section
  highlight, smooth-scroll on click, and the "render only when there are more
  than 3 headings" threshold (H1s now count toward it).

## Architecture

The only non-trivial logic is extracted into a new pure module `src/toc.ts`
(mirroring the pure-helper pattern of `src/html.ts` / `src/calendar.ts`), so it
can be unit-tested without a DOM or IntersectionObserver:

- `slugifyHeadings(texts: string[]): string[]` — the existing slug-with-dedup
  logic, extracted verbatim: lowercase, non-alphanumerics → `-`, trim leading/
  trailing `-`, empty → `heading`; the Nth (N≥1, 0-indexed) repeat of a base
  slug gets a `-${count}` suffix. Returns one id per input, order preserved.
- `relativeDepths(levels: number[]): number[]` — returns `level − min(levels)`
  for each level; returns `[]` for an empty input (no `Math.min()` of nothing).

`TableOfContents.tsx`:
- Widens `TocEntry.level` from `2 | 3` to `1 | 2 | 3`.
- Scans `h1, h2, h3`; builds ids via `slugifyHeadings`, depths via
  `relativeDepths`.
- Renders each entry with class `toc-depth-${depth}` instead of `toc-h${level}`.

`src/index.css`:
- Replace `.toc-entry.toc-h3 { padding-left: 20px; }` with:
  - `.toc-entry.toc-depth-1 { padding-left: 20px; }`
  - `.toc-entry.toc-depth-2 { padding-left: 32px; }`
- Depth 0 keeps the base `.toc-entry` left padding (8px).

## Testing

`src/toc.test.ts` (pure unit tests):

1. `slugifyHeadings`:
   - slugifies text ("Early Life" → "early-life"); strips punctuation.
   - dedups repeats: `['Notes', 'Notes', 'Notes']` → `['notes', 'notes-1', 'notes-2']`.
   - empty / punctuation-only text → `'heading'` (and dedups: `'heading', 'heading-1'`).
2. `relativeDepths`:
   - `[2, 3, 2, 3]` → `[0, 1, 0, 1]` (H2/H3-only page unchanged).
   - `[1, 2, 3, 1]` → `[0, 1, 2, 0]` (H1 present).
   - `[]` → `[]`.

The component's DOM/observer wiring stays verified by `lint` + `build` (it has
no test today, being measurement-driven); this change does not add one.

## Out of scope

- H4–H6 in the TOC (StarterKit allows them, but the toolbar offers only H1–H3;
  keep the TOC to the three exposed levels).
- Any change to the editor, the heading threshold, or scroll behavior.
