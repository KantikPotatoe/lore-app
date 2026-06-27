# Template "Apply to Existing Pages" Discoverability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a user edits a page type's rows in `/templates`, surface a highlighted prompt offering to apply the change to existing pages — making the already-existing `applyTemplateToPages` action discoverable at the moment it matters.

**Architecture:** Add a `dirty` flag to `TemplatesRoute` (set by row edits, cleared on apply/switch) that escalates the existing apply control into a highlighted callout. No data-layer change.

**Tech Stack:** React, Vitest + @testing-library/react + fake-indexeddb. No new dependencies.

## Global Constraints

- No change to `applyTemplateToPages`, `applyTemplate`, or `pagesUsingTemplate` — propagation already works.
- The apply control stays available whenever `usedByCount > 0` (no regression); it only *escalates* in prominence when `dirty && usedByCount > 0`.
- `dirty` is set by **row** edits only (via `commitItems` + the Reset action), not by name/colour/icon edits. It clears on `selectTemplate` and after a successful `applyToPages`.
- Tests use happy-dom; components using `useLiveQuery` need `afterEach(cleanup)` or teardown throws "window is not defined".
- Run `npm run lint`, `npm run build`, and `npm run test:run` before claiming done. Single file: `npm run test:run -- src/routes/TemplatesRoute.test.tsx`.
- Commit when done; do not push.

---

### Task 1: Dirty-prompt for applying template changes

**Files:**
- Modify: `src/routes/TemplatesRoute.tsx`
- Modify: `src/index.css` (after line ~639)
- Create: `src/routes/TemplatesRoute.test.tsx`

**Interfaces:**
- Consumes: existing `applyTemplateToPages`, `updateTemplate`, `resetTemplate`, `createTemplate`, `deleteTemplate` from `'../db'`.
- Produces: no exported API change.

- [ ] **Step 1: Write the failing test**

Create `src/routes/TemplatesRoute.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, createPage, defaultInfobox } from '../db'
import TemplatesRoute from './TemplatesRoute'

afterEach(cleanup)

describe('TemplatesRoute — apply-changes prompt', () => {
  beforeEach(async () => {
    await db.pages.clear()
    await db.templates.clear()
    // One custom template used by two pages.
    await db.templates.add({
      id: 'tpl-hero', name: 'Hero', color: '#888', builtin: false,
      items: [{ label: 'Title' }],
    })
    await createPage({ title: 'Alice', category: 'Hero', infobox: await defaultInfobox('Hero') })
    await createPage({ title: 'Bob', category: 'Hero', infobox: await defaultInfobox('Hero') })
  })

  it('hides the prompt until a row is edited, then applies and collapses it', async () => {
    render(<MemoryRouter><TemplatesRoute /></MemoryRouter>)

    // The "Hero" template is auto-selected (only one). Wait for it to render.
    await screen.findByDisplayValue('Hero')

    // Initially quiet: no "you changed this type's rows" message.
    expect(screen.queryByText(/you changed this type’s rows/i)).toBeNull()

    // Edit a row: add a field. The prompt should appear with the page count.
    fireEvent.click(screen.getByText('＋ Add field'))
    expect(await screen.findByText(/you changed this type’s rows/i)).toBeTruthy()
    const applyBtn = screen.getByRole('button', { name: /apply to 2 existing pages/i })

    // Apply: prompt collapses and a success note appears.
    fireEvent.click(applyBtn)
    await waitFor(() =>
      expect(screen.queryByText(/you changed this type’s rows/i)).toBeNull(),
    )
    expect(screen.getByText(/updated 2 pages/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/routes/TemplatesRoute.test.tsx`
Expected: FAIL — the "you changed this type’s rows" message doesn't exist yet (the prompt isn't implemented).

- [ ] **Step 3: Add the `dirty` flag and wire it into the row-edit/apply/select paths**

In `src/routes/TemplatesRoute.tsx`:

(a) Add the state next to the others (after `const [note, setNote] = useState('')`):

```tsx
  const [dirty, setDirty] = useState(false)
```

(b) Clear it when switching templates — update `selectTemplate`:

```tsx
  function selectTemplate(id: string | null) {
    setSelectedId(id)
    setNote('')
    setDirty(false)
  }
```

(c) Set it on every row edit — update `commitItems`:

```tsx
  function commitItems(items: TemplateItem[]) {
    if (selected) {
      updateTemplate(selected.id, { items })
      setDirty(true)
    }
  }
```

(d) Clear it after applying — update `applyToPages`:

```tsx
  async function applyToPages() {
    if (!selected) return
    const n = await applyTemplateToPages(selected)
    setDirty(false)
    setNote(n === 0 ? 'No pages use this type yet.' : `Updated ${n} page${n === 1 ? '' : 's'}.`)
  }
```

(e) Mark dirty when resetting a built-in (it replaces the rows) — change the Reset button's handler from `onClick={() => resetTemplate(selected.id)}` to:

```tsx
                <button className="mini-btn" onClick={() => { resetTemplate(selected.id); setDirty(true) }} title="Restore shipped colour and rows">
```

- [ ] **Step 4: Replace the apply row with the escalating callout**

Replace the existing `.template-apply-row` block (currently):

```tsx
            <div className="template-apply-row">
              <button className="mini-btn" disabled={usedByCount === 0} onClick={applyToPages}>
                Apply to existing pages
              </button>
              <span className="template-apply-hint">
                {note || (
                  usedByCount === 0
                    ? 'No pages use this type yet.'
                    : `Push these rows to ${usedByCount} page${usedByCount === 1 ? '' : 's'} using this type (values are kept).`
                )}
              </span>
            </div>
```

with:

```tsx
            <div className={`template-apply-row${dirty && usedByCount > 0 ? ' dirty' : ''}`}>
              {dirty && usedByCount > 0 && (
                <p className="template-apply-callout">
                  ● You changed this type’s rows. Existing pages keep their old rows until you apply.
                </p>
              )}
              <div className="template-apply-controls">
                <button className="mini-btn" disabled={usedByCount === 0} onClick={applyToPages}>
                  {usedByCount > 0
                    ? `Apply to ${usedByCount} existing page${usedByCount === 1 ? '' : 's'}`
                    : 'Apply to existing pages'}
                </button>
                <span className="template-apply-hint">
                  {note ||
                    (usedByCount === 0 ? 'No pages use this type yet.' : 'Filled-in values are kept.')}
                </span>
              </div>
            </div>
```

- [ ] **Step 5: Add the callout styling**

In `src/index.css`, immediately after the `.template-apply-hint` rule (~line 639), add:

```css
.template-apply-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.template-apply-row.dirty {
  flex-direction: column; align-items: stretch; gap: 8px;
  padding: 12px; border: 1px solid var(--accent); border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.template-apply-callout { margin: 0; font-size: 13px; color: var(--ink); }
```

- [ ] **Step 6: Run the test — passes**

Run: `npm run test:run -- src/routes/TemplatesRoute.test.tsx`
Expected: PASS — prompt hidden initially, appears after "＋ Add field", collapses after apply with the "Updated 2 pages" note.

- [ ] **Step 7: Full verification**

Run: `npm run lint && npm run build && npm run test:run`
Expected: lint clean; build succeeds; full suite green.

- [ ] **Step 8: Commit**

```bash
git add src/routes/TemplatesRoute.tsx src/routes/TemplatesRoute.test.tsx src/index.css
git commit -m "feat: surface 'apply to existing pages' after template row edits (#83)"
```

---

## Notes for the implementer

- **The apostrophe in the copy is a curly `’`** ("type’s") — the test matches it with a regex that includes `’`. Keep them consistent (both straight or both curly); the plan uses curly in both the JSX and the test.
- **`color-mix`** is widely supported in modern browsers (the app targets current Firefox); if the build's CSS pipeline rejects it, fall back to a solid faint background like `var(--panel-2)`.
- **Why the apply button always renders** (not gated on `dirty`): a user can edit rows, switch away (clearing `dirty`), and come back — the button must still be there to apply. `dirty` only controls the *callout escalation*, not the button's existence.
- **`defaultInfobox('Hero')`** in the test sets `infobox.template === 'Hero'`, which is what `pagesUsingTemplate('Hero')` matches on — that's how the 2 pages are counted.
