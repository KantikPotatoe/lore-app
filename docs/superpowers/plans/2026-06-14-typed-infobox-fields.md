# Typed Infobox Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let infobox fields be typed as plain text, a number, or a strictly-bound page reference (search + create pages of a target type, multiple per field), configured per field in the Templates screen.

**Architecture:** Field type is declared on the template (`TemplateItem`) and carried onto each page's `InfoboxField`. Reference values are stored as `[[Title]]` wiki-link tokens in the field's existing `value` string, so backlinks (`linkedTitles`/`getBacklinks`) and the relationship graph (`buildGraphData`) keep working with no changes. Only the infobox *edit* path and the template editor branch on field type; view mode is unchanged because `WikiText` already renders `[[Title]]` tokens.

**Tech Stack:** React + TypeScript, Dexie (IndexedDB) via `dexie-react-hooks` (`useLiveQuery`), Vite.

**Note on testing:** This project has no automated test framework (per CLAUDE.md). "Verify" steps are manual checks in the dev server (`npm run dev`, port 5174) plus `npm run build` for type-checking. Run `npm run build` after data-layer changes to catch type errors early.

---

## File Structure

- `src/db.ts` — **Modify.** Add `FieldType`, extend `InfoboxField` and `TemplateItem`, add `parseRefTitles`/`serializeRefTitles`, carry type props through `itemsToFields`/`applyTemplate`, set built-in bindings in `BUILTIN_TEMPLATES`.
- `src/components/RefField.tsx` — **Create.** The reference picker (chips + type-filtered search + inline create).
- `src/components/Infobox.tsx` — **Modify.** Per-field editor branches on `fieldType` (text / number / ref).
- `src/routes/TemplatesRoute.tsx` — **Modify.** Per-field type selector + target-type dropdown.
- `src/index.css` (or the project's stylesheet) — **Modify.** Styles for ref chips and the picker dropdown. Confirm the actual stylesheet path before editing (search for `infobox-row`).

---

## Task 1: Data model — field type props and ref-token helpers

**Files:**
- Modify: `src/db.ts`

- [ ] **Step 1: Add the `FieldType` union and extend `InfoboxField`**

In `src/db.ts`, replace the `InfoboxField` interface (currently lines ~13-18) with:

```ts
/** The kind of an infobox field. Absent ⇒ 'text' (so older data stays valid). */
export type FieldType = 'text' | 'ref' | 'number'

/** One row of an infobox.
 *  Normally a labelled piece of information (label + value). When `kind` is
 *  'separator' the row is instead a full-width section heading: `label` holds
 *  the heading text and `value` is unused.
 *  `fieldType` makes a field typed: 'ref' fields store one or more `[[Title]]`
 *  tokens in `value` and are bound to `refType` (a page-type name); 'number'
 *  fields store a numeric string in `value`. */
export interface InfoboxField {
  id: string
  label: string
  value: string
  kind?: 'separator'
  fieldType?: FieldType
  refType?: string
}
```

- [ ] **Step 2: Extend `TemplateItem`**

Replace the `TemplateItem` interface (currently lines ~143-146) with:

```ts
/** One row in a template: a field, or a separator (`separator: true`).
 *  A field may declare a `fieldType`; 'ref' fields also carry a `refType`
 *  (the name of the page-type whose pages the field links to). */
export interface TemplateItem {
  label: string
  separator?: boolean
  fieldType?: FieldType
  refType?: string
}
```

- [ ] **Step 3: Add ref-token parse/serialise helpers**

Add near the `WIKILINK_RE` definition area (these reuse the existing `[[…]]` convention). Place after the `applyTemplate` function (around line ~342) so they're exported alongside other infobox helpers:

```ts
/** Parse a ref field's value ("[[A]] [[B]]") into an ordered list of titles. */
export function parseRefTitles(value: string): string[] {
  const out: string[] = []
  for (const m of value.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const t = m[1].trim()
    if (t) out.push(t)
  }
  return out
}

/** Serialise a list of titles back into a ref field value ("[[A]] [[B]]"). */
export function serializeRefTitles(titles: string[]): string {
  return titles.map((t) => `[[${t.trim()}]]`).filter((s) => s !== '[[]]').join(' ')
}
```

- [ ] **Step 4: Carry type props through `itemsToFields`**

Replace `itemsToFields` (currently lines ~275-281) with:

```ts
/** Turn template rows into fresh infobox fields (new ids each time). */
function itemsToFields(items: TemplateItem[]): InfoboxField[] {
  return items.map((it) =>
    it.separator
      ? { id: crypto.randomUUID(), label: it.label, value: '', kind: 'separator' as const }
      : { id: crypto.randomUUID(), label: it.label, value: '', fieldType: it.fieldType ?? 'text', refType: it.refType },
  )
}
```

- [ ] **Step 5: Carry type props through `applyTemplate`**

In `applyTemplate` (currently lines ~332-342), the template is the source of truth for a field's type. Replace the non-separator branch so it sets `fieldType`/`refType` from the template item while preserving the entered value:

```ts
export function applyTemplate(box: Infobox, tpl: InfoboxTemplate): Infobox {
  const byLabel = new Map(
    box.fields.filter((fld) => fld.kind !== 'separator').map((fld) => [fld.label.toLowerCase(), fld]),
  )
  const fields: InfoboxField[] = tpl.items.map((it) => {
    if (it.separator) return { id: crypto.randomUUID(), label: it.label, value: '', kind: 'separator' as const }
    const existing = byLabel.get(it.label.toLowerCase())
    return {
      id: existing?.id ?? crypto.randomUUID(),
      label: it.label,
      value: existing?.value ?? '',
      fieldType: it.fieldType ?? 'text',
      refType: it.refType,
    }
  })
  return { ...box, template: tpl.name, fields }
}
```

- [ ] **Step 6: Type-check**

Run: `npm run build`
Expected: PASS (no type errors). `dist/` is produced.

- [ ] **Step 7: Commit**

```bash
git add src/db.ts
git commit -m "feat(db): typed infobox fields data model and ref-token helpers"
```

---

## Task 2: Built-in template bindings

**Files:**
- Modify: `src/db.ts`

- [ ] **Step 1: Add typed-row helper constructors**

Just below the existing `sep`/`f` helpers (currently lines ~157-159), add ref/number constructors:

```ts
const ref = (label: string, refType: string): TemplateItem => ({ label, fieldType: 'ref', refType })
const num = (label: string): TemplateItem => ({ label, fieldType: 'number' })
```

- [ ] **Step 2: Apply bindings to built-in templates**

Edit `BUILTIN_TEMPLATES` (lines ~163-272), changing only the rows below to typed constructors. Leave all other rows, separators, ids, names, and colours exactly as they are.

- Character: `f('Species')`→`ref('Species', 'Species')`, `f('Age')`→`num('Age')`, `f('Affiliation')`→`ref('Affiliation', 'Organization')`.
- Country: `f('Capital')`→`ref('Capital', 'Settlement')`, `f('Ruler')`→`ref('Ruler', 'Character')`, `f('Population')`→`num('Population')`, `f('Languages')`→`ref('Languages', 'Language')`.
- Deity: `f('Pantheon')`→`ref('Pantheon', 'Religion')`.
- Item: `f('Owner')`→`ref('Owner', 'Character')`, `f('Creator')`→`ref('Creator', 'Character')`, `f('Material')`→`ref('Material', 'Material')`.
- Organization: `f('Leader')`→`ref('Leader', 'Character')`, `f('Members')`→`num('Members')`, `f('Allies')`→`ref('Allies', 'Organization')`, `f('Rivals')`→`ref('Rivals', 'Organization')`.
- Religion: `f('Deities')`→`ref('Deities', 'Deity')`, `f('Founder')`→`ref('Founder', 'Character')`.
- Species: `f('Lifespan')`→`num('Lifespan')`.
- Settlement: `f('Region')`→`ref('Region', 'Geography')`, `f('Population')`→`num('Population')`, `f('Ruler')`→`ref('Ruler', 'Character')`.
- Conflict: `f('Belligerents')`→`ref('Belligerents', 'Organization')`, `f('Commanders')`→`ref('Commanders', 'Character')`.
- Document: `f('Author')`→`ref('Author', 'Character')`, `f('Language')`→`ref('Language', 'Language')`.
- Culture: `f('Language')`→`ref('Language', 'Language')`, `f('Religion')`→`ref('Religion', 'Religion')`.
- Technology: `f('Inventor')`→`ref('Inventor', 'Character')`.
- Tradition: `f('Culture')`→`ref('Culture', 'Culture')`.
- Spell: `f('Caster')`→`ref('Caster', 'Character')`.

Leave Geography, Condition, Language, Material, Myth templates as-is (no obvious cross-type refs).

- [ ] **Step 2b: Bump the export version comment is not required**

No action — `exportAll` already serialises whole template objects, so the new props round-trip automatically. (This step is a reminder, not a change.)

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verify in dev server**

Run: `npm run dev` (port 5174). Because `seedTemplates` does not overwrite existing built-in rows, an existing local DB will keep old untyped rows. To see the new bindings: open the Templates screen, select Character, click **↺ Reset**, and confirm Affiliation/Species/Age now exist (typing UI lands in Task 4). Fresh databases get the bindings automatically.
Expected: No console errors; Character template loads.

- [ ] **Step 5: Commit**

```bash
git add src/db.ts
git commit -m "feat(db): sensible field-type bindings on built-in templates"
```

---

## Task 3: Reference picker component

**Files:**
- Create: `src/components/RefField.tsx`

- [ ] **Step 1: Create `RefField.tsx`**

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPage, parseRefTitles, serializeRefTitles } from '../db'

interface Props {
  /** Current field value, e.g. "[[Iron Guild]] [[Free Companies]]". */
  value: string
  /** Page-type name this field links to; only pages of this type are offered. */
  refType: string
  onChange: (value: string) => void
}

/** Edit-mode picker for a typed page-reference field. Shows linked pages as
 *  removable chips and a search box that offers only pages whose category is
 *  `refType`, with an inline "create new page of this type" option. */
export default function RefField({ value, refType, onChange }: Props) {
  const [query, setQuery] = useState('')
  const titles = parseRefTitles(value)
  const lowerTitles = new Set(titles.map((t) => t.toLowerCase()))

  // Pages of the bound type, reactive to DB changes.
  const candidates = useLiveQuery(
    () => db.pages.where('category').equals(refType).toArray(),
    [refType],
  ) ?? []

  const q = query.trim().toLowerCase()
  const matches = q
    ? candidates
        .filter((p) => p.title.toLowerCase().includes(q) && !lowerTitles.has(p.title.toLowerCase()))
        .slice(0, 8)
    : []
  const exactExists =
    !!q && candidates.some((p) => p.title.toLowerCase() === q)

  function addTitle(title: string) {
    if (lowerTitles.has(title.toLowerCase())) return
    onChange(serializeRefTitles([...titles, title]))
    setQuery('')
  }

  function removeTitle(title: string) {
    onChange(serializeRefTitles(titles.filter((t) => t !== title)))
  }

  async function createAndAdd() {
    const title = query.trim()
    if (!title) return
    await createPage({ title, category: refType })
    addTitle(title)
  }

  return (
    <div className="ref-field">
      <div className="ref-chips">
        {titles.map((t) => (
          <span key={t} className="ref-chip">
            {t}
            <button className="tag-x" title="Remove" onClick={() => removeTitle(t)}>×</button>
          </span>
        ))}
      </div>
      <div className="ref-search">
        <input
          className="infobox-value-input"
          placeholder={`Add ${refType}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {q && (
          <div className="ref-results">
            {matches.map((p) => (
              <button key={p.id} className="ref-result" onClick={() => addTitle(p.title)}>
                {p.title}
              </button>
            ))}
            {!exactExists && (
              <button className="ref-result ref-create" onClick={createAndAdd}>
                ＋ Create “{query.trim()}” as {refType}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: PASS. (`category` is an index on `db.pages`, so `.where('category')` is valid.)

- [ ] **Step 3: Commit**

```bash
git add src/components/RefField.tsx
git commit -m "feat: reference picker component for typed infobox fields"
```

---

## Task 4: Infobox edit UI branches on field type

**Files:**
- Modify: `src/components/Infobox.tsx`

- [ ] **Step 1: Import `RefField`**

At the top of `src/components/Infobox.tsx`, add to the imports:

```tsx
import RefField from './RefField'
```

- [ ] **Step 2: Branch the editable field row on `fieldType`**

In the `editable` branch of the fields map (currently lines ~131-146, the non-separator `else` case), replace the single value `<input>` with a per-type editor. Replace this block:

```tsx
              ) : (
                <div key={fld.id} className="infobox-row editing">
                  <input
                    className="infobox-label-input"
                    value={fld.label}
                    onChange={(e) => setField(fld.id, { label: e.target.value })}
                  />
                  <input
                    className="infobox-value-input"
                    placeholder="value…"
                    value={fld.value}
                    onChange={(e) => setField(fld.id, { value: e.target.value })}
                  />
                  <button className="tag-x" title="Remove field" onClick={() => removeField(fld.id)}>×</button>
                </div>
              ),
```

with:

```tsx
              ) : (
                <div key={fld.id} className="infobox-row editing">
                  <input
                    className="infobox-label-input"
                    value={fld.label}
                    onChange={(e) => setField(fld.id, { label: e.target.value })}
                  />
                  {fld.fieldType === 'ref' && fld.refType ? (
                    <RefField
                      value={fld.value}
                      refType={fld.refType}
                      onChange={(value) => setField(fld.id, { value })}
                    />
                  ) : fld.fieldType === 'number' ? (
                    <input
                      className="infobox-value-input"
                      type="number"
                      placeholder="number…"
                      value={fld.value}
                      onChange={(e) => setField(fld.id, { value: e.target.value })}
                    />
                  ) : (
                    <input
                      className="infobox-value-input"
                      placeholder="value…"
                      value={fld.value}
                      onChange={(e) => setField(fld.id, { value: e.target.value })}
                    />
                  )}
                  <button className="tag-x" title="Remove field" onClick={() => removeField(fld.id)}>×</button>
                </div>
              ),
```

(View mode is unchanged: ref values are `[[Title]]` tokens already rendered by `WikiText`; numbers render as plain text.)

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verify**

Run: `npm run dev`. On a Character page (after resetting the Character template in Task 2, or on a fresh page created as Character), enter edit mode:
- Affiliation shows the chip picker; type an Organization name and either pick an existing one or create it. Confirm a chip appears.
- Age shows a number input.
- Switch to view mode: Affiliation entries render as clickable wiki links; the linked Organization page's Backlinks list now includes this character.
Expected: All of the above; no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/Infobox.tsx
git commit -m "feat(infobox): edit fields by type (ref picker, number input)"
```

---

## Task 5: Template editor — choose field type and target type

**Files:**
- Modify: `src/routes/TemplatesRoute.tsx`

- [ ] **Step 1: Add the field-type selector and target-type dropdown to each field row**

In `src/routes/TemplatesRoute.tsx`, the item row currently shows a static kind label
(`<span className="template-item-kind">…</span>`, lines ~144-159). For non-separator
items, replace that static span with a type `<select>` plus a conditional ref-target
`<select>`. Replace this block:

```tsx
              {selected.items.map((it, i) => (
                <div key={i} className={it.separator ? 'template-item separator' : 'template-item'}>
                  <div className="template-item-move">
                    <button className="tag-x" title="Move up" disabled={i === 0} onClick={() => moveItem(i, -1)}>▲</button>
                    <button className="tag-x" title="Move down" disabled={i === selected.items.length - 1} onClick={() => moveItem(i, 1)}>▼</button>
                  </div>
                  <input
                    className="template-item-label"
                    value={it.label}
                    placeholder={it.separator ? 'Section heading…' : 'Field label…'}
                    onChange={(e) => setItem(i, { label: e.target.value })}
                  />
                  <span className="template-item-kind">{it.separator ? 'separator' : 'field'}</span>
                  <button className="tag-x" title="Remove row" onClick={() => removeItem(i)}>×</button>
                </div>
              ))}
```

with:

```tsx
              {selected.items.map((it, i) => (
                <div key={i} className={it.separator ? 'template-item separator' : 'template-item'}>
                  <div className="template-item-move">
                    <button className="tag-x" title="Move up" disabled={i === 0} onClick={() => moveItem(i, -1)}>▲</button>
                    <button className="tag-x" title="Move down" disabled={i === selected.items.length - 1} onClick={() => moveItem(i, 1)}>▼</button>
                  </div>
                  <input
                    className="template-item-label"
                    value={it.label}
                    placeholder={it.separator ? 'Section heading…' : 'Field label…'}
                    onChange={(e) => setItem(i, { label: e.target.value })}
                  />
                  {it.separator ? (
                    <span className="template-item-kind">separator</span>
                  ) : (
                    <>
                      <select
                        className="template-item-type"
                        value={it.fieldType ?? 'text'}
                        onChange={(e) => {
                          const ft = e.target.value as 'text' | 'ref' | 'number'
                          setItem(i, {
                            fieldType: ft,
                            // Default a ref's target to the first template; clear it otherwise.
                            refType: ft === 'ref' ? (it.refType ?? templates[0]?.name) : undefined,
                          })
                        }}
                      >
                        <option value="text">text</option>
                        <option value="ref">page link</option>
                        <option value="number">number</option>
                      </select>
                      {it.fieldType === 'ref' && (
                        <select
                          className="template-item-reftype"
                          value={it.refType ?? ''}
                          onChange={(e) => setItem(i, { refType: e.target.value })}
                        >
                          {templates.map((t) => (
                            <option key={t.id} value={t.name}>{t.name}</option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                  <button className="tag-x" title="Remove row" onClick={() => removeItem(i)}>×</button>
                </div>
              ))}
```

Note: `templates` is already available in this component (`useLiveQuery(... db.templates ...)`), confirmed non-null by the early `if (!templates) return …` guard at the top of the component.

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual verify**

Run: `npm run dev`, open Templates. Select any template, set a field's type to "page link", and confirm a second dropdown appears listing all type names. Pick one. Click **Apply to existing pages** and confirm pages of that type now show the typed editor for that field (open one in edit mode).
Expected: Type + target selectors work; applying pushes types to existing pages (values preserved).

- [ ] **Step 4: Commit**

```bash
git add src/routes/TemplatesRoute.tsx
git commit -m "feat(templates): configure field type and ref target per row"
```

---

## Task 6: Styles for chips and picker

**Files:**
- Modify: the project stylesheet (find it first)

- [ ] **Step 1: Locate the stylesheet**

Run a search for an existing infobox style to find the file:
Run: `rg -l "infobox-row" src`
Expected: one CSS file path (e.g. `src/index.css`). Use that path below.

- [ ] **Step 2: Add styles**

Append to that stylesheet:

```css
/* Typed reference field (infobox edit mode) */
.ref-field { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.ref-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.ref-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 4px 1px 8px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.08); font-size: 0.85em;
}
.ref-search { position: relative; }
.ref-results {
  position: absolute; z-index: 20; top: 100%; left: 0; right: 0;
  display: flex; flex-direction: column;
  background: #2a2a2a; border: 1px solid #444; border-radius: 6px;
  margin-top: 2px; max-height: 220px; overflow-y: auto;
}
.ref-result {
  text-align: left; padding: 6px 8px; background: none; border: none;
  color: inherit; cursor: pointer;
}
.ref-result:hover { background: rgba(255, 255, 255, 0.08); }
.ref-create { font-style: italic; opacity: 0.85; border-top: 1px solid #444; }

/* Template editor: field type selectors */
.template-item-type, .template-item-reftype { font-size: 0.85em; }
```

Adjust the dark-mode colour literals to match the project's existing palette if it uses
CSS variables (check neighbouring rules in the same file and prefer existing variables
like `var(--…)` over hard-coded hex when present).

- [ ] **Step 3: Manual verify**

Run: `npm run dev`. Confirm chips, the dropdown, and the template type selectors look
consistent with the rest of the UI (no unstyled white boxes, dropdown sits above other
content).
Expected: Reasonable styling.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "style: ref field chips/picker and template type selectors"
```

---

## Task 7: Full manual regression pass

**Files:** none (verification only)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 2: End-to-end check** (`npm run dev`)

Verify each spec acceptance check:
1. Character template (after Reset) shows Affiliation = page link → Organization, Age = number.
2. On a Character page, add two Organizations to Affiliation including one created inline; both render as links in view mode and appear in those Organizations' Backlinks.
3. The newly created Organization appears in the relationship graph connected to the character (`/` → graph, or wherever the graph renders).
4. Age accepts and persists a number.
5. A page created before this change (untyped fields) still loads and edits as plain text.
6. Export a backup (Home → backup), then import it; confirm typed fields and bindings round-trip (`fieldType`/`refType` present after import).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS (fix any new warnings/errors introduced by these changes).

- [ ] **Step 4: Update CLAUDE.md docs**

In `CLAUDE.md`, in the data-layer section describing `InfoboxField`/`InfoboxTemplate`,
add one sentence noting fields can be typed (`fieldType: 'text' | 'ref' | 'number'`,
with `refType` naming the bound page-type for refs; ref values are stored as `[[Title]]`
tokens so backlinks/graph are unaffected). Keep it concise and consistent with the
existing prose.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: note typed infobox fields in CLAUDE.md"
```

---

## Self-Review notes

- **Spec coverage:** text/ref/number types (Tasks 1,3,4) ✓; strict ref binding to a type (Task 3 filters by `category === refType`, create uses `refType`) ✓; multiple refs per field (Task 1 token list + Task 3 chips) ✓; configurable per field in templates (Task 5) ✓; `[[Title]]` storage so backlinks/graph unchanged (Task 1, verified Task 7 steps 2-3) ✓; built-in bindings (Task 2) ✓; no schema bump / backward compat (Task 1 optional props, verified Task 7 step 5) ✓; export/import round-trip (verified Task 7 step 6) ✓; number kept simple (Task 4) ✓.
- **Type consistency:** `parseRefTitles`/`serializeRefTitles`, `FieldType`, `fieldType`/`refType` names are used identically across db.ts, RefField.tsx, Infobox.tsx, TemplatesRoute.tsx.
- **Placeholders:** none — every code step shows full code.
