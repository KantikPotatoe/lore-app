# Typed infobox fields — design

**Date:** 2026-06-14
**Status:** Approved (pending spec review)

## Problem

Infobox fields are free text today. Some fields are conceptually references to other
pages of a specific type — e.g. a Character's *Affiliation* is one or more
*Organization* pages. We want fields to optionally be **typed**:

- **text** — today's behaviour (free text, supports `[[links]]`).
- **page reference** — bound to a target page-type; the user searches existing pages
  of that type and can create a new page of that type inline. A field may link to
  **multiple** pages.
- **number** — a numeric value.

Field type is declared by the **template** (the page type), and is configurable per
field in the Templates screen. Bindings are **strict**: a reference field's picker
only offers pages of its bound type, and "Create new" always creates that type.

## Key decision — store references as `[[Title]]` tokens (Approach A)

A reference field continues to store its value as wiki-link tokens
(e.g. `[[Iron Guild]] [[Free Companies]]`), just produced by a constrained picker
instead of free typing. The whole app already links **by title**:
`getOrCreatePageByTitle`, `getBacklinks`/`linkedTitles`, and `buildGraphData` all
resolve titles. So reference fields automatically feed backlinks and the
relationship graph with **zero changes** to those systems.

Trade-off: like all wiki links in this app, a reference is title-based, so renaming a
target page can orphan the link — identical to `[[link]]` behaviour today, so it is
consistent, not a regression.

(Rejected: storing references by page id. Survives renames, but makes reference fields
an island that must be special-cased in `linkedTitles`, backlinks, and the graph —
more code, more migration risk, inconsistent with the rest of the app.)

## Data model (`src/db.ts`)

Add the field-type as a string literal union:

```ts
export type FieldType = 'text' | 'ref' | 'number'
```

`InfoboxField` gains two optional properties:

```ts
export interface InfoboxField {
  id: string
  label: string
  value: string
  kind?: 'separator'
  fieldType?: FieldType   // absent ⇒ 'text'
  refType?: string        // bound page-type name; only meaningful when fieldType === 'ref'
}
```

`TemplateItem` gains the same optional properties so a type can declare a field's kind:

```ts
export interface TemplateItem {
  label: string
  separator?: boolean
  fieldType?: FieldType
  refType?: string
}
```

Notes:
- Absent `fieldType` means `'text'`. All existing fields/templates/pages remain valid;
  **no Dexie schema version bump** is needed (these are optional properties on stored
  objects, not new indexes).
- For a `ref` field, `value` holds an ordered, space-separated list of `[[Title]]`
  tokens. For a `number` field, `value` holds the number as a plain string.

Functions to update so the new props flow through:
- `itemsToFields(items)` — copy `fieldType`/`refType` onto produced fields.
- `applyTemplate(box, tpl)` — when rebuilding rows from a template, set each field's
  `fieldType`/`refType` from the template item (the template is the source of truth for
  type), while still preserving the entered `value` by matching label.
- `BUILTIN_TEMPLATES` — set sensible bindings (see below). Because `resetTemplate`
  restores from `BUILTIN_TEMPLATES`, these ship automatically; existing users keep
  their edits and can opt in by resetting or editing a template.

A small helper to parse/serialise a ref field's title list:

```ts
// "[[A]] [[B]]" <-> ["A", "B"]
export function parseRefTitles(value: string): string[]
export function serializeRefTitles(titles: string[]): string
```

These reuse the existing `[[…]]` regex convention already used by `linkedTitles` and
`WikiText`.

## Reference picker — new component `src/components/RefField.tsx`

Props: the current `value` string, the `refType` (bound page-type name), and an
`onChange(value)` callback. Used only in the infobox **edit** view.

Behaviour:
- Renders current linked pages as removable chips (parsed via `parseRefTitles`).
- A search input filters pages where `category === refType` and the title matches the
  query (case-insensitive), via `useLiveQuery`.
- Clicking a match appends its `[[Title]]` to the value (dedup — ignore if already
  present).
- If the query is non-empty and has no exact title match among that type, show a
  "**＋ Create "&lt;query&gt;" as &lt;refType&gt;**" row that calls
  `createPage({ title: query, category: refType })`, then links the new title.
- Removing a chip removes that `[[Title]]` token from the value.

The picker never offers pages of other types and never offers free text — bindings are
strict.

## Infobox edit UI (`src/components/Infobox.tsx`)

The per-field **editor** switches on `fieldType` (default `'text'`):

- `text` → existing text `<input class="infobox-value-input">`.
- `number` → `<input type="number">` writing the raw value.
- `ref` → `<RefField value refType onChange>`.

The label input is unchanged for all three. Field **type is not editable here** — it is
a property of the template — so the per-page editor only *respects* the field's type.

`addField()` continues to create a plain `text` field (no type). Separators unchanged.

**View mode is unchanged**: `ref` values are `[[Title]]` tokens already rendered by
`WikiText` as clickable links; `number` and `text` render as plain text via `WikiText`.
So only the edit path branches on type. `dropEmptySeparators` / `filledFields` logic is
untouched (a ref/number field with empty `value` is treated as empty exactly like text).

## Template editor (`src/routes/TemplatesRoute.tsx`)

Each non-separator field row gains a **type selector** (text / page-ref / number),
bound to the item's `fieldType`. When set to `ref`, a second dropdown appears listing
all template names to pick the **target type** (`refType`); it defaults to the first
template if none chosen. Changing type away from `ref` clears `refType`.

`setItem` already does a partial patch, so wiring the two new controls is a matter of
adding them to the row and persisting via `commitItems`.

`applyTemplateToPages` / `applyTemplate` already preserve values by label; with the
`applyTemplate` change above they will also push the field's `fieldType`/`refType` onto
each page's matching field, so retyping a field in a template and re-applying updates
existing pages.

## Built-in bindings (`BUILTIN_TEMPLATES`)

Assign reasonable types across the shipped templates, e.g.:

- **Character**: `Species` → ref(Species), `Age` → number, `Affiliation` → ref(Organization),
  `Occupation` → text.
- **Organization**: `Leader` → ref(Character), `Allies` → ref(Organization),
  `Rivals` → ref(Organization), `Members` → number.
- **Country**: `Ruler` → ref(Character), `Capital` → ref(Settlement),
  `Population` → number, `Languages` → ref(Language).
- **Settlement**: `Region` → ref(Geography), `Ruler` → ref(Character),
  `Population` → number.
- Similar, obvious bindings for the rest (Deity pantheon/followers, Religion deities,
  Conflict belligerents/commanders, Spell caster, etc.).

These are starting points; users can edit them per template. Exact per-template mapping
is finalised during implementation, favouring fields whose target type clearly exists
among the shipped types.

## Number fields — scope

Kept simple: a numeric input, stored and displayed as the raw value. No units, no
formatting, no validation beyond the browser's numeric input. Can be extended later.

## Out of scope

- Reference-by-id / rename-safe links.
- Units, currency, or number formatting.
- Date field type (considered, deferred).
- Changing a field's type from the per-page infobox editor.

## Testing

No automated tests in this project (per CLAUDE.md). Manual verification:
1. Edit the Character template: confirm Affiliation shows ref(Organization), Age shows
   number.
2. On a Character page, add two Organizations to Affiliation via the picker, including
   one created inline; confirm both render as links in view mode and create backlinks on
   the Organization pages.
3. Confirm the new Organization appears in the relationship graph connected to the
   character.
4. Enter a value in an Age number field; confirm it saves and displays.
5. Confirm existing pages/templates created before this change still load and edit
   normally (untyped fields behave as text).
6. Export/import a backup round-trips the new field properties.
