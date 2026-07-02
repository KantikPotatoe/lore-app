# Manuscript Authoring — Phase 4: Plotline Grid Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Plottr-style plotline grid for a book — plotline lanes (rows) × scene columns, with an editable beat card in each cell — replacing the Grid-view placeholder from Phase 2.

**Architecture:** Plotline + Beat CRUD added to `src/db/manuscript.ts` (tables already exist from Phase 1). A `BookGridView` component derives a view-model from `useLiveQuery` reads of scenes/chapters/plotlines/beats and renders an HTML table: a chapter band + scene-column header, one row per plotline, a beat cell per `(plotline, scene)`. Cells edit inline; lanes can be added/renamed/recolored/deleted/reordered.

**Tech Stack:** TypeScript strict, dexie-react-hooks `useLiveQuery`, Vitest + @testing-library/react + happy-dom.

**Spec:** `docs/superpowers/specs/2026-07-02-manuscript-authoring-design.md`
**Depends on:** Phases 1–3. Branch `feat/manuscript-grid` (stacked).

## Global Constraints

- TypeScript `strict`; no `any`. Ids/timestamps via `uid()`/`now()`.
- Component tests using `useLiveQuery` MUST `afterEach(cleanup)`.
- Reuse `TYPE_COLORS` for lane color choices; derive view-models with `useMemo` (no setState-in-effect).
- Run `npm run lint`, `npm run build`, `npm run test:run` green before done.

**Scoped deviation from spec (flagged):** the spec describes dragging beat cards between cells. This phase implements **click-to-edit cells** (create/edit/clear a beat in place) and **lane reorder via buttons** rather than HTML5 drag-and-drop — DnD is hard to test reliably and adds risk. Moving a beat = clear one cell, fill another. Drag-move is a noted follow-up. Only `plot`-kind lanes are managed here; the `structure` kind is Phase 5.

---

### Task 1: Plotline CRUD

**Files:**
- Modify: `src/db/manuscript.ts` (extend type import; add `TYPE_COLORS` import from `./schema`)
- Test: `src/db/manuscript.test.ts` (extend)

**Interfaces:**
- Produces:
  ```ts
  export async function createPlotline(
    bookId: string, name: string,
    opts?: { color?: string; kind?: 'plot' | 'structure'; structureType?: StructureType },
  ): Promise<Plotline>
  export async function updatePlotline(id: string, patch: Partial<Omit<Plotline,'id'|'bookId'|'createdAt'>>): Promise<void>
  export async function listPlotlines(bookId: string): Promise<Plotline[]>   // ordered
  export async function reorderPlotlines(bookId: string, orderedIds: string[]): Promise<void>
  export async function deletePlotline(id: string): Promise<void>            // cascades its beats
  ```
  New plotlines default to `kind:'plot'` and a color cycled from `TYPE_COLORS`.

- [ ] **Step 1: Write the failing test**

Append to `src/db/manuscript.test.ts`:

```ts
import {
  createPlotline, updatePlotline, listPlotlines, reorderPlotlines, deletePlotline,
} from './manuscript'

describe('plotline CRUD', () => {
  afterEach(async () => { await Promise.all([db.plotlines.clear(), db.beats.clear()]) })

  it('creates plotlines ordered within a book, with a default color and kind', async () => {
    const a = await createPlotline('b1', 'Main Arc')
    const b = await createPlotline('b1', 'Romance')
    expect(a.order).toBe(0)
    expect(b.order).toBe(1)
    expect(a.kind).toBe('plot')
    expect(a.color).toMatch(/^#/)
    expect((await listPlotlines('b1')).map((p) => p.name)).toEqual(['Main Arc', 'Romance'])
  })

  it('updates and reorders plotlines', async () => {
    const a = await createPlotline('b1', 'A')
    const b = await createPlotline('b1', 'B')
    await updatePlotline(a.id, { name: 'A-prime', color: '#123456' })
    await reorderPlotlines('b1', [b.id, a.id])
    const list = await listPlotlines('b1')
    expect(list.map((p) => p.name)).toEqual(['B', 'A-prime'])
    expect(list[1].color).toBe('#123456')
  })

  it('deletePlotline cascades its beats', async () => {
    const a = await createPlotline('b1', 'A')
    await db.beats.add({ id: 'bt1', bookId: 'b1', plotlineId: a.id, sceneId: 's1', label: '', note: 'x', order: 0, createdAt: 1, updatedAt: 1 })
    await deletePlotline(a.id)
    expect(await db.plotlines.get(a.id)).toBeUndefined()
    expect(await db.beats.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: FAIL — plotline functions not exported.

- [ ] **Step 3: Implement**

In `src/db/manuscript.ts`, extend imports:

```ts
import { db, uid, now, TYPE_COLORS } from './schema'
import type { Book, Chapter, Scene, SceneStatus, StructureType, Plotline, Beat } from './types'
```

Add (after `sceneAppearances`):

```ts
// --- Plotlines (grid lanes) ---------------------------------------------------

export async function createPlotline(
  bookId: string,
  name: string,
  opts: { color?: string; kind?: 'plot' | 'structure'; structureType?: StructureType } = {},
): Promise<Plotline> {
  const existing = await db.plotlines.where('bookId').equals(bookId).toArray()
  const order = existing.reduce((max, p) => Math.max(max, p.order + 1), 0)
  const color = opts.color ?? TYPE_COLORS[existing.length % TYPE_COLORS.length]
  const plotline: Plotline = {
    id: uid(), bookId, name, color, kind: opts.kind ?? 'plot',
    structureType: opts.structureType, order, createdAt: now(), updatedAt: now(),
  }
  await db.plotlines.add(plotline)
  return plotline
}

export async function updatePlotline(
  id: string,
  patch: Partial<Omit<Plotline, 'id' | 'bookId' | 'createdAt'>>,
): Promise<void> {
  await db.plotlines.update(id, { ...patch, updatedAt: now() })
}

export async function listPlotlines(bookId: string): Promise<Plotline[]> {
  return db.plotlines.where('bookId').equals(bookId).sortBy('order')
}

export async function reorderPlotlines(bookId: string, orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.plotlines, async () => {
    const byId = new Map((await db.plotlines.where('bookId').equals(bookId).toArray()).map((p) => [p.id, p]))
    let index = 0
    for (const id of orderedIds) {
      if (byId.has(id)) {
        await db.plotlines.update(id, { order: index })
        index++
      }
    }
  })
}

export async function deletePlotline(id: string): Promise<void> {
  await db.transaction('rw', [db.plotlines, db.beats], async () => {
    await db.beats.where('plotlineId').equals(id).delete()
    await db.plotlines.delete(id)
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/manuscript.ts src/db/manuscript.test.ts
git commit -m "feat(manuscript): plotline CRUD (grid lanes)"
```

---

### Task 2: Beat CRUD

**Files:**
- Modify: `src/db/manuscript.ts`
- Test: `src/db/manuscript.test.ts` (extend)

**Interfaces:**
- Produces:
  ```ts
  export async function createBeat(bookId: string, plotlineId: string, sceneId: string | null, note?: string): Promise<Beat>
  export async function updateBeat(id: string, patch: Partial<Omit<Beat,'id'|'bookId'|'createdAt'>>): Promise<void>
  export async function deleteBeat(id: string): Promise<void>
  export async function listBeats(bookId: string): Promise<Beat[]>
  ```

- [ ] **Step 1: Write the failing test**

Append to `src/db/manuscript.test.ts`:

```ts
import { createBeat, updateBeat, deleteBeat, listBeats } from './manuscript'

describe('beat CRUD', () => {
  afterEach(async () => { await Promise.all([db.plotlines.clear(), db.beats.clear()]) })

  it('creates, updates, lists and deletes beats', async () => {
    const p = await createPlotline('b1', 'A')
    const beat = await createBeat('b1', p.id, 's1', 'first note')
    expect(beat.note).toBe('first note')
    expect((await listBeats('b1')).length).toBe(1)
    await updateBeat(beat.id, { note: 'edited' })
    expect((await db.beats.get(beat.id))?.note).toBe('edited')
    await deleteBeat(beat.id)
    expect(await db.beats.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: FAIL — beat functions not exported.

- [ ] **Step 3: Implement**

Add to `src/db/manuscript.ts` (after the plotline section):

```ts
// --- Beats (grid cells) -------------------------------------------------------

export async function createBeat(
  bookId: string,
  plotlineId: string,
  sceneId: string | null,
  note = '',
): Promise<Beat> {
  const existing = await db.beats.where('plotlineId').equals(plotlineId).toArray()
  const order = existing.reduce((max, b) => Math.max(max, b.order + 1), 0)
  const beat: Beat = {
    id: uid(), bookId, plotlineId, sceneId, label: '', note, order,
    createdAt: now(), updatedAt: now(),
  }
  await db.beats.add(beat)
  return beat
}

export async function updateBeat(
  id: string,
  patch: Partial<Omit<Beat, 'id' | 'bookId' | 'createdAt'>>,
): Promise<void> {
  await db.beats.update(id, { ...patch, updatedAt: now() })
}

export async function deleteBeat(id: string): Promise<void> {
  await db.beats.delete(id)
}

export async function listBeats(bookId: string): Promise<Beat[]> {
  return db.beats.where('bookId').equals(bookId).toArray()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/db/manuscript.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/manuscript.ts src/db/manuscript.test.ts
git commit -m "feat(manuscript): beat CRUD (grid cells)"
```

---

### Task 3: `BookGridView` — lanes × scene columns (read-only render)

**Files:**
- Create: `src/components/manuscript/BookGridView.tsx`
- Test: `src/components/manuscript/BookGridView.test.tsx`

**Interfaces:**
- Consumes: `db.scenes`, `db.chapters`, `db.plotlines`, `db.beats`, `sceneStatusColor`; `useLiveQuery`.
- Produces: `BookGridView({ bookId }: { bookId: string })` — a table with a scene-column header (grouped by chapter) and one row per plotline; each cell shows the beat note for `(plotline, scene)` or is empty. An empty hint when there are no plotlines.

- [ ] **Step 1: Write the failing test**

Create `src/components/manuscript/BookGridView.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { db, createChapter, createScene, createPlotline, createBeat } from '../../db'
import BookGridView from './BookGridView'

afterEach(async () => {
  cleanup()
  await Promise.all([db.chapters.clear(), db.scenes.clear(), db.plotlines.clear(), db.beats.clear()])
})

describe('BookGridView', () => {
  it('renders plotline lanes, scene columns and beat notes', async () => {
    const ch = await createChapter('b1', 'Chapter One')
    const sc = await createScene('b1', ch.id, 'Opening')
    const pl = await createPlotline('b1', 'Main Arc')
    await createBeat('b1', pl.id, sc.id, 'hero departs')
    render(<BookGridView bookId="b1" />)
    expect(await screen.findByText('Main Arc')).toBeTruthy()
    expect(await screen.findByText('Opening')).toBeTruthy()
    expect(await screen.findByText('hero departs')).toBeTruthy()
  })

  it('shows an empty hint when there are no plotlines', async () => {
    render(<BookGridView bookId="b1" />)
    expect(await screen.findByText(/no plotlines yet/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/manuscript/BookGridView.test.tsx`
Expected: FAIL — cannot find `./BookGridView`.

- [ ] **Step 3: Implement (read-only skeleton; interactions added in Tasks 4-5)**

Create `src/components/manuscript/BookGridView.tsx`:

```tsx
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, createPlotline, sceneStatusColor,
  type Scene, type Chapter, type Plotline, type Beat,
} from '../../db'

const NO_SCENES: Scene[] = []
const NO_CHAPTERS: Chapter[] = []
const NO_PLOTLINES: Plotline[] = []
const NO_BEATS: Beat[] = []

export default function BookGridView({ bookId }: { bookId: string }) {
  const scenes = useLiveQuery(() => db.scenes.where('bookId').equals(bookId).sortBy('order'), [bookId]) ?? NO_SCENES
  const chapters = useLiveQuery(() => db.chapters.where('bookId').equals(bookId).sortBy('order'), [bookId]) ?? NO_CHAPTERS
  const plotlines = useLiveQuery(() => db.plotlines.where('bookId').equals(bookId).sortBy('order'), [bookId]) ?? NO_PLOTLINES
  const beats = useLiveQuery(() => db.beats.where('bookId').equals(bookId).toArray(), [bookId]) ?? NO_BEATS

  // Ordered scene columns (by chapter order, then scene order) + chapter spans.
  const { columns, chapterSpans } = useMemo(() => {
    const chOrder = new Map(chapters.map((c, i) => [c.id, i]))
    const cols = [...scenes].sort((a, b) =>
      (chOrder.get(a.chapterId) ?? 0) - (chOrder.get(b.chapterId) ?? 0) || a.order - b.order,
    )
    const spans: { chapterId: string; title: string; count: number }[] = []
    for (const s of cols) {
      const last = spans[spans.length - 1]
      if (last && last.chapterId === s.chapterId) last.count++
      else spans.push({ chapterId: s.chapterId, title: chapters.find((c) => c.id === s.chapterId)?.title ?? '', count: 1 })
    }
    return { columns: cols, chapterSpans: spans }
  }, [scenes, chapters])

  const beatByKey = useMemo(() => {
    const m = new Map<string, Beat>()
    for (const b of beats) if (b.sceneId) m.set(`${b.plotlineId}:${b.sceneId}`, b)
    return m
  }, [beats])

  return (
    <div className="grid-board">
      <div className="grid-board-actions">
        <button className="primary-btn" onClick={() => createPlotline(bookId, 'New plotline')}>＋ Plotline</button>
      </div>
      {plotlines.length === 0 ? (
        <p className="empty-hint">No plotlines yet. Add one to start plotting.</p>
      ) : (
        <div className="grid-scroll">
          <table className="grid-table">
            <thead>
              <tr>
                <th className="grid-corner" />
                {chapterSpans.map((cs, i) => (
                  <th key={`${cs.chapterId}:${i}`} colSpan={cs.count} className="grid-chapter">{cs.title}</th>
                ))}
              </tr>
              <tr>
                <th className="grid-corner" />
                {columns.map((s) => (
                  <th key={s.id} className="grid-scene-col">
                    <span className="status-pip" style={{ background: sceneStatusColor(s.status) }} />
                    {s.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plotlines.map((pl) => (
                <tr key={pl.id}>
                  <th className="grid-lane" style={{ borderLeft: `3px solid ${pl.color}` }}>{pl.name}</th>
                  {columns.map((s) => {
                    const beat = beatByKey.get(`${pl.id}:${s.id}`)
                    return (
                      <td key={s.id} className="grid-cell">
                        {beat ? <span className="grid-beat">{beat.note}</span> : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/manuscript/BookGridView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/manuscript/BookGridView.tsx src/components/manuscript/BookGridView.test.tsx
git commit -m "feat(manuscript): grid board render (lanes x scene columns, beats)"
```

---

### Task 4: Editable beat cells (create / edit / clear in place)

**Files:**
- Modify: `src/components/manuscript/BookGridView.tsx`
- Test: `src/components/manuscript/BookGridView.test.tsx` (extend)

**Interfaces:**
- Consumes: `createBeat`, `updateBeat`, `deleteBeat`.
- Behavior: clicking a cell opens a single inline `<textarea>` (tracked by `editingKey`). On blur: create a beat if none and the text is non-empty; update if it exists and text non-empty; delete if it exists and text is emptied.

- [ ] **Step 1: Write the failing test**

Append to `src/components/manuscript/BookGridView.test.tsx`:

```tsx
import { fireEvent, waitFor } from '@testing-library/react'

it('creates a beat by typing in an empty cell', async () => {
  const ch = await createChapter('b1', 'C')
  const sc = await createScene('b1', ch.id, 'Opening')
  const pl = await createPlotline('b1', 'Main')
  render(<BookGridView bookId="b1" />)
  const cell = await screen.findByLabelText(`beat ${pl.id}:${sc.id}`)
  fireEvent.click(cell)
  const editor = await screen.findByRole('textbox')
  fireEvent.change(editor, { target: { value: 'inciting incident' } })
  fireEvent.blur(editor)
  await waitFor(async () => expect(await db.beats.where('bookId').equals('b1').count()).toBe(1))
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/manuscript/BookGridView.test.tsx`
Expected: FAIL — no editable cell / beat not created.

- [ ] **Step 3: Implement inline editing**

In `src/components/manuscript/BookGridView.tsx`:

Add imports: `import { useMemo, useState } from 'react'` and add `createBeat, updateBeat, deleteBeat` to the db import.

Inside the component, add editing state and a save handler:

```tsx
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  function startEdit(key: string, current: string) {
    setEditingKey(key)
    setDraft(current)
  }

  async function commitEdit(plotlineId: string, sceneId: string, beat: Beat | undefined) {
    const text = draft.trim()
    setEditingKey(null)
    if (beat && !text) { await deleteBeat(beat.id); return }
    if (beat && text !== beat.note) { await updateBeat(beat.id, { note: text }); return }
    if (!beat && text) { await createBeat(bookId, plotlineId, sceneId, text); return }
  }
```

Replace the cell `<td>` body with an editable cell:

```tsx
                  {columns.map((s) => {
                    const key = `${pl.id}:${s.id}`
                    const beat = beatByKey.get(key)
                    const editing = editingKey === key
                    return (
                      <td
                        key={s.id}
                        className="grid-cell"
                        aria-label={`beat ${key}`}
                        onClick={() => !editing && startEdit(key, beat?.note ?? '')}
                      >
                        {editing ? (
                          <textarea
                            className="grid-beat-editor"
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => commitEdit(pl.id, s.id, beat)}
                          />
                        ) : beat ? (
                          <span className="grid-beat" style={{ background: `${pl.color}22` }}>{beat.note}</span>
                        ) : (
                          <span className="grid-cell-add">＋</span>
                        )}
                      </td>
                    )
                  })}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/manuscript/BookGridView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/manuscript/BookGridView.tsx src/components/manuscript/BookGridView.test.tsx
git commit -m "feat(manuscript): editable beat cells (create/edit/clear in place)"
```

---

### Task 5: Lane management — rename, recolor, delete, reorder

**Files:**
- Modify: `src/components/manuscript/BookGridView.tsx`
- Test: `src/components/manuscript/BookGridView.test.tsx` (extend)

**Interfaces:**
- Consumes: `updatePlotline`, `deletePlotline`, `reorderPlotlines`, `TYPE_COLORS`.
- Behavior: each lane gutter has an editable name (input, persists on change), a color swatch that cycles `TYPE_COLORS`, a delete (×), and ◀/▶ reorder buttons.

- [ ] **Step 1: Write the failing test**

Append to `src/components/manuscript/BookGridView.test.tsx`:

```tsx
it('renames a lane', async () => {
  const pl = await createPlotline('b1', 'Main')
  render(<BookGridView bookId="b1" />)
  const input = await screen.findByDisplayValue('Main')
  fireEvent.change(input, { target: { value: 'Central Arc' } })
  await waitFor(async () => expect((await db.plotlines.get(pl.id))?.name).toBe('Central Arc'))
})

it('deletes a lane', async () => {
  const pl = await createPlotline('b1', 'Doomed')
  render(<BookGridView bookId="b1" />)
  fireEvent.click(await screen.findByRole('button', { name: `delete lane ${pl.id}` }))
  await waitFor(async () => expect(await db.plotlines.get(pl.id)).toBeUndefined())
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/components/manuscript/BookGridView.test.tsx`
Expected: FAIL — no lane input / delete control.

- [ ] **Step 3: Implement lane controls**

In `src/components/manuscript/BookGridView.tsx`, extend the db import with `updatePlotline, deletePlotline, reorderPlotlines, TYPE_COLORS`.

Add a reorder helper inside the component:

```tsx
  function moveLane(index: number, dir: -1 | 1) {
    const next = [...plotlines]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    reorderPlotlines(bookId, next.map((p) => p.id))
  }

  function cycleColor(pl: Plotline) {
    const i = TYPE_COLORS.indexOf(pl.color as (typeof TYPE_COLORS)[number])
    const nextColor = TYPE_COLORS[(i + 1) % TYPE_COLORS.length]
    updatePlotline(pl.id, { color: nextColor })
  }
```

Replace the lane gutter `<th className="grid-lane">` with the control cluster:

```tsx
                  <th className="grid-lane" style={{ borderLeft: `3px solid ${pl.color}` }}>
                    <div className="grid-lane-controls">
                      <button
                        className="lane-swatch"
                        title="Change color"
                        style={{ background: pl.color }}
                        onClick={() => cycleColor(pl)}
                      />
                      <input
                        className="lane-name"
                        aria-label={`lane name ${pl.id}`}
                        value={pl.name}
                        onChange={(e) => updatePlotline(pl.id, { name: e.target.value })}
                      />
                      <button className="lane-btn" title="Move up" aria-label={`move lane up ${pl.id}`} onClick={() => moveLane(index, -1)}>▲</button>
                      <button className="lane-btn" title="Move down" aria-label={`move lane down ${pl.id}`} onClick={() => moveLane(index, 1)}>▼</button>
                      <button className="lane-btn lane-del" title="Delete lane" aria-label={`delete lane ${pl.id}`} onClick={() => deletePlotline(pl.id)}>×</button>
                    </div>
                  </th>
```

Change the row map to expose the index: `{plotlines.map((pl, index) => (`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/manuscript/BookGridView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/manuscript/BookGridView.tsx src/components/manuscript/BookGridView.test.tsx
git commit -m "feat(manuscript): lane management (rename, recolor, delete, reorder)"
```

---

### Task 6: Wire into `BookRoute` + styles + green gate

**Files:**
- Modify: `src/routes/BookRoute.tsx` (replace the Grid placeholder)
- Modify: `src/index.css` (append `.grid-*` and `.lane-*` rules)
- Test: `src/routes/BookRoute.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/routes/BookRoute.test.tsx`:

```tsx
import { fireEvent } from '@testing-library/react'

it('switches to the grid view', async () => {
  await db.books.add({ id: 'b1', title: 'My Novel', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 })
  renderAt('/book/b1')
  fireEvent.click(await screen.findByRole('button', { name: /grid/i }))
  expect(await screen.findByText(/no plotlines yet/i)).toBeTruthy()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/routes/BookRoute.test.tsx`
Expected: FAIL — the placeholder text ("later update") is shown instead.

- [ ] **Step 3: Wire in `BookGridView`**

In `src/routes/BookRoute.tsx`, add the import:

```ts
import BookGridView from '../components/manuscript/BookGridView'
```

Replace the grid placeholder block:

```tsx
      ) : (
        <BookGridView bookId={bookId} />
      )}
```

- [ ] **Step 4: Add styles**

Append a `/* Manuscript grid */` block to `src/index.css` styling `.grid-board`, `.grid-board-actions`, `.grid-scroll` (horizontal scroll), `.grid-table`, `.grid-corner`, `.grid-chapter`, `.grid-scene-col`, `.grid-lane`, `.grid-lane-controls`, `.lane-swatch`, `.lane-name`, `.lane-btn`, `.lane-del`, `.grid-cell`, `.grid-cell-add`, `.grid-beat`, `.grid-beat-editor`. Use existing tokens; make `.grid-scroll` `overflow-x: auto`, cells a fixed min-width, sticky `.grid-lane` left column.

- [ ] **Step 5: Green gate**

Run: `npm run lint` → clean · `npm run build` → succeeds · `npm run test:run` → all pass.

- [ ] **Step 6: Commit**

```bash
git add src/routes/BookRoute.tsx src/routes/BookRoute.test.tsx src/index.css
git commit -m "feat(manuscript): mount plotline grid in book workspace; phase 4 green"
```

---

## Self-Review

**Spec coverage (Phase 4):**
- Plotline + Beat CRUD → Tasks 1, 2. ✓
- Lanes × scene columns, chapter band, beat cells → Task 3. ✓
- Editable beats (create/edit/clear) → Task 4. ✓
- Lane add/rename/recolor/delete/reorder → Tasks 3, 5. ✓
- Status-tinted scene columns; scene-in-multiple-plotlines falls out of the per-cell model → Task 3. ✓
- Grid replaces the Phase-2 placeholder → Task 6. ✓

**Flagged deviations:** (1) beat **drag-move** between cells is replaced by click-to-edit + clear-and-refill; (2) lane **reorder** uses ▲/▼ buttons, not drag; (3) inline **add-scene-column** from the grid is omitted (scenes are added in the Write view). All are UI affordance choices; the data model is unchanged and drag can be layered on later.

**Placeholder scan:** Task 6 Step 4 lists CSS by class rather than full rules (styling judgment against existing tokens), consistent with Phase 2's styling task. No logic placeholders.

**Type consistency:** `createPlotline` opts match the `Plotline` fields; `beatByKey` keys `plotlineId:sceneId` match the cell `aria-label`/edit key; `cycleColor` casts `pl.color` to the `TYPE_COLORS` element type for `indexOf` (returns -1 → wraps to index 0, acceptable). `moveLane`/`reorderPlotlines` operate on ordered id arrays consistent with Task 1. ✓
