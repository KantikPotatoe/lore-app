# Manuscript Authoring — Phase 5: Story-Structure Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A story-structure track on the plotline grid — apply Save the Cat / Hero's Journey / Snowflake to a book, get its named beats in an "unplaced" tray, and assign each to a scene to see pacing.

**Architecture:** Built-in structure definitions as pure data in `src/manuscriptStructures.ts`. Data helpers in `manuscript.ts` (`applyStructure`/`removeStructure`/`getStructurePlotline`) manage the single `kind:'structure'` plotline per book and seed its beats. `BookGridView` gains a structure picker, an unplaced-beat tray with per-beat scene assignment, and a distinct structure lane row (placed beats show their fixed label).

**Tech Stack:** TypeScript strict, dexie-react-hooks, Vitest + @testing-library/react + happy-dom.

**Spec:** `docs/superpowers/specs/2026-07-02-manuscript-authoring-design.md`
**Depends on:** Phases 1–4. Branch `feat/manuscript-structure` (stacked).

## Global Constraints

- TypeScript `strict`; no `any`. Ids/timestamps via `uid()`/`now()`.
- Component tests using `useLiveQuery` MUST `afterEach(cleanup)`.
- **Scoped deviation (flagged):** the spec describes dragging a structure beat onto a scene column. This phase uses a per-beat **scene `<select>`** to assign (and "Unplace" to return to the tray) — same data outcome (`beat.sceneId`), testable without DnD.
- Run `npm run lint`, `npm run build`, `npm run test:run` green before done.

---

### Task 1: Built-in structure definitions

**Files:**
- Create: `src/manuscriptStructures.ts`
- Test: `src/manuscriptStructures.test.ts`

**Interfaces:**
- Consumes: `StructureType` from `./db`.
- Produces:
  ```ts
  export interface StructureDef { type: StructureType; name: string; beats: string[] }
  export const STRUCTURES: StructureDef[]
  export function structureDef(type: StructureType): StructureDef | undefined
  ```

- [ ] **Step 1: Write the failing test**

Create `src/manuscriptStructures.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STRUCTURES, structureDef } from './manuscriptStructures'

describe('structure definitions', () => {
  it('includes the three built-in structures', () => {
    expect(STRUCTURES.map((s) => s.type).sort()).toEqual(['heros-journey', 'save-the-cat', 'snowflake'])
  })
  it('Save the Cat has its 15 beats', () => {
    expect(structureDef('save-the-cat')?.beats).toHaveLength(15)
  })
  it('resolves a definition by type', () => {
    expect(structureDef('heros-journey')?.name).toBe("Hero's Journey")
  })
  it('returns undefined for an unknown type', () => {
    // @ts-expect-error deliberately invalid
    expect(structureDef('nope')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/manuscriptStructures.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

Create `src/manuscriptStructures.ts`:

```ts
import type { StructureType } from './db'

/** A built-in story structure: an ordered list of named beats to align scenes to. */
export interface StructureDef {
  type: StructureType
  name: string
  beats: string[]
}

export const STRUCTURES: StructureDef[] = [
  {
    type: 'save-the-cat',
    name: 'Save the Cat',
    beats: [
      'Opening Image', 'Theme Stated', 'Set-Up', 'Catalyst', 'Debate',
      'Break into Two', 'B Story', 'Fun and Games', 'Midpoint',
      'Bad Guys Close In', 'All Is Lost', 'Dark Night of the Soul',
      'Break into Three', 'Finale', 'Final Image',
    ],
  },
  {
    type: 'heros-journey',
    name: "Hero's Journey",
    beats: [
      'Ordinary World', 'Call to Adventure', 'Refusal of the Call',
      'Meeting the Mentor', 'Crossing the Threshold', 'Tests, Allies, Enemies',
      'Approach to the Inmost Cave', 'The Ordeal', 'Reward', 'The Road Back',
      'Resurrection', 'Return with the Elixir',
    ],
  },
  {
    type: 'snowflake',
    name: 'Snowflake',
    beats: [
      'One-Sentence Summary', 'One-Paragraph Summary', 'Setup',
      'First Disaster', 'Second Disaster', 'Third Disaster', 'Ending',
    ],
  },
]

export function structureDef(type: StructureType): StructureDef | undefined {
  return STRUCTURES.find((s) => s.type === type)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/manuscriptStructures.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/manuscriptStructures.ts src/manuscriptStructures.test.ts
git commit -m "feat(manuscript): built-in story-structure definitions"
```

---

### Task 2: `applyStructure` / `removeStructure` / `getStructurePlotline`

**Files:**
- Modify: `src/db/manuscript.ts`
- Test: `src/db/manuscript.test.ts` (extend)

**Interfaces:**
- Consumes: `structureDef` from `../manuscriptStructures`; existing `createPlotline`, `createBeat`.
- Produces:
  ```ts
  export async function getStructurePlotline(bookId: string): Promise<Plotline | undefined>
  export async function applyStructure(bookId: string, type: StructureType): Promise<void>  // replaces any existing structure lane
  export async function removeStructure(bookId: string): Promise<void>
  ```
  `applyStructure` removes any existing structure lane (and its beats), then creates one `kind:'structure'` plotline and seeds a beat per structure beat (`label` = beat name, `sceneId: null`, `order` = index).

- [ ] **Step 1: Write the failing test**

Append to `src/db/manuscript.test.ts` (imports + block):

```ts
import { applyStructure, removeStructure, getStructurePlotline } from './manuscript'

describe('structure track', () => {
  afterEach(async () => { await Promise.all([db.plotlines.clear(), db.beats.clear()]) })

  it('applies a structure as a single structure-kind lane with seeded, unplaced beats', async () => {
    await applyStructure('b1', 'save-the-cat')
    const lane = await getStructurePlotline('b1')
    expect(lane?.kind).toBe('structure')
    expect(lane?.structureType).toBe('save-the-cat')
    const beats = await db.beats.where('plotlineId').equals(lane!.id).toArray()
    expect(beats).toHaveLength(15)
    expect(beats.every((b) => b.sceneId === null)).toBe(true)
    expect(beats.map((b) => b.label)).toContain('Catalyst')
  })

  it('re-applying replaces the previous structure lane (no duplicates)', async () => {
    await applyStructure('b1', 'save-the-cat')
    await applyStructure('b1', 'heros-journey')
    const lanes = await db.plotlines.where('bookId').equals('b1').and((p) => p.kind === 'structure').toArray()
    expect(lanes).toHaveLength(1)
    expect(lanes[0].structureType).toBe('heros-journey')
    expect(await db.beats.where('plotlineId').equals(lanes[0].id).count()).toBe(12)
  })

  it('removeStructure deletes the lane and its beats', async () => {
    await applyStructure('b1', 'snowflake')
    await removeStructure('b1')
    expect(await getStructurePlotline('b1')).toBeUndefined()
    expect(await db.beats.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement**

In `src/db/manuscript.ts`, add the import:

```ts
import { structureDef } from '../manuscriptStructures'
```

Add (after the beat CRUD):

```ts
// --- Story-structure track ----------------------------------------------------

export async function getStructurePlotline(bookId: string): Promise<Plotline | undefined> {
  return db.plotlines.where('bookId').equals(bookId).and((p) => p.kind === 'structure').first()
}

/** Apply a story structure to a book: replace any existing structure lane, then
 *  seed one beat per structure beat (unplaced) in a new structure-kind lane. */
export async function applyStructure(bookId: string, type: StructureType): Promise<void> {
  const def = structureDef(type)
  if (!def) return
  await removeStructure(bookId)
  const lane = await createPlotline(bookId, def.name, { kind: 'structure', structureType: type, color: '#c9a24b' })
  for (let i = 0; i < def.beats.length; i++) {
    const beat = await createBeat(bookId, lane.id, null, '')
    await updateBeat(beat.id, { label: def.beats[i], order: i })
  }
}

export async function removeStructure(bookId: string): Promise<void> {
  const lane = await getStructurePlotline(bookId)
  if (lane) await deletePlotline(lane.id)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/manuscript.ts src/db/manuscript.test.ts
git commit -m "feat(manuscript): apply/remove story-structure track (data layer)"
```

---

### Task 3: Grid structure lane display + label in cells

**Files:**
- Modify: `src/components/manuscript/BookGridView.tsx`
- Test: `src/components/manuscript/BookGridView.test.tsx` (extend)

**Interfaces:**
- Behavior: the `kind:'structure'` lane renders with a distinct gutter (its name, no rename/recolor/reorder controls) and placed beats show their `label`. Plot lanes are unchanged.

- [ ] **Step 1: Write the failing test**

Append to `src/components/manuscript/BookGridView.test.tsx`:

```tsx
import { applyStructure } from '../../db'

it('renders a placed structure beat with its label in the structure lane', async () => {
  const ch = await createChapter('b1', 'C')
  const sc = await createScene('b1', ch.id, 'Opening')
  await applyStructure('b1', 'save-the-cat')
  const lane = await db.plotlines.where('bookId').equals('b1').and((p) => p.kind === 'structure').first()
  const catalyst = (await db.beats.where('plotlineId').equals(lane!.id).toArray()).find((b) => b.label === 'Catalyst')!
  await db.beats.update(catalyst.id, { sceneId: sc.id })
  render(<BookGridView bookId="b1" />)
  expect(await screen.findByText('Catalyst')).toBeTruthy()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/manuscript/BookGridView.test.tsx`
Expected: FAIL — label not shown / structure lane not distinguished.

- [ ] **Step 3: Implement**

In `src/components/manuscript/BookGridView.tsx`:

Render the label inside `.grid-beat` (works for plot beats too — their label is ''):

```tsx
                        ) : beat ? (
                          <span className="grid-beat" style={{ background: `${pl.color}22` }}>
                            {beat.label && <strong className="grid-beat-label">{beat.label}</strong>}
                            {beat.note}
                          </span>
                        ) : (
```

Give the structure lane a distinct gutter. Replace the lane `<th>`'s inner controls with a conditional:

```tsx
                  <th className={pl.kind === 'structure' ? 'grid-lane grid-lane-structure' : 'grid-lane'} style={{ borderLeft: `3px solid ${pl.color}` }}>
                    {pl.kind === 'structure' ? (
                      <span className="grid-lane-structure-name">{pl.name}</span>
                    ) : (
                      <div className="grid-lane-controls">
                        {/* …existing swatch/name/▲▼/× controls unchanged… */}
                      </div>
                    )}
                  </th>
```

(Keep the existing controls markup verbatim inside the `else` branch.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/manuscript/BookGridView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/manuscript/BookGridView.tsx src/components/manuscript/BookGridView.test.tsx
git commit -m "feat(manuscript): structure lane gutter + beat labels on the grid"
```

---

### Task 4: Structure picker + unplaced-beat tray with scene assignment

**Files:**
- Create: `src/components/manuscript/StructureControls.tsx`
- Modify: `src/components/manuscript/BookGridView.tsx` (mount `StructureControls`)
- Test: `src/components/manuscript/StructureControls.test.tsx`

**Interfaces:**
- Consumes: `db.plotlines`, `db.beats`, `db.scenes`, `applyStructure`, `removeStructure`, `updateBeat`, `STRUCTURES`; `useLiveQuery`.
- Produces: `StructureControls({ bookId }: { bookId: string })` — a structure `<select>` (None + the three) that applies/removes (confirms before replacing an existing structure), and, when a structure is active, a tray of its **unplaced** beats each with a scene `<select>` to assign.

- [ ] **Step 1: Write the failing test**

Create `src/components/manuscript/StructureControls.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db, createChapter, createScene, applyStructure } from '../../db'
import StructureControls from './StructureControls'

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await Promise.all([db.chapters.clear(), db.scenes.clear(), db.plotlines.clear(), db.beats.clear()])
})

describe('StructureControls', () => {
  it('applies a structure when picked', async () => {
    render(<StructureControls bookId="b1" />)
    fireEvent.change(await screen.findByLabelText(/story structure/i), { target: { value: 'snowflake' } })
    await waitFor(async () =>
      expect(await db.plotlines.where('bookId').equals('b1').and((p) => p.kind === 'structure').count()).toBe(1),
    )
  })

  it('lists unplaced beats and assigns one to a scene', async () => {
    const ch = await createChapter('b1', 'C')
    const sc = await createScene('b1', ch.id, 'Opening')
    await applyStructure('b1', 'snowflake')
    render(<StructureControls bookId="b1" />)
    // The first unplaced beat's scene <select>:
    const selects = await screen.findAllByLabelText(/assign beat/i)
    fireEvent.change(selects[0], { target: { value: sc.id } })
    await waitFor(async () =>
      expect((await db.beats.where('sceneId').equals(sc.id).count())).toBe(1),
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/manuscript/StructureControls.test.tsx`
Expected: FAIL — cannot find `./StructureControls`.

- [ ] **Step 3: Implement `StructureControls`**

Create `src/components/manuscript/StructureControls.tsx`:

```tsx
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, applyStructure, removeStructure, updateBeat,
  type Scene, type Plotline, type Beat,
} from '../../db'
import { STRUCTURES } from '../../manuscriptStructures'

const NO_SCENES: Scene[] = []
const NO_PLOTLINES: Plotline[] = []
const NO_BEATS: Beat[] = []

export default function StructureControls({ bookId }: { bookId: string }) {
  const scenes = useLiveQuery(() => db.scenes.where('bookId').equals(bookId).sortBy('order'), [bookId]) ?? NO_SCENES
  const plotlines = useLiveQuery(() => db.plotlines.where('bookId').equals(bookId).toArray(), [bookId]) ?? NO_PLOTLINES
  const beats = useLiveQuery(() => db.beats.where('bookId').equals(bookId).toArray(), [bookId]) ?? NO_BEATS

  const structureLane = plotlines.find((p) => p.kind === 'structure')
  const unplaced = useMemo(
    () =>
      structureLane
        ? beats.filter((b) => b.plotlineId === structureLane.id && b.sceneId === null).sort((a, b) => a.order - b.order)
        : [],
    [beats, structureLane],
  )

  function onPick(value: string) {
    if (value === 'none') {
      if (structureLane && !confirm('Remove the story-structure track and its beats?')) return
      removeStructure(bookId)
      return
    }
    if (structureLane && !confirm('Replace the current story structure? Beat placements will be reset.')) return
    applyStructure(bookId, value as (typeof STRUCTURES)[number]['type'])
  }

  return (
    <div className="structure-controls">
      <label className="structure-pick">
        <span>Story structure</span>
        <select
          aria-label="Story structure"
          value={structureLane?.structureType ?? 'none'}
          onChange={(e) => onPick(e.target.value)}
        >
          <option value="none">None</option>
          {STRUCTURES.map((s) => (
            <option key={s.type} value={s.type}>{s.name}</option>
          ))}
        </select>
      </label>

      {structureLane && unplaced.length > 0 && (
        <div className="structure-tray">
          <span className="structure-tray-head">Unplaced beats</span>
          {unplaced.map((b) => (
            <div key={b.id} className="structure-tray-beat">
              <span className="structure-tray-label">{b.label}</span>
              <select
                aria-label={`assign beat ${b.label}`}
                value=""
                onChange={(e) => updateBeat(b.id, { sceneId: e.target.value })}
              >
                <option value="" disabled>Assign to scene…</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

Mount it in `BookGridView` inside `.grid-board-actions` (after the ＋ Plotline button):

```tsx
      <div className="grid-board-actions">
        <button className="primary-btn" onClick={() => createPlotline(bookId, 'New plotline')}>＋ Plotline</button>
        <StructureControls bookId={bookId} />
      </div>
```

Add the import to `BookGridView`: `import StructureControls from './StructureControls'`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/manuscript/StructureControls.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/manuscript/StructureControls.tsx src/components/manuscript/BookGridView.tsx src/components/manuscript/StructureControls.test.tsx
git commit -m "feat(manuscript): structure picker + unplaced-beat tray with scene assignment"
```

---

### Task 5: Unplace action + styles + green gate

**Files:**
- Modify: `src/components/manuscript/BookGridView.tsx` (structure-lane placed beats get an "unplace" affordance)
- Modify: `src/index.css` (append `.structure-*` rules)
- Test: `src/components/manuscript/BookGridView.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/components/manuscript/BookGridView.test.tsx`:

```tsx
it('unplaces a structure beat back to the tray', async () => {
  const ch = await createChapter('b1', 'C')
  const sc = await createScene('b1', ch.id, 'Opening')
  await applyStructure('b1', 'snowflake')
  const lane = await db.plotlines.where('bookId').equals('b1').and((p) => p.kind === 'structure').first()
  const beat = (await db.beats.where('plotlineId').equals(lane!.id).toArray())[0]
  await db.beats.update(beat.id, { sceneId: sc.id })
  render(<BookGridView bookId="b1" />)
  fireEvent.click(await screen.findByRole('button', { name: `unplace beat ${beat.id}` }))
  await waitFor(async () => expect((await db.beats.get(beat.id))?.sceneId).toBeNull())
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/manuscript/BookGridView.test.tsx`
Expected: FAIL — no unplace button.

- [ ] **Step 3: Implement the unplace affordance**

In `BookGridView.tsx`, for a **structure-lane** placed beat, render an unplace button alongside the label. Change the beat display branch to handle structure beats:

```tsx
                        ) : beat ? (
                          <span className="grid-beat" style={{ background: `${pl.color}22` }}>
                            {beat.label && <strong className="grid-beat-label">{beat.label}</strong>}
                            {beat.note}
                            {pl.kind === 'structure' && (
                              <button
                                className="grid-beat-unplace"
                                aria-label={`unplace beat ${beat.id}`}
                                title="Send back to tray"
                                onClick={(e) => { e.stopPropagation(); updateBeat(beat.id, { sceneId: null }) }}
                              >×</button>
                            )}
                          </span>
                        ) : (
```

- [ ] **Step 4: Add styles**

Append a `/* Manuscript structure track */` block to `src/index.css` styling `.structure-controls`, `.structure-pick`, `.structure-tray`, `.structure-tray-head`, `.structure-tray-beat`, `.structure-tray-label`, `.grid-lane-structure`, `.grid-lane-structure-name`, `.grid-beat-label`, `.grid-beat-unplace`. Use existing tokens; make the tray a wrapping flex row of chips, and the structure lane gutter visually distinct (e.g. accent tint).

- [ ] **Step 5: Green gate**

Run: `npm run lint` → clean · `npm run build` → succeeds · `npm run test:run` → all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/manuscript/BookGridView.tsx src/components/manuscript/BookGridView.test.tsx src/index.css
git commit -m "feat(manuscript): unplace structure beats; styles; phase 5 green"
```

---

## Self-Review

**Spec coverage (Phase 5):**
- Built-in structure definitions (Save the Cat / Hero's Journey / Snowflake) → Task 1. ✓
- One structure lane per book, seeded unplaced beats → Task 2. ✓
- Apply / replace (confirm) / remove via picker → Tasks 2, 4. ✓
- Unplaced tray + assign-to-scene → Task 4. ✓
- Structure lane distinct on the grid; placed beats show their label → Tasks 3, 5. ✓
- Unplace back to tray → Task 5. ✓

**Flagged deviation:** assignment uses a scene `<select>` (and an "unplace" ×) rather than drag-and-drop of beats onto columns — same `beat.sceneId` outcome, testable. Consistent with Phase 4's no-DnD choice.

**Placeholder scan:** Task 3/5 reference "existing controls markup verbatim" (a copy directive, not a placeholder — the markup exists in the file) and Task 5 lists CSS by class (styling judgment). No logic gaps.

**Type consistency:** `applyStructure(bookId, type: StructureType)` matches the picker's `value as StructureType`; structure beats use `label` (fixed name) + `sceneId` (null=unplaced); `getStructurePlotline` filters `kind==='structure'` consistently across data + components. `createPlotline` already accepts `{ kind, structureType, color }` from Phase 4. ✓
