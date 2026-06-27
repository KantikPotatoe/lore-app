# Template "Apply to Existing Pages" Discoverability — Design

**Issue:** #83 · **Roadmap:** #1 · **Milestone:** Quick Wins

## Background

A page's infobox is an independent snapshot of its page type, created from the
template at page-creation (`defaultInfobox()` → `itemsToFields()`). Editing a
type's rows in `/templates` deliberately does **not** rewrite existing pages —
that preserves per-page customizations.

Propagation already exists: `TemplatesRoute` has an **"Apply to existing pages"**
button calling `applyTemplateToPages(tpl)`, which re-applies the template to
every page of that type via `applyTemplate` (values preserved by matching
label). The issue (#83 / roadmap "update infobox in real time") is **not a bug**
— the feature works, but the action is easy to miss: it's a plain `mini-btn` at
the bottom of the editor among the "Add field/separator" buttons, with nothing
connecting "I just edited rows" to "I must click Apply."

## Goal

Make the apply action **discoverable at the moment it matters**: after the user
edits a type's rows, surface a clear, highlighted prompt offering to apply the
changes to existing pages — without removing the ability to apply at other
times, and without changing any propagation behavior.

## Behavior

- A `dirty` flag (component state) means "rows changed since the last apply or
  template switch."
  - **Set `true`** by any row edit. All row mutations already funnel through
    `commitItems()` (add field, add separator, edit label, change type/refType,
    remove, move), so setting it there covers them. The **Reset** action also
    sets it (it replaces the rows).
  - **Reset to `false`** on `selectTemplate()` (switching/creating templates)
    and after a successful `applyToPages()`.
  - Name / colour / icon edits do **not** set it — colour and icon already
    reflect on pages live (read from the template cache), so only row changes
    need propagating.
- The apply control is **always present** when the type is used by ≥1 page
  (applying remains possible after navigating away and back), but its prominence
  **escalates when `dirty && usedByCount > 0`**: it renders as a highlighted
  callout with an explanatory line. When not dirty, it stays the quiet row it is
  today.
- The button label includes the live page count: `Apply to N existing page(s)`.
  When `usedByCount === 0` the button is disabled with "No pages use this type
  yet." After a successful apply, `dirty` clears (callout collapses) and the
  existing success note shows ("Updated N pages.").

## UI

In `TemplatesRoute.tsx`, the existing `.template-apply-row` block becomes:

- A wrapper that gets a `dirty` modifier class when `showCallout` (=
  `dirty && usedByCount > 0`) is true.
- When `showCallout`, an explanatory message line precedes the button:
  "● You changed this type's rows. Existing pages keep their old rows until you
  apply."
- The single Apply button (label with count) and a hint span ("Filled-in values
  are kept." when used; "No pages use this type yet." when not; or the success
  `note` after applying).

`src/index.css`: add a `.template-apply-row.dirty` rule (and a child message
class) — a highlighted background/border + accent to draw the eye. No other
style changes.

No data-layer change: `applyTemplateToPages`, `applyTemplate`, and
`pagesUsingTemplate` are untouched.

## Testing

`src/routes/TemplatesRoute.test.tsx` (new), using `@testing-library/react` +
`MemoryRouter`, `afterEach(cleanup)` (live-query convention), and a seeded DB:

1. Seed one template (built-in or custom) plus 2 pages whose
   `infobox.template` is that type. Render the route.
2. **Initially quiet:** the dirty callout message is not present.
3. **Appears on edit:** fire a `change` on a row's label input (or click "＋ Add
   field"); assert the callout message ("You changed this type's rows") appears
   and the button reads "Apply to 2 existing pages".
4. **Collapses on apply:** click the apply button; assert (await) the callout
   message disappears and the success note ("Updated 2 pages") shows.

## Out of scope

- Automatic propagation on template edit (explicitly rejected: constant
  rewrites + would clobber per-page hand-added fields).
- Any change to how `applyTemplate` merges rows/values.
- Surfacing the prompt anywhere outside `/templates` (e.g. on the page itself).
