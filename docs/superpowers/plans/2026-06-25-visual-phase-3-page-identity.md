# Visual Phase 3 — Page Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a page visibly carry its type's identity — a subtle type-colour wash on the page header and the type's emoji glyph beside the title — driven entirely by the category colour the app already computes.

**Architecture:** `PageRoute` sets a single CSS custom property `--type-color` (= `categoryColor(page.category)`) on the page wrapper; all header tinting derives from it in CSS. The category glyph reads the page type's existing `icon` from the already-loaded `templates`. No schema change, no new data. Reuses the colour already shown on the header border, breadcrumb, infobox title bar, and category badge — so everything matches by construction.

**Tech Stack:** React 19 + TypeScript (strict), plain CSS. Uses CSS `color-mix()` for the wash (supported in current Firefox/Chrome; the app targets modern browsers per CLAUDE.md).

## Global Constraints

- **Intensity: moderate / characterful.** Header wash ~10–12% of the type colour, fading to transparent; glyph proportionate to the title. Dial-back-able from one place.
- **No schema/data change.** `--type-color` and the glyph derive from existing `page.category` → `categoryColor()` / the type's `icon`.
- **Strict TypeScript.** Setting a CSS custom property via inline `style` requires casting the style object `as CSSProperties` (import the type from `react`). `npm run build` runs `tsc -b` and must pass.
- **No glyph placeholder.** A page whose type has no `icon` shows no glyph and no gap-filler.
- **Contrast guard.** The wash must stay faint enough that `--ink` title text remains AA-legible over it (≈10–12% tint over the dark panel is safe).
- **Reduced-motion** is already handled globally; this phase adds no animation.
- **Verification gates** (per CLAUDE.md / CI): `npm run lint`, `npm run build`, `npm run test:run` must all pass. No new unit tests — the change is a CSS custom property plus conditional emoji rendering, with no logic seam worth a unit test; verification is the three gates green plus a manual look. (This matches the spec's per-phase verification note.)

---

### Task 1: Type-tinted page header (`--type-color` + wash)

Thread the category colour to the page as `--type-color`, move the header's left-border colour to read from it, and add a faint left-to-right wash behind the header.

**Files:**
- Modify: `src/routes/PageRoute.tsx` (import `CSSProperties`; set `--type-color` on `.page-view`; drop the now-redundant inline `borderColor` on `.page-header`).
- Modify: `src/index.css` — `.page-header` rule.

**Interfaces:**
- Consumes: `categoryColor(page.category)` (already imported in `PageRoute.tsx:4`).
- Produces: CSS custom property `--type-color` available on `.page-view` and descendants (Task 2 does not need it, but future phases may).

- [ ] **Step 1: Import the `CSSProperties` type**

In `src/routes/PageRoute.tsx`, change line 1 from:

```tsx
import { useEffect, useRef, useState } from 'react'
```

to:

```tsx
import { useEffect, useRef, useState, type CSSProperties } from 'react'
```

- [ ] **Step 2: Set `--type-color` on the page wrapper and remove the redundant inline header border colour**

In `src/routes/PageRoute.tsx`, change these two lines (currently `:126-127`):

```tsx
    <div className="page-view">
      <header className="page-header" style={{ borderColor: categoryColor(page.category) }}>
```

to:

```tsx
    <div className="page-view" style={{ '--type-color': categoryColor(page.category) } as CSSProperties}>
      <header className="page-header">
```

(The header's left-border colour now comes from `--type-color` in CSS — Step 3 — so the inline `borderColor` is no longer needed.)

- [ ] **Step 3: Tint the header border and add the wash**

In `src/index.css`, replace the `.page-header` rule:

```css
.page-header { border-left: 3px solid var(--accent); padding-left: 18px; margin-bottom: 24px; }
```

with:

```css
/* Type identity: the left accent + a faint left-to-right wash derive from the
   page's category colour, threaded in as --type-color on .page-view. Falls back
   to gold when a page has no resolved type colour. The wash stays ~11% so --ink
   title text keeps AA contrast over it. */
.page-header {
  border-left: 3px solid var(--type-color, var(--accent));
  padding: 10px 16px 6px 18px; margin-bottom: 24px;
  border-radius: 0 8px 8px 0;
  background: linear-gradient(to right, color-mix(in srgb, var(--type-color, var(--accent)) 11%, transparent), transparent 62%);
}
```

- [ ] **Step 4: Verify gates**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all pass (240 tests; `tsc -b` clean — confirms the `CSSProperties` cast type-checks).

- [ ] **Step 5: Manual visual check**

Run `npm run dev`, open a page of each type. Confirm:
- The header shows a faint colour wash that matches the page's type (gold for untyped), fading out toward the right.
- The left accent bar matches the wash colour.
- Title text stays clearly legible over the wash.

- [ ] **Step 6: Commit**

```bash
git add src/routes/PageRoute.tsx src/index.css
git commit -m "feat(visual): type-colour wash on page header (Phase 3)"
```

---

### Task 2: Category glyph in the page header

Render the page type's emoji `icon` beside the title. No icon → nothing rendered.

**Files:**
- Modify: `src/routes/PageRoute.tsx` — wrap the title/input with the glyph in a flex container.
- Modify: `src/index.css` — `.page-title-wrap` / `.page-type-glyph`.

**Interfaces:**
- Consumes: `templates` (already in `PageRoute.tsx:19`), each `InfoboxTemplate` carries optional `icon` (`src/db/types.ts:167`).
- Produces: nothing (terminal task).

- [ ] **Step 1: Render the glyph beside the title**

In `src/routes/PageRoute.tsx`, replace the title block inside `.page-header-row` (currently `:130-143`):

```tsx
          {editing ? (
            <input
              className="title-input"
              value={titleDraft ?? page.title}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              placeholder="Page title"
            />
          ) : (
            <h1 className="page-title">{page.title}</h1>
          )}
```

with:

```tsx
          <div className="page-title-wrap">
            {templates.find((t) => t.name === page.category)?.icon && (
              <span className="page-type-glyph" aria-hidden="true">
                {templates.find((t) => t.name === page.category)?.icon}
              </span>
            )}
            {editing ? (
              <input
                className="title-input"
                value={titleDraft ?? page.title}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                placeholder="Page title"
              />
            ) : (
              <h1 className="page-title">{page.title}</h1>
            )}
          </div>
```

- [ ] **Step 2: Style the glyph and title wrapper**

In `src/index.css`, immediately after the `.page-title` rule (`.page-title { font-family: var(--display); font-size: 36px; margin: 0; line-height: 1.1; }`), add:

```css
/* Title + type glyph group, kept together as one flex child of .page-header-row. */
.page-title-wrap { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
.page-title-wrap .title-input { flex: 1; }
.page-type-glyph { font-size: 28px; line-height: 1; flex-shrink: 0; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5)); }
```

- [ ] **Step 3: Verify gates**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all pass (240 tests).

- [ ] **Step 4: Manual visual check**

Run `npm run dev`. Confirm:
- A page whose type has an icon (set on the Templates screen) shows that emoji left of the title, vertically centred, in both view and edit mode.
- A page whose type has no icon shows just the title — no glyph, no leading gap.
- The title input in edit mode still fills the row width beside the glyph.

- [ ] **Step 5: Commit**

```bash
git add src/routes/PageRoute.tsx src/index.css
git commit -m "feat(visual): category glyph beside page title (Phase 3)"
```

---

## Self-Review

**Spec coverage** (against `2026-06-25-visual-phases-2-4-design.md` §Phase 3):
- 3.1 Type-tinted chrome — header left accent (via `--type-color`) + header wash → Task 1. Infobox title bar already reads `categoryColor(page.category)` (PageRoute passes `accent` to `Infobox`, rendered at `Infobox.tsx:83`), so it already matches the header by construction — no change needed; noted here so the "they match" requirement is consciously verified, not missed. ✓
- 3.2 Category glyph → Task 2 (reads existing `icon`; no placeholder when absent). ✓
- Mechanism: single `--type-color` on `.page-view` → Task 1 Step 2. ✓

**Placeholder scan:** No TBD/TODO; every step shows full before/after code. ✓

**Type/name consistency:** `--type-color` set in Task 1 Step 2 and consumed in Task 1 Step 3; `.page-title-wrap` / `.page-type-glyph` defined and used together in Task 2; `CSSProperties` imported in Task 1 Step 1 and used in Step 2. ✓

**Constraint check:** Strict-TS cast handled (Task 1 Steps 1–2); no schema change; no glyph placeholder (Task 2 conditional render); wash kept ~11% for contrast. ✓
