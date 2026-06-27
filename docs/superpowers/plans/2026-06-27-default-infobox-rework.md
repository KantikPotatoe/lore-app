# Default Infobox Fields Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Curate the starter rows of all 19 built-in page types in `BUILTIN_TEMPLATES` for better fields, more `ref` cross-linking, and consistent grouping — without changing the set of types, their ids, names, colors, or icons.

**Architecture:** A pure data change to the `BUILTIN_TEMPLATES` array in `src/db/templates.ts`, locked in by structural-invariant tests appended to `src/db/templates.test.ts`. TDD: the grouping-invariant test fails on the current (flat) types first, then the rewrite makes it pass.

**Tech Stack:** TypeScript, Vitest. No new dependencies, no schema/DB change.

## Global Constraints

- Only `BUILTIN_TEMPLATES` (rows) changes in `src/db/templates.ts`. Do NOT alter any `id`, `name`, `color`, `builtin` flag, the helper functions (`f`/`ref`/`num`/`sep`/`hue`), or `BUILTIN_ICONS`.
- Every `ref` `refType` must equal an existing built-in type `name` (Character, Country, Deity, Geography, Item, Organization, Religion, Species, Settlement, Condition, Conflict, Document, Culture, Language, Material, Myth, Technology, Tradition, Spell).
- Grouping rule: a type with ≥6 field rows (separators excluded) has ≥1 separator; a type with ≤5 field rows has none.
- 19 templates remain, in their current order, all `builtin: true`.
- Run `npm run lint`, `npm run build`, and `npm run test:run` before claiming done (CI runs all three). Single file: `npm run test:run -- src/db/templates.test.ts`.
- Commit when done; do not push.

---

### Task 1: Curate `BUILTIN_TEMPLATES` with structural tests

**Files:**
- Modify: `src/db/templates.test.ts` (append a `describe` block — reuses the file's existing `BUILTIN_TEMPLATES` import and `describe/it/expect`)
- Modify: `src/db/templates.ts` (replace the `BUILTIN_TEMPLATES` array body, lines ~41–150)

**Interfaces:**
- Consumes: `BUILTIN_TEMPLATES` (already imported in `templates.test.ts`). Each element is `{ id, name, color, builtin, items }`; each `items` entry is a `TemplateItem` with optional `separator?: true`, `fieldType?: 'ref'|'number'`, `refType?: string`, and a `label: string`.
- Produces: no API change — re-export and signatures untouched.

- [ ] **Step 1: Append the structural-invariant tests**

At the END of `src/db/templates.test.ts`, append this block (do not modify the existing imports or tests):

```ts
describe('BUILTIN_TEMPLATES structure', () => {
  const typeNames = new Set(BUILTIN_TEMPLATES.map((t) => t.name))

  it('ships exactly the 19 expected built-in types, in order, with stable ids', () => {
    const expected = [
      ['builtin-character', 'Character'], ['builtin-country', 'Country'],
      ['builtin-deity', 'Deity'], ['builtin-geography', 'Geography'],
      ['builtin-item', 'Item'], ['builtin-organization', 'Organization'],
      ['builtin-religion', 'Religion'], ['builtin-species', 'Species'],
      ['builtin-settlement', 'Settlement'], ['builtin-condition', 'Condition'],
      ['builtin-conflict', 'Conflict'], ['builtin-document', 'Document'],
      ['builtin-culture', 'Culture'], ['builtin-language', 'Language'],
      ['builtin-material', 'Material'], ['builtin-myth', 'Myth'],
      ['builtin-technology', 'Technology'], ['builtin-tradition', 'Tradition'],
      ['builtin-spell', 'Spell'],
    ]
    expect(BUILTIN_TEMPLATES.map((t) => [t.id, t.name])).toEqual(expected)
    expect(BUILTIN_TEMPLATES.every((t) => t.builtin === true)).toBe(true)
  })

  it('every ref row targets an existing built-in type name', () => {
    for (const t of BUILTIN_TEMPLATES) {
      for (const item of t.items) {
        if (!item.separator && item.fieldType === 'ref') {
          expect(item.refType, `${t.name} → ${item.label}`).toBeTruthy()
          expect(
            typeNames.has(item.refType as string),
            `${t.name} → ${item.label} (refType "${item.refType}")`,
          ).toBe(true)
        }
      }
    }
  })

  it('groups by length: ≥6 field rows ⇒ has a separator; ≤5 ⇒ none', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const fieldCount = t.items.filter((it) => !it.separator).length
      const hasSep = t.items.some((it) => it.separator)
      if (fieldCount >= 6) {
        expect(hasSep, `${t.name} has ${fieldCount} fields but no separator`).toBe(true)
      } else {
        expect(hasSep, `${t.name} has ${fieldCount} fields but a separator`).toBe(false)
      }
    }
  })

  it('every non-separator row has a non-empty label', () => {
    for (const t of BUILTIN_TEMPLATES) {
      for (const item of t.items) {
        if (!item.separator) {
          expect(item.label.trim().length, `${t.name}`).toBeGreaterThan(0)
        }
      }
    }
  })
})
```

- [ ] **Step 2: Run the tests — the grouping test must fail**

Run: `npm run test:run -- src/db/templates.test.ts`
Expected: the `groups by length` test FAILS — current flat types (Item, Settlement, Condition, Document, Technology) have ≥6 fields with no separator. The other three new tests PASS (ids/names unchanged; current refs already valid; labels non-empty). This confirms the test bites.

- [ ] **Step 3: Replace the `BUILTIN_TEMPLATES` array**

In `src/db/templates.ts`, replace the entire `export const BUILTIN_TEMPLATES: InfoboxTemplate[] = [ … ]` array (keep the helpers `f`/`ref`/`num`/`sep`/`hue` and `BUILTIN_ICONS` above it unchanged) with:

```ts
export const BUILTIN_TEMPLATES: InfoboxTemplate[] = [
  {
    id: 'builtin-character', name: 'Character', color: hue('Character'), builtin: true, items: [
      f('Epithet'), ref('Species', 'Species'), f('Gender'), num('Age'), ref('Homeland', 'Country'),
      sep('Allegiance'), f('Status'), ref('Affiliation', 'Organization'), f('Occupation'),
      sep('Life'), f('Born'), f('Died'),
    ],
  },
  {
    id: 'builtin-country', name: 'Country', color: hue('Country'), builtin: true, items: [
      ref('Capital', 'Settlement'), f('Government'), ref('Ruler', 'Character'),
      sep('People'), num('Population'), ref('Languages', 'Language'), ref('Religion', 'Religion'),
      sep('Economy'), f('Currency'), f('Formed'),
    ],
  },
  {
    id: 'builtin-deity', name: 'Deity', color: hue('Deity'), builtin: true, items: [
      f('Domain'), ref('Pantheon', 'Religion'), f('Symbol'), f('Gender'), f('Alignment'),
      sep('Worship'), ref('Worshippers', 'Culture'), f('Holy days'), f('Temples'),
    ],
  },
  {
    id: 'builtin-geography', name: 'Geography', color: hue('Geography'), builtin: true, items: [
      f('Type'), ref('Region', 'Geography'), f('Climate'), f('Area'),
      sep('Features'), f('Terrain'), f('Flora & fauna'), f('Notable for'),
    ],
  },
  {
    id: 'builtin-item', name: 'Item', color: hue('Item'), builtin: true, items: [
      f('Type'), ref('Material', 'Material'), f('Powers'),
      sep('Provenance'), f('Origin'), ref('Creator', 'Character'), ref('Owner', 'Character'),
    ],
  },
  {
    id: 'builtin-organization', name: 'Organization', color: hue('Organization'), builtin: true, items: [
      f('Type'), ref('Leader', 'Character'), ref('Headquarters', 'Settlement'), f('Founded'), num('Members'),
      sep('Relations'), ref('Allies', 'Organization'), ref('Rivals', 'Organization'),
    ],
  },
  {
    id: 'builtin-religion', name: 'Religion', color: hue('Religion'), builtin: true, items: [
      f('Type'), ref('Deities', 'Deity'), ref('Founder', 'Character'), f('Founded'),
      sep('Practice'), f('Followers'), f('Holy text'), f('Rituals'),
    ],
  },
  {
    id: 'builtin-species', name: 'Species', color: hue('Species'), builtin: true, items: [
      f('Classification'), ref('Native to', 'Geography'), f('Habitat'), f('Diet'), num('Lifespan'),
      sep('Traits'), f('Intelligence'), f('Size'), f('Distinctive features'),
    ],
  },
  {
    id: 'builtin-settlement', name: 'Settlement', color: hue('Settlement'), builtin: true, items: [
      f('Type'), ref('Country', 'Country'), ref('Region', 'Geography'), num('Population'),
      sep('Governance'), f('Government'), ref('Ruler', 'Character'),
      sep('History'), f('Founded'), f('Notable for'),
    ],
  },
  {
    id: 'builtin-condition', name: 'Condition', color: hue('Condition'), builtin: true, items: [
      f('Type'), f('Cause'), f('Transmission'),
      sep('Effects'), f('Symptoms'), f('Cure'), f('Notable cases'),
    ],
  },
  {
    id: 'builtin-conflict', name: 'Conflict', color: hue('Conflict'), builtin: true, items: [
      f('Type'), f('Date'), ref('Location', 'Geography'),
      sep('Sides'), ref('Belligerents', 'Organization'), ref('Commanders', 'Character'),
      sep('Result'), f('Outcome'), f('Casualties'),
    ],
  },
  {
    id: 'builtin-document', name: 'Document', color: hue('Document'), builtin: true, items: [
      f('Type'), ref('Author', 'Character'), ref('Language', 'Language'),
      sep('Details'), f('Date written'), f('Location'), f('Contents'),
    ],
  },
  {
    id: 'builtin-culture', name: 'Culture', color: hue('Culture'), builtin: true, items: [
      ref('Region', 'Geography'), f('People'), ref('Language', 'Language'), ref('Religion', 'Religion'),
      sep('Ways'), f('Values'), f('Customs'), f('Arts'),
    ],
  },
  {
    id: 'builtin-language', name: 'Language', color: hue('Language'), builtin: true, items: [
      f('Family'), ref('Spoken by', 'Culture'), ref('Region', 'Geography'), f('Writing system'), f('Status'),
    ],
  },
  {
    id: 'builtin-material', name: 'Material', color: hue('Material'), builtin: true, items: [
      f('Type'), ref('Source', 'Geography'), f('Properties'), f('Rarity'), f('Uses'),
    ],
  },
  {
    id: 'builtin-myth', name: 'Myth', color: hue('Myth'), builtin: true, items: [
      f('Type'), ref('Origin culture', 'Culture'), f('Figures'), f('Themes'), f('Related to'),
    ],
  },
  {
    id: 'builtin-technology', name: 'Technology', color: hue('Technology'), builtin: true, items: [
      f('Type'), ref('Inventor', 'Character'), f('Invented'),
      sep('Use'), f('Function'), f('Materials'), f('Users'),
    ],
  },
  {
    id: 'builtin-tradition', name: 'Tradition', color: hue('Tradition'), builtin: true, items: [
      f('Type'), ref('Culture', 'Culture'), f('Occasion'), f('Participants'), f('Origin'),
    ],
  },
  {
    id: 'builtin-spell', name: 'Spell', color: hue('Spell'), builtin: true, items: [
      f('School'), ref('Caster', 'Character'), f('Effect'),
      sep('Casting'), f('Components'), f('Range'), f('Duration'),
    ],
  },
]
```

- [ ] **Step 4: Run the template tests — all pass**

Run: `npm run test:run -- src/db/templates.test.ts`
Expected: PASS — all four structural tests plus the pre-existing template tests are green.

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run build && npm run test:run`
Expected: lint clean; build succeeds; full suite green (no other test references specific built-in rows, so nothing else should move).

- [ ] **Step 6: Commit**

```bash
git add src/db/templates.ts src/db/templates.test.ts
git commit -m "feat: rework default infobox fields for better refs and grouping (#82)"
```

---

## Notes for the implementer

- **TDD bite:** only the `groups by length` test fails before the rewrite (current Item/Settlement/Condition/Document/Technology are flat with ≥6 fields). The other three tests pass against the old data too — they are regression guards, not the failing driver.
- **Why no UI/seed change:** `seedTemplates()` only adds missing built-ins by id and never rewrites an existing type's rows, so this data change reaches new worlds automatically and existing worlds opt in via the Templates screen's ↺ Reset. That behavior is intentional and out of scope here.
- **Do not** touch the `f`/`ref`/`num`/`sep`/`hue` helpers or `BUILTIN_ICONS` — only the array literal between them and `itemsToFields`.
