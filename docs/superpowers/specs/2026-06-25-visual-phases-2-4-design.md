# Visual Polish — Phases 2–4 Design

**Date:** 2026-06-25
**Issues:** #69 (Phase 2 — Depth & texture), #70 (Phase 3 — Page identity),
#71 (Phase 4 — Empty & first-run states)
**Milestone:** Visual & Navigation Polish (milestone 3)

## Framing

Visual foundations (focus rings, themed scrollbars, warm selection, reduced-motion)
and Visual Phase 1 (navigation & wayfinding) have shipped. Phases 2–4 add the next
three layers: surfaces that feel like layered material, pages that carry their type's
identity, and barren screens that become invitations.

**Intensity target: _moderate / characterful_.** Noticeable parchment grain, clear
ornamental dividers, distinct type-colour washes — leaning into the fantasy-tome
identity without going baroque. Every effect must be dial-back-able from a single
token or class.

**Structure:** one spec (this document), then **three sequential builds** — Phase 2 →
3 → 4 — each its own commit/PR so the diff stays reviewable. Each phase has its own
implementation plan.

## Shared technical approach

- **CSS-only, token-driven, additive.** Everything builds on the existing
  `src/index.css` CSS-variable system. No new dependencies, no component rewrites.
- **New tokens** go in `:root`. **New effects become reusable utility classes**
  (`.parchment`, `.elevated`, `.ornament-divider`, `.empty-state`) applied to existing
  elements rather than bespoke per-component CSS.
- **Textures are inline SVG data-URIs in CSS** — local-first, no asset files.
- **Type-colour tinting reuses the colour already computed** by `categoryColor()`
  (`src/db/schema.ts`) / `TYPE_COLORS`, threaded to the page as a CSS custom property
  (`--type-color`) set inline on the page wrapper.
- **All motion/texture sits behind the existing `prefers-reduced-motion` block** — no
  new reduced-motion handling needed; the global reset already neutralises transitions.

---

## Phase 2 — Depth & texture

Make surfaces feel like layered material, not flat rectangles.

### 2.1 Parchment texture

A reusable `.parchment` class adds one low-opacity fibre/noise SVG as a
`background-image` layered under the `--panel` fill.

- Moderate intensity: **~3–5% opacity, fine grain.**
- Applied to **big chrome surfaces**: infobox, cards (`.lore-card`, `.ov-card`,
  `.browse-card`), modals, sidebar.
- **Not** applied to text-dense reading areas — the editor body (`.ProseMirror`)
  stays clean for legibility.
- Single source: one SVG data-URI defined once (a token or a single rule), so opacity
  and grain are tuned in one place.

### 2.2 Layered elevation

A `.elevated` utility gives panels three stacked depth cues so they read as lit from
above rather than as flat fills:

- hairline `--border`,
- a soft drop shadow,
- a 1px inner top highlight (`inset 0 1px 0 rgba(255,255,255,.04)`).

Applied to `.lore-card`, `.infobox`, `.modal-dialog`, `.ov-card`. Replaces the current
flat `border`-only treatment.

### 2.3 Ornamental dividers

A `.ornament-divider` class: a centred gold flourish, **pure CSS** — a thin `--border`
rule with a small gold diamond/fleuron centred via `::before`.

- Moderate intensity: visible but small (~10px glyph, muted gold using `--accent`).
- Replaces plain `<hr>` in the editor render (`.ProseMirror hr`) and article bodies,
  and the section rule on Home (`.home-section h2` bottom border).

### 2.4 Micro-interactions

- Extend the existing `.lore-card` hover-lift pattern to **nav items** (`.nav-item`,
  `.page-link`) and **buttons** (subtle).
- Add a soft gold **accent glow** (a `box-shadow` ring in `--accent`) on the **active**
  page link in the sidebar, reinforcing "where am I".
- Durations ~120ms; already covered by the reduced-motion reset.

**Files:** `src/index.css` (the bulk), plus a small class addition where the editor
renders horizontal rules. No data or logic changes.

---

## Phase 3 — Page identity

Make a Character page feel distinct from a Location or Event, driven by the category
colour each page type already carries.

### Mechanism

`PageRoute` sets `style={{ '--type-color': categoryColor(page.category) }}` on the page
wrapper (`.page-view`). All tinting derives from that one custom property, so it stays
in sync with the type and needs **zero new data**. Where a page's category resolves to
no specific colour, `--type-color` falls back to gold (`--accent`).

### 3.1 Type-tinted page chrome

- **Header left accent** — _already implemented_: `.page-header` receives an inline
  `borderColor: categoryColor(page.category)` today (`PageRoute.tsx:127`). This phase
  re-expresses it through `--type-color` for consistency with the new wash, but the
  visible behaviour is unchanged.
- **Header wash** — a subtle gradient behind the title area: `--type-color` at very low
  alpha (moderate: ~8–10% at the edge) fading to transparent. Extends the tint the
  infobox already uses across the page header.
- **Infobox title bar** — already coloured per type; ensure it reads from the same
  `--type-color` so header and infobox match exactly.

**Contrast guard:** the wash stays well under the title text so `--ink` on the washed
background remains AA-legible.

### 3.2 Category glyph

The page type's `icon` emoji — already stored on templates and shown on map
pins/legend — rendered beside the page title in `.page-header`. Pages whose type has no
icon show **no glyph and no placeholder**. The icon is read from the already-loaded
`templates` array (`templates.find(t => t.name === page.category)?.icon`).

**Files:** `src/routes/PageRoute.tsx` (set `--type-color`, render glyph),
`src/index.css` (header wash, tint hooks). Reads existing `icon`/colour — no schema
change.

---

## Phase 4 — Empty & first-run states

Turn barren "nothing here yet" screens into invitations. Extends the existing light
pattern in `.map-empty` / `.browse-empty`.

### 4.1 Designed empty states

A single reusable **`EmptyState` component** + `.empty-state` class — ornament/icon,
one warm line, the existing primary CTA — applied to the five barren screens:

| Screen | Route | Copy (warm line) | CTA |
|---|---|---|---|
| No pages | Home / sidebar | "Your world is unwritten." | Create page |
| Empty category | `CategoryRoute` | tailored to the category | Create in category (reuses existing `.browse-empty` action) |
| No map | `MapRoute` | existing `.map-empty` copy | Upload a map (restyle to shared component) |
| No timeline events | `TimelineRoute` | "History hasn't been recorded yet." | Add event |
| Empty graph | `GraphRoute` | "No connections to map yet." | Hint to add `[[links]]` |

Each ornament is a **CSS/emoji glyph** (consistent with the local-first, no-asset-files
approach) — **not commissioned artwork**. Moderate intensity: a large muted glyph inside
a faint gold-ringed circle, the warm line in serif (`--serif`), then the CTA. This
consolidates the existing one-off empties (`.map-empty`, `.browse-empty`) into one
component.

### 4.2 First-run nudge

A brand-new world (zero pages) **is** the first-run condition, so the first-run pointer
is folded **into the no-pages empty state's copy** rather than a separate dismissable
banner. This avoids a new persisted "seen" flag and any banner-dismissal state. (A
distinct dismissable nudge persisted in `meta` was considered and rejected as
unnecessary complexity.)

**Files:** new `src/components/EmptyState.tsx`, wired into
`HomeRoute`/`CategoryRoute`/`MapRoute`/`TimelineRoute`/`GraphRoute`; `.empty-state` CSS.

---

## Out of scope

- New visual dependencies or asset/image files (textures and ornaments are inline SVG /
  CSS / emoji).
- Per-page colour overrides — identity strictly derives from the page type's colour
  (same principle as map pins).
- Changes to the editor reading surface's texture (kept clean for legibility).
- A separate persisted first-run banner.

## Verification (per phase)

Each phase's build must pass `npm run lint`, `npm run build`, and `npm run test:run`
before it is claimed done (per CLAUDE.md / CI). These are visual changes with no logic
branches, so verification is primarily: the three gates stay green, plus a manual look
at the affected screens (including a `prefers-reduced-motion` pass and a brand-new
zero-page world for Phase 4).
