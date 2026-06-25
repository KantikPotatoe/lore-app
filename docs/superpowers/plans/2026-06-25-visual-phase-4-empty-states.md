# Visual Phase 4 — Empty & First-run States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the barren screens (no pages, empty category, no map, no timeline events, empty graph) into designed invitations via one reusable `EmptyState` component, and fold the first-run nudge into the no-pages state.

**Architecture:** A single presentational `EmptyState` component (ornament + warm line + optional message + optional CTA children) replaces five one-off empty blocks. The first-run nudge is the no-pages empty state's copy (a zero-page world *is* first-run) — no persisted flag. One `.empty-state` CSS block; orphaned per-screen empty CSS is removed as each screen migrates.

**Tech Stack:** React 19 + TypeScript (strict), plain CSS, Vitest + @testing-library/react (already deps; precedent `ErrorBoundary.test.tsx`).

## Global Constraints

- **Intensity: moderate / characterful.** Ornament = a glyph in a faint gold-ringed circle; warm line in serif; the screen's existing primary CTA. Dial-back-able from the one `.empty-state` block.
- **No new dependencies, no asset files.** Ornaments are emoji; ring uses `color-mix()` (already used in Phase 3, sanctioned for modern targets).
- **First-run = no-pages state.** No new persisted "seen" flag, no separate dismissable banner.
- **No glyph/placeholder churn.** Each empty state shows its ornament + line; the graph empty has no button (guidance only), matching the spec.
- **Strict TypeScript.** `npm run build` runs `tsc -b` and must pass. `EmptyState` props typed with `ReactNode` (type-only import).
- **Consolidate, don't duplicate.** Remove the per-screen empty CSS classes (`.map-empty`, `.browse-empty`, `.graph-empty`, `.timeline-empty-inner`) once their screen no longer references them — verify with grep before deleting. Leave unrelated classes (`.timeline-empty` outer state, `.link-btn`, `.empty-hint`, `.map-find-empty`) untouched.
- **Verification gates** (per CLAUDE.md / CI): `npm run lint`, `npm run build`, `npm run test:run` must all pass. Task 1 adds a real render test for the reusable component; the route wirings are mechanical swaps verified by gates + manual look.

---

### Task 1: `EmptyState` component + CSS + test

**Files:**
- Create: `src/components/EmptyState.tsx`
- Create: `src/components/EmptyState.test.tsx`
- Modify: `src/index.css` (add `.empty-state` block)

**Interfaces:**
- Produces: `EmptyState` (default export) with props `{ icon: string; title: string; message?: ReactNode; children?: ReactNode }`. Renders `.empty-state` > `.empty-state-ornament` (aria-hidden), `.empty-state-title`, optional `.empty-state-msg`, optional `.empty-state-actions` wrapping `children`.

- [ ] **Step 1: Write the failing test**

Create `src/components/EmptyState.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import EmptyState from './EmptyState'

afterEach(cleanup)

describe('EmptyState', () => {
  it('renders the ornament, title, message, and CTA children', () => {
    render(
      <EmptyState icon="📜" title="Your world is unwritten" message="Begin with a page.">
        <button>Create</button>
      </EmptyState>,
    )
    expect(screen.getByText('Your world is unwritten')).toBeTruthy()
    expect(screen.getByText('Begin with a page.')).toBeTruthy()
    expect(screen.getByText('📜')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
  })

  it('omits the message and actions when not provided', () => {
    const { container } = render(<EmptyState icon="🗺️" title="No map yet" />)
    expect(screen.getByText('No map yet')).toBeTruthy()
    expect(container.querySelector('.empty-state-msg')).toBeNull()
    expect(container.querySelector('.empty-state-actions')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/EmptyState.test.tsx`
Expected: FAIL — `Failed to resolve import "./EmptyState"` (module not created yet).

- [ ] **Step 3: Create the component**

Create `src/components/EmptyState.tsx`:

```tsx
import type { ReactNode } from 'react'

interface EmptyStateProps {
  /** Decorative emoji ornament. */
  icon: string
  /** Warm one-line invitation. */
  title: string
  /** Optional secondary line. */
  message?: ReactNode
  /** Optional call(s) to action. */
  children?: ReactNode
}

/** Designed empty / first-run state: an ornament, a warm line, an optional
 *  message, and an optional CTA. Shared across the barren screens (no pages,
 *  empty category, no map, no timeline events, empty graph). */
export default function EmptyState({ icon, title, message, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-ornament" aria-hidden="true">{icon}</div>
      <h2 className="empty-state-title">{title}</h2>
      {message && <p className="empty-state-msg">{message}</p>}
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Add the CSS**

In `src/index.css`, append (near the other route/component blocks, e.g. after the `.crash-*` block or at end of file):

```css
/* --- Empty / first-run states --------------------------------------------- *
   Shared designed empty state: a glyph in a faint gold-ringed circle, a warm
   serif line, an optional message, and the screen's primary CTA. Reused across
   the no-pages (first-run), empty-category, no-map, no-events, and empty-graph
   screens. */
.empty-state {
  max-width: 460px; margin: 0 auto; padding: 64px 24px;
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px;
}
.empty-state-ornament {
  width: 84px; height: 84px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 38px; line-height: 1;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
}
.empty-state-title { font-family: var(--display); font-size: 24px; color: var(--ink); margin: 0; }
.empty-state-msg { color: var(--ink-dim); font-family: var(--serif); font-size: 16px; margin: 0; line-height: 1.5; }
.empty-state-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 6px; }
.empty-state-actions .primary-btn { width: auto; }
.empty-state-msg code { background: var(--panel-2); padding: 1px 6px; border-radius: 4px; font-size: 14px; color: var(--accent-soft); }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/EmptyState.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full gate and commit**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all pass (242 tests: prior 240 + 2 new).

```bash
git add src/components/EmptyState.tsx src/components/EmptyState.test.tsx src/index.css
git commit -m "feat(visual): reusable EmptyState component (Phase 4)"
```

---

### Task 2: Migrate the four non-Home empty screens

Replace the one-off empty blocks in Map, Category, Timeline, and Graph routes with `EmptyState`, then remove the now-orphaned CSS.

**Files:**
- Modify: `src/routes/MapRoute.tsx` (import + `:259-267`), `src/routes/CategoryRoute.tsx` (import + `:36-43`), `src/routes/TimelineRoute.tsx` (import + `:97-100`), `src/routes/GraphRoute.tsx` (import + `:78-84`)
- Modify: `src/index.css` (remove orphaned `.map-empty`, `.browse-empty`, `.graph-empty`, `.timeline-empty-inner` rules after migration)

**Interfaces:**
- Consumes: `EmptyState` from Task 1.

- [ ] **Step 1: MapRoute — no-map state**

In `src/routes/MapRoute.tsx`, add the import (alongside the other component imports near the top):

```tsx
import EmptyState from '../components/EmptyState'
```

Replace the block at `:259-267`:

```tsx
  if (maps.length === 0) {
    return (
      <div className="map-empty">
        <h1>Maps</h1>
        <p className="muted">Upload an image of your world (PNG or JPG) to start dropping pins.</p>
        <button className="primary-btn" onClick={() => fileRef.current?.click()}>⭱ Upload a map image</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
      </div>
    )
  }
```

with:

```tsx
  if (maps.length === 0) {
    return (
      <EmptyState
        icon="🗺️"
        title="No map yet"
        message="Upload an image of your world (PNG or JPG) to start dropping pins."
      >
        <button className="primary-btn" onClick={() => fileRef.current?.click()}>⭱ Upload a map image</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
      </EmptyState>
    )
  }
```

- [ ] **Step 2: CategoryRoute — empty-category state**

In `src/routes/CategoryRoute.tsx`, add the import:

```tsx
import EmptyState from '../components/EmptyState'
```

Replace the block at `:36-43`:

```tsx
      {pages.length === 0 ? (
        <p className="browse-empty">
          No {category} pages yet —{' '}
          <button className="link-btn" onClick={handleNew}>
            create the first one
          </button>
          !
        </p>
      ) : (
```

with:

```tsx
      {pages.length === 0 ? (
        <EmptyState icon="📭" title={`No ${category} pages yet`} message="This corner of your world is empty.">
          <button className="primary-btn" onClick={handleNew}>+ New {category}</button>
        </EmptyState>
      ) : (
```

- [ ] **Step 3: TimelineRoute — no-events state**

In `src/routes/TimelineRoute.tsx`, add the import:

```tsx
import EmptyState from '../components/EmptyState'
```

Replace the no-events block at `:97-100` (the `visibleEvents.length === 0` branch — NOT the outer `.timeline-empty` no-calendar state at `:33`):

```tsx
        {visibleEvents.length === 0 ? (
          <div className="timeline-empty-inner">
            <p className="muted">No events yet. Click "Add event" to get started.</p>
          </div>
        ) : view === 'vertical' ? (
```

with:

```tsx
        {visibleEvents.length === 0 ? (
          <EmptyState icon="⏳" title="History hasn't been recorded yet" message="Add your first event to begin the timeline.">
            <button className="primary-btn" style={{ width: 'auto' }} onClick={() => setAddingEvent(true)}>+ Add event</button>
          </EmptyState>
        ) : view === 'vertical' ? (
```

- [ ] **Step 4: GraphRoute — empty-graph state**

In `src/routes/GraphRoute.tsx`, add the import:

```tsx
import EmptyState from '../components/EmptyState'
```

Replace the block at `:78-84`:

```tsx
  if (pages.length === 0) {
    return (
      <div className="graph-empty">
        <h1>Graph</h1>
        <p className="muted">Create some pages and link them with [[wiki links]] to see your world take shape here.</p>
      </div>
    )
  }
```

with:

```tsx
  if (pages.length === 0) {
    return (
      <EmptyState
        icon="🕸️"
        title="No connections to map yet"
        message={<>Create some pages and link them with <code>[[wiki links]]</code> to see your world take shape here.</>}
      />
    )
  }
```

- [ ] **Step 5: Remove orphaned CSS**

Confirm each class is no longer referenced in `src/`:

Run: `grep -rn "map-empty\|browse-empty\b\|graph-empty\|timeline-empty-inner" src/ --include=*.tsx`
Expected: no matches (only the CSS definitions remain).

Then delete these rules from `src/index.css` (leave `.timeline-empty` outer and `.map-find-empty` intact):
- `.map-empty`, `.map-empty h1`, `.map-empty .primary-btn` (the `/* --- Maps ---` block's first three rules)
- `.browse-empty`, `.browse-empty .link-btn` (Category Browse block)
- `.graph-empty`
- `.timeline-empty-inner`

- [ ] **Step 6: Gate and commit**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all pass (242 tests).

```bash
git add src/routes/MapRoute.tsx src/routes/CategoryRoute.tsx src/routes/TimelineRoute.tsx src/routes/GraphRoute.tsx src/index.css
git commit -m "feat(visual): designed empty states for map, category, timeline, graph (Phase 4)"
```

---

### Task 3: HomeRoute first-run / no-pages state

Replace the recent-section empty hint with the first-run `EmptyState`, and hide the "Recently edited" heading when there are no pages.

**Files:**
- Modify: `src/routes/HomeRoute.tsx` (import + `:375-380`)

**Interfaces:**
- Consumes: `EmptyState` from Task 1; `handleNew` (`HomeRoute.tsx:144`); `recent` (empty iff zero pages, since it is the 8 most-recently-updated pages).

- [ ] **Step 1: Add the import**

In `src/routes/HomeRoute.tsx`, add alongside the other component imports:

```tsx
import EmptyState from '../components/EmptyState'
```

- [ ] **Step 2: Swap the recent-empty hint for the first-run EmptyState**

In `src/routes/HomeRoute.tsx`, replace the recent section (`:375-380`):

```tsx
      {cfg.showRecent && (
        <section className="home-section">
          <h2>Recently edited</h2>
          {recent.length === 0 ? (
            <p className="empty-hint">Nothing yet — create your first lore page to get started.</p>
          ) : (
```

with:

```tsx
      {cfg.showRecent && (
        <section className="home-section">
          {recent.length > 0 && <h2>Recently edited</h2>}
          {recent.length === 0 ? (
            <EmptyState
              icon="📜"
              title="Your world is unwritten"
              message="Every world begins with a single page. Create your first one to start building."
            >
              <button className="primary-btn" onClick={handleNew}>+ Create your first page</button>
            </EmptyState>
          ) : (
```

(The closing `)}` and the existing grid branch below are unchanged.)

- [ ] **Step 3: Gate and commit**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all pass (242 tests).

```bash
git add src/routes/HomeRoute.tsx
git commit -m "feat(visual): first-run empty state on Home (Phase 4)"
```

- [ ] **Step 4: Manual visual check (whole phase)**

Run `npm run dev`. On a brand-new world (or delete all pages of a category / clear events):
- Home with zero pages shows the 📜 first-run state (no "Recently edited" heading above it) with a working "Create your first page" button.
- An empty category, the no-map screen, the no-events timeline, and the empty graph each show their ornamented `EmptyState`; CTAs work (graph has none — guidance only).
- The ornament ring renders (gold circle); a `prefers-reduced-motion` pass shows no regressions (there's no animation here anyway).

---

## Self-Review

**Spec coverage** (against `2026-06-25-visual-phases-2-4-design.md` §Phase 4):
- 4.1 Designed empty states for the five screens → Task 1 (component) + Task 2 (map/category/timeline/graph) + Task 3 (no-pages). ✓
- 4.2 First-run nudge folded into the no-pages state, no persisted flag → Task 3 (keyed on `recent.length === 0` ⟺ zero pages). ✓
- Consolidation of one-off empties into one component → Task 2 Step 5 removes orphaned CSS. ✓

**Scoping note (sidebar):** the spec lists "No pages (Home / sidebar)". The designed `EmptyState` lands on Home (the main canvas). The sidebar keeps its compact inline `.empty-hint` ("No pages yet. Create your first one!", `Sidebar.tsx:129`) — a full ornamented empty state does not fit a 290px column. Flagged as a conscious choice, not an omission.

**Placeholder scan:** No TBD/TODO; every step shows full before/after code. ✓

**Type/name consistency:** `EmptyState` default export + prop names (`icon`/`title`/`message`/children) defined in Task 1 and consumed identically in Tasks 2–3; class names (`.empty-state*`) defined in Task 1 Step 4 and matched in the test (Step 1). ✓

**Constraint check:** no new deps; first-run has no persisted flag; graph empty has no CTA; orphaned CSS removed with grep guard; strict-TS `ReactNode` typing. ✓
