# Visual & Navigation Polish Roadmap

**Status:** living document · **Milestone:** [Visual & Navigation Polish](https://github.com/KantikPotatoe/lore-app/milestone/3)

The app has a mature, cohesive dark **parchment-and-ink** identity (see `src/index.css`),
recently reinforced by a "Visual foundations" pass (focus rings, themed scrollbars, warm
selection, reduced-motion — PR #67). This roadmap builds on that base: it makes the app
**more agreeable to navigate** and **richer to look at**, without changing the identity.

**Tier: polish.** Everything is built on the existing CSS-variable system — no new
framework, no re-skin. Each phase is a self-contained PR that can ship independently, and
each gets its own spec → plan → build cycle.

Deliberately **out of scope** for this tier (revisit later): illuminated drop-caps body
text, animated page backgrounds, and theme-switching.

---

## Phase 1 — Navigation & wayfinding

Highest day-to-day impact, lowest risk. The app is fast but it's easy to lose your place.

- **Route transitions** — a subtle ~120ms fade/slide as `<main>` content swaps, gated by
  the existing `prefers-reduced-motion` block. Movement reads as intentional, not jarring.
- **Page context header** — pages have no breadcrumb (only the map does). Add a lightweight
  `Category › Page` trail to `PageRoute`, the category linking back to `/browse/:category`.
- **Collapsible sidebar groups** — category headers get a chevron + remembered open/closed
  state (localStorage). Essential once a world has many categories.
- **Recently viewed** — a small recents strip so jumping back is one click.
- **Back-to-top** on long pages + scroll reset on route change.

## Phase 2 — Depth & texture

Make surfaces feel like layered material, not flat rectangles.

- **Parchment texture** — one low-opacity SVG fibre/noise overlay on `--panel` surfaces
  (infobox, cards, modals). A single reusable class, near-zero perf cost.
- **Layered elevation** — replace flat single borders with hairline + soft shadow + faint
  inner top-highlight, so cards read as raised vellum.
- **Ornamental dividers** — swap plain `<hr>` / section rules for a small centred gold
  flourish (pure CSS, no images).
- **Micro-interactions** — extend the existing card-lift hover to nav items and buttons;
  gentle accent glow on the active page.

## Phase 3 — Page identity

Make a Character *feel* different from a Location from an Event. Every page type already
carries a colour (`TYPE_COLORS` / category colour) — this phase leans into it.

- **Type-tinted page chrome** — the header's left accent border, the infobox title bar, and
  a subtle header wash derive from the page's category colour (some already exists for the
  infobox; extend it consistently across the page).
- **Category glyph** in the page header beside the title.
- Result: navigating between pages gives an at-a-glance "what kind of thing is this."

## Phase 4 — Empty & first-run states

Turn barren screens into invitations.

- **Designed empty states** for: no pages, empty category, no map, no timeline events, and
  empty graph — each with an icon/ornament, one line of warmth, and the (already-existing)
  primary CTA.
- **First-run nudge** on a brand-new world pointing at "create your first page."
