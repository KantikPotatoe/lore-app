# Default Infobox Fields Rework — Design

**Issue:** #82 · **Roadmap:** #3 · **Milestone:** Quick Wins

## Problem

The 19 built-in page types in `BUILTIN_TEMPLATES` (`src/db/templates.ts`) have
serviceable but uneven starter rows: many fields that name another page are
plain text instead of typed `ref` links (so they don't feed backlinks or the
relationship graph), and grouping is inconsistent — about half the types use
`sep()` section headings and half are flat lists with no clear rule.

## Goal

Curate the starter rows of all 19 existing built-in types for: (1) better field
choices, (2) more `ref` cross-linking, and (3) consistent grouping. The set of
types, their names, colors, and icons are unchanged.

## Conventions

1. **Lead field:** where a type has a natural sub-kind, lead with it (`Type` /
   `Classification` / `School` / `Family` / `Domain`); leave it where unnatural.
2. **`ref` everywhere it links a page:** any field whose value names a thing
   with its own page type becomes a typed `ref` bound to the single most-likely
   type. A `ref` targets exactly one page type, so fields that could be mixed
   (Conflict "Commanders", Myth "Figures") stay text or take the dominant type.
3. **Grouping by length:** types with ~6+ fields get logical `sep()` headings;
   types with ≤5 fields stay flat.
4. **`num` for genuinely numeric singles** (Age, Population, Members, Lifespan).
   In-world dates stay text (Born, Founded, Formed) — they are not real numbers.
5. **Keep contextual labels** (Born/Died, Formed, Invented) rather than forcing
   a uniform "Date".

## Propagation / scope

`seedTemplates()` only *adds* missing built-ins by id; it never rewrites the
rows of an already-seeded type (deliberate, to preserve user edits). Therefore:

- **New worlds** get the reworked defaults automatically.
- **Existing worlds** keep their current rows; a user opts in per type via the
  Templates screen's **↺ Reset** button (`resetTemplate(id)` restores shipped
  rows). Existing pages' infoboxes are snapshots and are unaffected until the
  user re-applies a template to a page.

No force-migration is added: `seedTemplates()` cannot distinguish a user's edits
from the old defaults, so overwriting existing built-in rows would risk
clobbering customizations. This matches the module's existing contract.

## The revised rows

Notation: `→Type` = `ref` to that page type · `#` = `num` · **§ X** = separator.

| Type | Rows |
|---|---|
| **Character** | Epithet · Species→Species · Gender · Age# · Homeland→Country · §Allegiance: Status · Affiliation→Organization · Occupation · §Life: Born · Died |
| **Country** | Capital→Settlement · Government · Ruler→Character · §People: Population# · Languages→Language · Religion→Religion · §Economy: Currency · Formed |
| **Deity** | Domain · Pantheon→Religion · Symbol · Gender · Alignment · §Worship: Worshippers→Culture · Holy days · Temples |
| **Geography** | Type · Region→Geography · Climate · Area · §Features: Terrain · Flora & fauna · Notable for |
| **Item** | Type · Material→Material · Powers · §Provenance: Origin · Creator→Character · Owner→Character |
| **Organization** | Type · Leader→Character · Headquarters→Settlement · Founded · Members# · §Relations: Allies→Organization · Rivals→Organization |
| **Religion** | Type · Deities→Deity · Founder→Character · Founded · §Practice: Followers · Holy text · Rituals |
| **Species** | Classification · Native to→Geography · Habitat · Diet · Lifespan# · §Traits: Intelligence · Size · Distinctive features |
| **Settlement** | Type · Country→Country · Region→Geography · Population# · §Governance: Government · Ruler→Character · §History: Founded · Notable for |
| **Condition** | Type · Cause · Transmission · §Effects: Symptoms · Cure · Notable cases |
| **Conflict** | Type · Date · Location→Geography · §Sides: Belligerents→Organization · Commanders→Character · §Result: Outcome · Casualties |
| **Document** | Type · Author→Character · Language→Language · §Details: Date written · Location · Contents |
| **Culture** | Region→Geography · People · Language→Language · Religion→Religion · §Ways: Values · Customs · Arts |
| **Language** | Family · Spoken by→Culture · Region→Geography · Writing system · Status |
| **Material** | Type · Source→Geography · Properties · Rarity · Uses |
| **Myth** | Type · Origin culture→Culture · Figures · Themes · Related to |
| **Technology** | Type · Inventor→Character · Invented · §Use: Function · Materials · Users |
| **Tradition** | Type · Culture→Culture · Occasion · Participants · Origin |
| **Spell** | School · Caster→Character · Effect · §Casting: Components · Range · Duration |

### Summary of changes
- **New/changed `ref` links (13):** Character Homeland→Country; Country Religion→Religion; Deity Worshippers→Culture; Geography Region→Geography; Organization Headquarters→Settlement; Species Native to→Geography; Settlement Country→Country; Conflict Location→Geography; Culture Region→Geography; Language Spoken by→Culture, Region→Geography; Material Source→Geography; Myth Origin culture→Culture.
- **Flat → grouped (5):** Item, Settlement, Condition, Document, Technology.
- **Label fixes (2):** Deity "Followers"→"Worshippers" (now a ref), "Holy day"→"Holy days".
- **Unchanged (3):** Religion, Tradition, Spell (Spell already well-formed; Religion/Tradition only confirmed against conventions).

## Constraints

- Only `BUILTIN_TEMPLATES` in `src/db/templates.ts` changes. No type added or
  removed; every `id`, `name`, `color`, `builtin` flag, and the `BUILTIN_ICONS`
  map stay exactly as they are.
- Every `ref` `refType` must equal an existing built-in type `name`
  (one of: Character, Country, Deity, Geography, Item, Organization, Religion,
  Species, Settlement, Condition, Conflict, Document, Culture, Language,
  Material, Myth, Technology, Tradition, Spell).
- The `barrel.test.ts` re-export check must still pass (no public API change).

## Testing

Add structural-invariant tests (a `templates.test.ts` describe block, or extend
the existing template tests) over `BUILTIN_TEMPLATES`:

1. Every `ref` row has a `refType` that matches some built-in template `name`.
2. Grouping rule holds: a template with ≥6 field rows (separators excluded)
   contains at least one separator; a template with ≤5 field rows contains none.
3. Invariants preserved: still exactly 19 templates, each `builtin: true`; every
   `id` matches the `builtin-*` convention and every `name` is in the fixed type
   set above (guards against accidental id/name edits).
4. Every non-separator row has a non-empty `label`. (Field *types* like `num`
   are not asserted per-row — too brittle for a curation pass.)

## Out of scope

- Updating already-seeded built-ins in existing worlds (opt-in via Reset).
- Adding/removing/renaming page types or changing colors/icons.
- Any change to `applyTemplate`, `seedTemplates`, or the Templates UI.
