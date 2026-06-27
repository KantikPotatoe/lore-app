# Optional default sections per page type — design

**Issue:** #89 · Roadmap "Structure → Optional default sections" (#4)
**Date:** 2026-06-28

## Summary

Let each page type (an `InfoboxTemplate`) declare an ordered list of **body
section names** (e.g. Character → Appearance / Personality / Background). When
authoring a page, an explicit **"＋ Sections"** button in the editor toolbar
drops every section for that page's type into the body as `<h2>` headings, each
followed by an empty paragraph. Sections are optional and only ever inserted on
demand — never forced onto a page, never pushed retroactively.

This extends the existing templates system, which today only seeds the infobox.

## Decisions (settled during brainstorming)

1. **Trigger:** manual "Add sections" button. Body stays empty on page creation;
   sections appear only when the author clicks. (Not auto-seeded.)
2. **Insert mode:** insert *all* of the type's sections at once. One click; the
   author deletes any they don't want.
3. **Markup per section:** an `<h2>` with the section name, followed by an empty
   `<p>` so the cursor lands ready to type. Sections show in the TOC.
4. **Built-ins:** ship curated default sections for each built-in page type;
   editable/removable on the Templates screen; backfilled onto existing
   built-ins the way icons/colours already are.
5. **Placement / mechanics:** the button lives in `LoreEditor`'s toolbar and
   inserts via the live Tiptap editor (`insertContent`), so it shows instantly
   and is undoable. (Rejected: rewriting `content` from `PageRoute`, which the
   `key={id}` editor wouldn't re-read; and auto-seeding in `createPage`.)

## 1. Data model

Add one optional field to `InfoboxTemplate` (`src/db/types.ts`):

```ts
export interface InfoboxTemplate {
  id: string
  name: string
  color: string
  icon?: string
  items: TemplateItem[]
  sections?: string[]   // NEW — ordered body-section names; absent ⇒ none yet
  builtin: boolean
}
```

A section is just a heading label, so a plain `string[]` suffices — no new
interface. The field is **optional** so all existing rows stay valid:

- `undefined` = "never set" → eligible for built-in backfill.
- `[]` = "user cleared it" → left alone.

This mirrors how `icon` distinguishes missing-vs-set.

## 2. Authoring sections — Templates screen

In `src/routes/TemplatesRoute.tsx`, add a **"Body sections"** block to the
selected template's editor, below the infobox-rows block. It mirrors the rows
editor but simpler (sections are bare labels):

- A list of the type's section names. Each row: a text input (rename), ▲/▼
  reorder buttons, and a × remove button.
- A **"＋ Add section"** button appends a blank section.
- All edits call `updateTemplate(id, { sections })` — the same live-save pattern
  already used for `items`.
- Empty hint when none: *"No starter sections yet. Add sections an author can
  drop into the body."*
- This block does **not** participate in the existing "Apply to N pages" flow
  (that remains infobox-only — sections are inserted per-page on demand, never
  retroactively pushed). A one-line note states this.

The screen's intro paragraph gains a short clause mentioning body sections.

## 3. Insertion — `LoreEditor` + `PageRoute`

### `src/components/LoreEditor.tsx`

- New prop `starterSections?: string[]`.
- New toolbar button **"＋ Sections"**, rendered only when
  `editable && starterSections?.length`, placed in the insert cluster (near
  image / table / citation).
- A small **pure helper** builds the node array (extracted so it's unit-testable
  without mounting Tiptap):

```ts
export function sectionNodes(names: string[]) {
  return names
    .map((n) => n.trim())
    .filter(Boolean)
    .flatMap((name) => [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: name }] },
      { type: 'paragraph' },
    ])
}
```

- On click: `editor.chain().focus().insertContent(sectionNodes(starterSections)).run()`.
- Inserts at the current selection. On a fresh page the cursor sits in the empty
  opening paragraph, so sections land at the top — the normal case. Insertion
  flows through `onUpdate` → `onChange`, so it saves and is undoable like any
  edit. Clicking twice inserts twice — acceptable for "insert all at once"; the
  author manages duplicates.
- Section names are inserted as **text nodes**, never raw HTML — no injection
  surface; `<h2>` is already in the sanitize whitelist and the TOC scan.

### `src/routes/PageRoute.tsx`

- Pass `starterSections={templates.find((t) => t.name === page.category)?.sections}`
  to `<LoreEditor>`.

## 4. Curated defaults + backfill

### Shipped section lists

Author a `sections` array on each `BUILTIN_TEMPLATES` entry (`src/db/templates.ts`).
A separate `BUILTIN_SECTIONS: Record<string, string[]>` map keyed by type name
keeps backfill simple and parallels `BUILTIN_ICONS`. Draft set (finalized during
implementation):

- **Character** → Appearance · Personality · Background · History · Relationships
- **Country / Settlement** → History · Geography · Government · Culture · Economy
- **Deity / Religion** → Beliefs · Worship · Mythology · History
- **Species** → Biology · Behaviour · Habitat · Culture
- **Organization** → History · Structure · Activities · Members
- **Geography** → Description · Climate · Flora & Fauna · History
- **Conflict** → Background · Course · Aftermath
- Remaining types (Item, Document, Culture, Language, Material, Myth,
  Technology, Tradition, Spell, Condition) get a small, sensible set, finalized
  in the plan.

### Backfill

In `seedTemplates()`, mirroring the icon backfill and inside the existing rw
transaction:

```ts
const needSections = afterSeed.filter(
  (t) => t.builtin && t.sections === undefined && BUILTIN_SECTIONS[t.name],
)
await Promise.all(
  needSections.map((t) => db.templates.update(t.id, { sections: BUILTIN_SECTIONS[t.name] })),
)
```

Only touches built-ins that have **never** had sections set (`=== undefined`); a
user who cleared a built-in's sections to `[]` is left alone. `resetTemplate()`
restores the shipped `sections` alongside rows / colour / icon.

## 5. Backup, export & testing

### Backup / versioning

`sections` is additive and optional, so **no** `CURRENT_SCHEMA_VERSION` bump or
`MIGRATIONS` step is required:

- Old backups lack `sections` on templates → `undefined` → built-ins are
  backfilled by `seedTemplates()` on next start; custom types simply have none.
  Both are valid.
- New backups carry `sections`; `importAll()` round-trips the whole
  `InfoboxTemplate` object, so the array rides along.
- Confirm during implementation that `importAll` does not strip unknown/extra
  template fields (it coerces tables to arrays defensively but should preserve
  object shape).

### HTML export

No change — inserted sections are ordinary `<h2>` in the body, already handled by
`exportAsHtml`.

### Testing

- `templates.test.ts`: `seedTemplates()` backfills `sections` on a built-in with
  `undefined`; leaves `[]` alone; `resetTemplate()` restores shipped sections.
- `sectionNodes()` unit test: `string[]` → heading+paragraph node array; trims
  and drops empty/whitespace names.
- `barrel.test.ts`: only if a new public symbol is exported from `src/db`
  (likely `BUILTIN_SECTIONS`); re-export from `index.ts` if so.
- Manual: create a Character page → ＋ Sections → headings appear, TOC populates;
  button is hidden for a type with no sections.

## Out of scope

- Auto-seeding sections on page creation or type switch (explicitly rejected).
- Per-section placeholder/prompt text (chose plain heading + empty paragraph).
- Pushing section changes to existing pages (sections are per-page, on demand).
