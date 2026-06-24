# Visual Phase 2 — Depth & Texture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lore Codex surfaces feel like layered material — parchment grain, soft elevation, ornamental dividers, and richer hover/active feedback — without touching any data or logic.

**Architecture:** Pure CSS in `src/index.css`. New `:root` tokens hold the inline-SVG textures; new reusable utility classes (`.parchment`, `.elevated`, `.ornament-divider`) carry each effect and are applied to the existing chrome selectors in the same rule, so no component/TSX files change. Page bodies render through Tiptap's `<EditorContent>` in both view and edit mode, so `.ProseMirror hr` styling reaches both.

**Tech Stack:** Plain CSS, inline SVG data-URIs (no asset files, no dependencies).

## Global Constraints

- **Intensity: moderate / characterful** — noticeable but not baroque. Every effect dial-back-able from one token/class.
- **CSS-only.** No new dependencies, no asset files, no TSX/logic changes in this phase. Textures are inline SVG data-URIs.
- **Do not texture the reading surface.** `.ProseMirror` body stays clean for legibility; parchment goes on chrome only.
- **Reduced-motion is already handled** globally (`@media (prefers-reduced-motion: reduce)` resets all transitions in `src/index.css:73`). Do not add per-rule reduced-motion guards.
- **Port is pinned to 5174** (`strictPort`). Use `npm run dev` as-is; do not change the port.
- **Verification gates** (per CLAUDE.md / CI): `npm run lint`, `npm run build`, `npm run test:run` must all pass. These are visual changes with no logic branches; there are no new unit tests — verification is the three gates staying green plus the manual visual checklist in each task.

---

### Task 1: Parchment texture on chrome surfaces

Add one greyscale fractal-noise SVG token and apply it (via a reusable `.parchment` class plus the existing chrome selectors) under the solid panel fills. Skip the editor reading body.

**Files:**
- Modify: `src/index.css` — add token in `:root` (after the `--radius` line, ~`src/index.css:18`); add a new rule near the resets.

**Interfaces:**
- Consumes: nothing.
- Produces: CSS token `--parchment-noise` and utility class `.parchment` (reused by Task 2/3 surfaces and future work).

- [ ] **Step 1: Add the texture token to `:root`**

In `src/index.css`, inside `:root` (immediately after `--radius: 10px;`), add:

```css
  /* Greyscale fractal-noise grain layered under panel fills (moderate intensity). */
  --parchment-noise: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)' opacity='0.045'/%3E%3C/svg%3E");
```

- [ ] **Step 2: Apply the grain to chrome surfaces**

In `src/index.css`, add this rule directly below the foundations block (after the `@media (prefers-reduced-motion: reduce)` block that ends at `src/index.css:80`):

```css
/* --- Parchment grain ------------------------------------------------------ *
   A faint greyscale noise layered over the (solid) panel fills so chrome reads
   as material, not flat colour. The reading surface (.ProseMirror) is excluded
   deliberately for legibility. Reusable via .parchment; also applied directly
   to the standing chrome selectors so no markup changes are needed. */
.parchment,
.infobox,
.lore-card,
.ov-card,
.browse-card,
.modal-dialog,
.sidebar {
  background-image: var(--parchment-noise);
}
```

- [ ] **Step 3: Verify gates stay green**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all three pass (no test count change).

- [ ] **Step 4: Manual visual check**

Run `npm run dev`, open `http://localhost:5174`. Confirm:
- Sidebar, cards on Home, the infobox, and any modal show a faint grain (visible on close look, not distracting).
- The article editor body (the prose you type into) has **no** grain.
- Text remains crisp; the grain does not muddy labels.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(visual): parchment grain on chrome surfaces (Phase 2)"
```

---

### Task 2: Layered elevation on panels

Give cards, infobox, and modals stacked depth cues: the existing hairline border, a soft drop shadow, and a 1px inner top highlight so panels read as lit from above.

**Files:**
- Modify: `src/index.css` — add an `.elevated` rule; the existing `.modal-dialog` already has a heavy shadow (`src/index.css:177`) and keeps it.

**Interfaces:**
- Consumes: nothing.
- Produces: utility class `.elevated`.

- [ ] **Step 1: Add the elevation utility and apply to panels**

In `src/index.css`, add after the parchment rule from Task 1:

```css
/* --- Layered elevation ---------------------------------------------------- *
   Hairline border (already present) + soft drop shadow + a 1px inner top
   highlight, so panels read as lit from above rather than as flat fills. */
.elevated,
.lore-card,
.infobox,
.ov-card {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.25),
    0 6px 18px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
```

- [ ] **Step 2: Add the inner highlight to the modal (keep its existing deep shadow)**

Find `.modal-dialog` (`src/index.css:170`) and change its `box-shadow` line from:

```css
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
```

to:

```css
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05);
```

- [ ] **Step 3: Verify gates stay green**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all three pass.

- [ ] **Step 4: Manual visual check**

Run `npm run dev`. Confirm:
- Home overview cards (`.ov-card`), lore cards, and the page infobox now sit visibly above the background (soft shadow) with a faint bright line along their top edge.
- Modals show the same top highlight without losing their existing deep shadow.
- The `.lore-card` hover-lift (translateY) still works and now lifts a shadowed card.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(visual): layered elevation on cards, infobox, modals (Phase 2)"
```

---

### Task 3: Ornamental dividers

Replace the plain `<hr>` rule in article bodies with a centred gold flourish, and warm the Home section-heading underline. Pure CSS — `<hr>` is styled with a background fleuron plus a gradient rule with a gap in the middle.

**Files:**
- Modify: `src/index.css` — replace `.ProseMirror hr` (`src/index.css:351`); add an `.ornament-divider` utility; adjust `.home-section h2` border (`src/index.css:225`).

**Interfaces:**
- Consumes: nothing.
- Produces: utility class `.ornament-divider`.

- [ ] **Step 1: Replace the `<hr>` styling with the flourish**

In `src/index.css`, replace the existing line:

```css
.ProseMirror hr { border: none; border-top: 1px solid var(--border); margin: 1.6em 0; }
```

with:

```css
/* Ornamental divider: a gold fleuron centred on a hairline rule that gaps in
   the middle to frame it. Reusable via .ornament-divider; also applied to the
   article-body <hr> (same Tiptap render in view + edit mode). */
.ornament-divider,
.ProseMirror hr {
  border: none;
  height: 22px;
  margin: 1.8em 0;
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Cpath d='M11 4 L18 11 L11 18 L4 11 Z' fill='none' stroke='%23c9a24b' stroke-width='1.3'/%3E%3C/svg%3E") center / 22px 22px no-repeat,
    linear-gradient(to right, transparent, var(--border) 20%, transparent 44%, transparent 56%, var(--border) 80%, transparent) center / 100% 1px no-repeat;
}
```

- [ ] **Step 2: Warm the Home section-heading underline**

In `src/index.css`, find `.home-section h2` (`src/index.css:225`). Change its `border-bottom` from:

```css
.home-section h2 { font-family: var(--display); font-size: 20px; color: var(--ink); border-bottom: 1px solid var(--border); padding-bottom: 8px; }
```

to (a gold accent segment under the heading text fading into the border — characterful but appropriate for a left-aligned heading, where a centred flourish would look odd):

```css
.home-section h2 {
  font-family: var(--display); font-size: 20px; color: var(--ink);
  border-bottom: 1px solid transparent; padding-bottom: 8px;
  border-image: linear-gradient(to right, var(--accent) 0%, var(--border) 28%, var(--border) 100%) 1;
}
```

- [ ] **Step 3: Verify gates stay green**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all three pass.

- [ ] **Step 4: Manual visual check**

Run `npm run dev`. Confirm:
- On a page whose body contains a horizontal rule (insert one via the editor "—" / horizontal-rule control if needed), the divider shows a small gold diamond centred on a hairline that gaps around it, in both view and edit mode.
- Home section headings ("Recent", etc.) show a short gold segment under the heading text fading into the normal border.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(visual): ornamental dividers + warmed section rules (Phase 2)"
```

---

### Task 4: Micro-interactions

Extend the card-lift hover language to sidebar nav items and page links, and give the active page link a soft gold accent glow so "where am I" is reinforced.

**Files:**
- Modify: `src/index.css` — `.nav-item` / `.nav-item:hover` / `.nav-item.active` (`src/index.css:100-106`), `.page-link` / `:hover` / `.active` (`src/index.css:141-146`).

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (terminal task).

- [ ] **Step 1: Add transitions + hover lift to nav items and page links**

In `src/index.css`, update `.nav-item` (`src/index.css:100`) to add a transition. Change:

```css
.nav-item {
  flex: 1 1 auto; text-align: center; padding: 6px 8px; border-radius: 8px;
  color: var(--ink-dim); border: 1px solid transparent; font-size: 13px;
  white-space: nowrap;
}
```

to:

```css
.nav-item {
  flex: 1 1 auto; text-align: center; padding: 6px 8px; border-radius: 8px;
  color: var(--ink-dim); border: 1px solid transparent; font-size: 13px;
  white-space: nowrap; transition: background 0.12s, color 0.12s, transform 0.12s;
}
```

Change `.page-link` (`src/index.css:141`) from:

```css
.page-link {
  display: flex; align-items: center; gap: 9px; padding: 6px 9px; border-radius: 7px;
  color: var(--ink-dim); font-size: 14px;
}
```

to:

```css
.page-link {
  display: flex; align-items: center; gap: 9px; padding: 6px 9px; border-radius: 7px;
  color: var(--ink-dim); font-size: 14px;
  transition: background 0.12s, color 0.12s, transform 0.12s, box-shadow 0.12s;
}
```

- [ ] **Step 2: Add the subtle hover nudge**

In `src/index.css`, update the hover rules. Change `.page-link:hover` (`src/index.css:145`) from:

```css
.page-link:hover { background: var(--panel); color: var(--ink); }
```

to:

```css
.page-link:hover { background: var(--panel); color: var(--ink); transform: translateX(2px); }
```

- [ ] **Step 3: Add the active-page accent glow**

In `src/index.css`, change `.page-link.active` (`src/index.css:146`) from:

```css
.page-link.active { background: var(--panel-2); color: var(--ink); }
```

to:

```css
.page-link.active {
  background: var(--panel-2); color: var(--ink);
  box-shadow: inset 2px 0 0 var(--accent), 0 0 0 1px rgba(201, 162, 75, 0.18);
}
```

- [ ] **Step 4: Verify gates stay green**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all three pass.

- [ ] **Step 5: Manual visual check**

Run `npm run dev`. Confirm:
- Hovering a page link in the sidebar nudges it right slightly and lightens it; hovering a top-nav item is smooth (no snap).
- The currently-open page's sidebar link shows a gold left-edge bar and a faint gold ring.
- With OS "reduce motion" enabled, the nudge/transition is neutralised (no movement) — the global reduced-motion reset handles this; just confirm.

- [ ] **Step 6: Commit**

```bash
git add src/index.css
git commit -m "feat(visual): hover micro-interactions + active-page glow (Phase 2)"
```

---

## Self-Review

**Spec coverage** (against `2026-06-25-visual-phases-2-4-design.md` §Phase 2):
- 2.1 Parchment texture → Task 1 (token + `.parchment`, chrome only, editor excluded). ✓
- 2.2 Layered elevation → Task 2 (`.elevated`: hairline + shadow + inner highlight on cards/infobox/modals). ✓
- 2.3 Ornamental dividers → Task 3 (`.ornament-divider` on `<hr>`; Home section rule warmed). ✓
- 2.4 Micro-interactions → Task 4 (nav/page-link hover + active accent glow). ✓

**Placeholder scan:** No TBD/TODO; every CSS step shows the full before/after. ✓

**Type/name consistency:** Tokens/classes used consistently — `--parchment-noise` (Task 1), `.elevated` (Task 2), `.ornament-divider` (Task 3). No cross-task references that could drift. ✓

**Note on deviation from spec wording:** §2.3 says "replace … the section rule on Home." A centred flourish under a left-aligned heading reads awkwardly, so Task 3 Step 2 warms that underline with a gold-to-border gradient segment instead of a centred fleuron. The standalone-divider flourish is reserved for `<hr>`. This is the tasteful reading of the requirement; flagged here so it is a conscious choice, not a silent change.
