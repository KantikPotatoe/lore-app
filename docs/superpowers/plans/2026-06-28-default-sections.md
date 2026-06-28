# Optional Default Sections Per Page Type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each page type (an `InfoboxTemplate`) declare starter body-section names that an author can insert into a page's body, all at once, via a "＋ Sections" button in the editor toolbar.

**Architecture:** Add an optional `sections?: string[]` to `InfoboxTemplate`. Ship curated defaults via a `BUILTIN_SECTIONS` map (mirroring `BUILTIN_ICONS`), backfilled in `seedTemplates()`. Authors edit a type's sections on the Templates screen. The page editor renders a toolbar button that inserts each section as an `<h2>` + empty `<p>` through the live Tiptap editor, using a pure `sectionNodes()` helper.

**Tech Stack:** TypeScript (strict), React, Dexie (IndexedDB), Tiptap, Vitest + happy-dom.

## Global Constraints

- TS `strict`; run `npm run lint`, `npm run build`, and `npm run test:run` before claiming done (CI runs all three).
- Data layer lives under `src/db/` behind the barrel `src/db/index.ts` (uses `export *`, so new exports from `templates.ts` are re-exported automatically). Always import from `'../db'`.
- New optional field only — **no** `CURRENT_SCHEMA_VERSION` bump and **no** `MIGRATIONS` step (`sections` is additive; old data reads as `undefined`).
- Section names are inserted as Tiptap **text nodes**, never raw HTML.
- PR gets a `version:minor` label (new feature).

---

### Task 1: `sectionNodes()` pure helper

Turns a list of section names into the Tiptap node array (`<h2>` + empty paragraph per name). Pure and standalone so it's unit-testable without mounting the editor.

**Files:**
- Create: `src/sectionNodes.ts`
- Test: `src/sectionNodes.test.ts`

**Interfaces:**
- Produces: `sectionNodes(names: string[]): JSONContent[]` — for each trimmed, non-empty name, a `{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: name }] }` followed by `{ type: 'paragraph' }`. Empty/whitespace names are dropped.

- [ ] **Step 1: Write the failing test**

```ts
// src/sectionNodes.test.ts
import { describe, it, expect } from 'vitest'
import { sectionNodes } from './sectionNodes'

describe('sectionNodes', () => {
  it('produces a heading + empty paragraph per name', () => {
    expect(sectionNodes(['Appearance', 'History'])).toEqual([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Appearance' }] },
      { type: 'paragraph' },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'History' }] },
      { type: 'paragraph' },
    ])
  })

  it('trims names and drops empty/whitespace ones', () => {
    expect(sectionNodes(['  Bio  ', '', '   '])).toEqual([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Bio' }] },
      { type: 'paragraph' },
    ])
  })

  it('returns an empty array for no names', () => {
    expect(sectionNodes([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/sectionNodes.test.ts`
Expected: FAIL — cannot find module `./sectionNodes`.

- [ ] **Step 3: Write the implementation**

```ts
// src/sectionNodes.ts
import type { JSONContent } from '@tiptap/core'

/** Turn starter-section names into Tiptap nodes: each non-empty (trimmed) name
 *  becomes an <h2> heading followed by an empty paragraph, so the author can
 *  drop a type's whole section skeleton into a page body and start typing under
 *  each heading. Names go in as text nodes — never raw HTML. */
export function sectionNodes(names: string[]): JSONContent[] {
  return names
    .map((n) => n.trim())
    .filter(Boolean)
    .flatMap((name) => [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: name }] },
      { type: 'paragraph' },
    ])
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/sectionNodes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sectionNodes.ts src/sectionNodes.test.ts
git commit -m "feat: sectionNodes helper turns section names into editor nodes (#89)"
```

---

### Task 2: Data model field, curated defaults & seed backfill

Add `sections?: string[]` to `InfoboxTemplate`, ship a `BUILTIN_SECTIONS` map, backfill it onto existing built-ins in `seedTemplates()`, and restore it in `resetTemplate()`.

**Files:**
- Modify: `src/db/types.ts` (the `InfoboxTemplate` interface)
- Modify: `src/db/templates.ts` (add `BUILTIN_SECTIONS`; backfill in `seedTemplates`; `resetTemplate`)
- Modify: `src/db/templates.test.ts` (new seed + structure tests)
- Modify: `src/db/barrel.test.ts` (assert `BUILTIN_SECTIONS` is re-exported)

**Interfaces:**
- Produces: `InfoboxTemplate.sections?: string[]` (absent ⇒ never set; `[]` ⇒ user cleared).
- Produces: `BUILTIN_SECTIONS: Record<string, string[]>` exported from `src/db/templates.ts` (re-exported via the barrel's `export *`).

- [ ] **Step 1: Add the type field**

In `src/db/types.ts`, add `sections?` to `InfoboxTemplate` (right after `items`):

```ts
export interface InfoboxTemplate {
  id: string
  name: string
  color: string // accent colour for this type's badges/dots
  icon?: string // optional emoji shown on map pins for this type
  items: TemplateItem[]
  sections?: string[] // ordered starter body-section names; absent ⇒ none set yet
  builtin: boolean // true for the shipped starter templates
}
```

- [ ] **Step 2: Write failing tests for the seed backfill and the map**

Add to `src/db/templates.test.ts`. First extend the import to include `BUILTIN_SECTIONS`:

```ts
import {
  db,
  applyTemplate,
  parseRefTitles,
  serializeRefTitles,
  seedTemplates,
  resetTemplate,
  BUILTIN_TEMPLATES,
  BUILTIN_ICONS,
  BUILTIN_SECTIONS,
  type Infobox,
  type InfoboxTemplate,
} from '../db'
```

Add these tests inside the existing `describe('seedTemplates', …)` block:

```ts
  it('backfills default sections on a built-in that has none, leaving a cleared [] alone', async () => {
    const a = BUILTIN_TEMPLATES.find((t) => BUILTIN_SECTIONS[t.name])!
    await db.templates.add({ ...a, sections: undefined })
    const b = BUILTIN_TEMPLATES.find((t) => t.id !== a.id && BUILTIN_SECTIONS[t.name])!
    await db.templates.add({ ...b, sections: [] }) // user deliberately cleared

    await seedTemplates()

    expect((await db.templates.get(a.id))!.sections).toEqual(BUILTIN_SECTIONS[a.name])
    expect((await db.templates.get(b.id))!.sections).toEqual([]) // untouched
  })

  it('resetTemplate restores the shipped sections', async () => {
    const a = BUILTIN_TEMPLATES.find((t) => BUILTIN_SECTIONS[t.name])!
    await db.templates.add({ ...a, sections: ['Junk'] })
    await resetTemplate(a.id)
    expect((await db.templates.get(a.id))!.sections).toEqual(BUILTIN_SECTIONS[a.name])
  })
```

Add a new structure describe block at the end of the file:

```ts
describe('BUILTIN_SECTIONS structure', () => {
  const typeNames = new Set(BUILTIN_TEMPLATES.map((t) => t.name))

  it('keys are all shipped built-in type names', () => {
    for (const name of Object.keys(BUILTIN_SECTIONS)) {
      expect(typeNames.has(name), `unknown type "${name}"`).toBe(true)
    }
  })

  it('every section name is non-empty and unique within its type', () => {
    for (const [name, secs] of Object.entries(BUILTIN_SECTIONS)) {
      expect(secs.length, `${name} has no sections`).toBeGreaterThan(0)
      for (const s of secs) expect(s.trim().length, `${name}`).toBeGreaterThan(0)
      expect(new Set(secs).size, `${name} has duplicate sections`).toBe(secs.length)
    }
  })
})
```

Also add to `src/db/barrel.test.ts`, in the `'re-exports the category/status/template constants'` test:

```ts
    expect(typeof db.BUILTIN_SECTIONS).toBe('object')
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:run -- src/db/templates.test.ts src/db/barrel.test.ts`
Expected: FAIL — `BUILTIN_SECTIONS` is undefined / not exported.

- [ ] **Step 4: Implement `BUILTIN_SECTIONS`, the backfill, and reset**

In `src/db/templates.ts`, add the map next to `BUILTIN_ICONS` (after the `BUILTIN_ICONS` declaration, before `BUILTIN_TEMPLATES`):

```ts
// Default starter body-sections for the shipped page types. Backfilled onto
// built-ins by seedTemplates() without overwriting a user's edits (mirrors the
// icon/colour backfill). A section becomes an <h2> heading in the page body when
// the author clicks "＋ Sections" in the editor.
export const BUILTIN_SECTIONS: Record<string, string[]> = {
  Character: ['Appearance', 'Personality', 'Background', 'History', 'Relationships'],
  Country: ['History', 'Geography', 'Government', 'Culture', 'Economy'],
  Deity: ['Description', 'Domains', 'Worship', 'Mythology'],
  Geography: ['Description', 'Climate', 'Flora & Fauna', 'History'],
  Item: ['Description', 'History', 'Powers'],
  Organization: ['History', 'Structure', 'Activities', 'Members'],
  Religion: ['Beliefs', 'Practices', 'History', 'Organization'],
  Species: ['Biology', 'Behaviour', 'Habitat', 'Culture'],
  Settlement: ['History', 'Geography', 'Government', 'Economy', 'Culture'],
  Condition: ['Symptoms', 'Causes', 'Treatment', 'History'],
  Conflict: ['Background', 'Course', 'Aftermath'],
  Document: ['Summary', 'Contents', 'History'],
  Culture: ['Overview', 'Customs', 'Beliefs', 'Arts', 'History'],
  Language: ['Overview', 'Phonology', 'Grammar', 'Writing system', 'History'],
  Material: ['Description', 'Properties', 'Sources', 'Uses'],
  Myth: ['Summary', 'Origins', 'Interpretations'],
  Technology: ['Description', 'History', 'Applications'],
  Tradition: ['Overview', 'Practice', 'Origins', 'Significance'],
  Spell: ['Description', 'Effects', 'Casting', 'History'],
}
```

In `seedTemplates()`, add a section backfill right after the icon backfill (still inside the rw transaction, reusing the `afterSeed` array):

```ts
    const needSections = afterSeed.filter(
      (t) => t.builtin && t.sections === undefined && BUILTIN_SECTIONS[t.name],
    )
    await Promise.all(
      needSections.map((t) => db.templates.update(t.id, { sections: BUILTIN_SECTIONS[t.name] })),
    )
```

In `resetTemplate()`, include the shipped sections alongside the icon:

```ts
export async function resetTemplate(id: string): Promise<void> {
  const original = BUILTIN_TEMPLATES.find((t) => t.id === id)
  if (original) {
    await db.templates.put({
      ...original,
      icon: BUILTIN_ICONS[original.name],
      sections: BUILTIN_SECTIONS[original.name] ?? [],
    })
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/db/templates.test.ts src/db/barrel.test.ts`
Expected: PASS (new and existing tests).

- [ ] **Step 6: Commit**

```bash
git add src/db/types.ts src/db/templates.ts src/db/templates.test.ts src/db/barrel.test.ts
git commit -m "feat: ship default body sections per page type with seed backfill (#89)"
```

---

### Task 3: Authoring UI on the Templates screen

Add a "Body sections" editor to the selected template, below the infobox-rows block. Reuses existing `.template-item*` classes so no new CSS is required.

**Files:**
- Modify: `src/routes/TemplatesRoute.tsx`

**Interfaces:**
- Consumes: `updateTemplate(id, { sections })` (existing), `selected.sections` (Task 2).

- [ ] **Step 1: Add section-editing handlers**

In `TemplatesRoute.tsx`, after the existing item handlers (`moveItem`), add handlers operating on the selected template's `sections` (default to `[]` when absent):

```ts
  // -- body-section editing (operates on the selected template) --------------
  function commitSections(sections: string[]) {
    if (selected) updateTemplate(selected.id, { sections })
  }
  function setSection(index: number, value: string) {
    if (!selected) return
    commitSections((selected.sections ?? []).map((s, i) => (i === index ? value : s)))
  }
  function addSection() {
    if (selected) commitSections([...(selected.sections ?? []), 'New section'])
  }
  function removeSection(index: number) {
    if (selected) commitSections((selected.sections ?? []).filter((_, i) => i !== index))
  }
  function moveSection(index: number, dir: -1 | 1) {
    if (!selected) return
    const list = selected.sections ?? []
    const target = index + dir
    if (target < 0 || target >= list.length) return
    const next = [...list]
    ;[next[index], next[target]] = [next[target], next[index]]
    commitSections(next)
  }
```

- [ ] **Step 2: Render the "Body sections" block**

In the JSX, insert this block immediately **after** the `<div className="template-editor-actions">…</div>` (the "＋ Add field / ＋ Add separator" row) and **before** the `<div className={`template-apply-row…`}>` block:

```tsx
            <div className="template-sections">
              <h3 className="template-sections-head">Body sections</h3>
              <p className="template-sections-intro">
                Starter headings an author can drop into a page’s body with the “＋ Sections”
                button in the editor. Inserted on demand per page — never added automatically or
                pushed to existing pages.
              </p>
              {(selected.sections ?? []).length === 0 && (
                <p className="empty-hint">No starter sections yet. Add some below.</p>
              )}
              {(selected.sections ?? []).map((s, i) => (
                <div key={i} className="template-item">
                  <div className="template-item-move">
                    <button className="tag-x" title="Move up" disabled={i === 0} onClick={() => moveSection(i, -1)}>▲</button>
                    <button
                      className="tag-x"
                      title="Move down"
                      disabled={i === (selected.sections ?? []).length - 1}
                      onClick={() => moveSection(i, 1)}
                    >▼</button>
                  </div>
                  <input
                    className="template-item-label"
                    value={s}
                    placeholder="Section heading…"
                    onChange={(e) => setSection(i, e.target.value)}
                  />
                  <button className="tag-x" title="Remove section" onClick={() => removeSection(i)}>×</button>
                </div>
              ))}
              <div className="template-editor-actions">
                <button className="mini-btn" onClick={addSection}>＋ Add section</button>
              </div>
            </div>
```

- [ ] **Step 3: Update the screen intro copy**

In the `<p className="templates-intro">` paragraph, append one sentence:

```tsx
          page, and choosing a type fills in its infobox rows. A type can also define starter body
          sections an author can insert into a page with one click.
```

- [ ] **Step 4: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: no errors/warnings.

- [ ] **Step 5: Manual check**

Run `npm run dev`, open `/templates`, pick **Character**: the "Body sections" list shows the curated defaults (Appearance, Personality, …). Add/rename/reorder/remove a section and confirm it persists across reloads. Pick a type after clearing all its sections and confirm the empty hint shows.

- [ ] **Step 6: Commit**

```bash
git add src/routes/TemplatesRoute.tsx
git commit -m "feat: edit a page type's starter body sections on the Templates screen (#89)"
```

---

### Task 4: "＋ Sections" button in the editor + PageRoute wiring

Add the toolbar button that inserts the page type's sections, and pass the type's section list from `PageRoute`.

**Files:**
- Modify: `src/components/LoreEditor.tsx` (new prop + toolbar button)
- Modify: `src/routes/PageRoute.tsx` (pass the prop)

**Interfaces:**
- Consumes: `sectionNodes(names)` (Task 1); `InfoboxTemplate.sections` (Task 2).

- [ ] **Step 1: Import the helper and add the prop**

In `src/components/LoreEditor.tsx`, add the import near the other local imports:

```ts
import { sectionNodes } from '../sectionNodes'
```

Add to the `Props` interface (after `autolinkEnabled`):

```ts
  /** Starter body-section names for this page's type; drives the "＋ Sections" button. */
  starterSections?: string[]
```

Destructure it in the component signature:

```ts
export default function LoreEditor({ content, editable, onChange, onWikiClick, knownTitles, autolinkTitles, autolinkEnabled, onCitationClick, starterSections }: Props) {
```

- [ ] **Step 2: Add the toolbar button**

In the toolbar JSX, add this button right after the citation button (`<Btn title="Insert citation" …>❝¹</Btn>`):

```tsx
          {!!starterSections?.length && (
            <Btn
              title="Insert this page type’s starter sections"
              onClick={() => editor.chain().focus().insertContent(sectionNodes(starterSections)).run()}
            >＋ Sections</Btn>
          )}
```

- [ ] **Step 3: Pass the prop from PageRoute**

In `src/routes/PageRoute.tsx`, add `starterSections` to the `<LoreEditor>` props (alongside `autolinkEnabled`):

```tsx
            autolinkEnabled={autolinkEnabled}
            starterSections={templates.find((t) => t.name === page.category)?.sections}
```

- [ ] **Step 4: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: no errors/warnings.

- [ ] **Step 5: Manual check**

Run `npm run dev`. Create a Character page, enter Edit mode, click **＋ Sections**: the body fills with Appearance / Personality / Background / History / Relationships headings, each with an empty paragraph; the Table of Contents lists them. Switch the page to a type whose sections were cleared and confirm the button disappears. Confirm undo (Ctrl+Z) removes the inserted block.

- [ ] **Step 6: Commit**

```bash
git add src/components/LoreEditor.tsx src/routes/PageRoute.tsx
git commit -m "feat: '+ Sections' button inserts a page type's starter sections (#89)"
```

---

### Task 5: Full verification & PR

- [ ] **Step 1: Run the full CI suite locally**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all pass.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/default-sections
gh pr create --title "feat: optional default sections per page type (#89)" \
  --body "Closes #89. Adds starter body sections per page type, editable on the Templates screen and inserted into a page body via a '+ Sections' editor button. See docs/superpowers/specs/2026-06-28-default-sections-design.md."
```

- [ ] **Step 3: Add the version label**

```bash
gh pr edit --add-label version:minor
```

---

## Self-Review

**Spec coverage:**
- §1 data model → Task 2 Step 1. ✓
- §2 Templates authoring UI → Task 3. ✓
- §3 insertion (LoreEditor button + PageRoute wiring + `sectionNodes`) → Tasks 1 & 4. ✓
- §4 curated defaults + seed backfill + resetTemplate → Task 2. ✓
- §5 no migration / HTML export unchanged / tests (templates.test, sectionNodes unit, barrel) / manual → Tasks 1, 2, 3, 4, 5. ✓ (HTML export needs no code change; sections are plain `<h2>`.)
- Out-of-scope items (auto-seed, placeholders, push-to-existing) are not implemented. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; manual steps describe exact actions and expected results. ✓

**Type consistency:** `sectionNodes(names: string[]): JSONContent[]` defined in Task 1 and consumed unchanged in Task 4; `BUILTIN_SECTIONS: Record<string, string[]>` defined in Task 2 and consumed in its own tests; `InfoboxTemplate.sections?: string[]` defined in Task 2 and read in Tasks 3 & 4. ✓

**Note for implementer:** `importAll()` round-trips full `InfoboxTemplate` objects, so the new `sections` field is preserved through backup/restore with no change. Confirm by inspection of `src/db/backup.ts` (`importAll`) — it should not strip unknown object fields. No code change expected.
