# Map Feature Roadmap

**Status:** living document · **Milestone:** [Map Feature Roadmap](https://github.com/KantikPotatoe/lore-app/milestone/2)

The map (`src/routes/MapRoute.tsx` + `src/components/MapView.tsx`, data in `src/db.ts`)
lets a user upload an image as a world map and drop pins on it. Historically it was the
one feature that did **not** participate in the rest of the app's ecosystem — pages have
types (`InfoboxTemplate`: a named, coloured category), hover previews, backlinks, a graph,
and timelines, and pins ignored all of it.

This roadmap brings the map into that ecosystem over four phases. Each phase is its own
spec → plan → build cycle.

---

## Phase 1 — Typed Pins ✅ *(shipped — PR #50)*

Pins become first-class citizens of the typed/coloured system with the least possible
duplicated data.

- Pins inherit **colour + icon** from their linked page's type. Type is **derived, never
  stored** (`pin.pageId → page.category → template`) via the `pinType()` helper in
  `db.ts`, so a pin can never drift from its page's type and edits propagate live.
- **Drag-to-reposition** (disabled while placing a new pin).
- **Legend + filter panel** — one row per type present on the map (swatch + icon + name +
  count), click to toggle visibility; unlinked pins group under "Untyped".
- Page types gain an optional `icon` emoji, set on the Templates screen.

Specs: `docs/superpowers/specs/2026-06-17-typed-pins-design.md` ·
Plan: `docs/superpowers/plans/2026-06-17-typed-pins.md`

---

## Phase 2 — Wiki integration ✅ *(shipped — PR #55)*

Connect pins to the wiki-navigation features pages already enjoy.

- **Hover previews on pins** — reuse the existing `WikiLinkPopover` floating card
  (category chip, title, summary, infobox image) on pin hover.
- **"Show on map"** — an action on a page that jumps to and selects that page's pin on the
  relevant map.

---

## Phase 3 — Regions ✅ *(shipped — PR #63)*

Areas, not just points.

- **Leaflet polygons** for territories/biomes — drawable areas with their own labels,
  colours, and links to pages (e.g. a kingdom's borders, a forest).

---

## Phase 4 — Map management ✅ *(shipped — PR #64)*

Scale to many maps.

- **Nested maps** — continent → region → city drill-down.
- **Pin search** + a clickable pin list that centres/selects a pin.
- **Jumping between maps.**

---

## Explicitly out of scope (by design)

- **Per-pin colour or icon override.** The model is strictly derive-from-type so a pin can
  never drift from its linked page's type. Changing a pin's appearance means changing its
  page's type (or the type's colour/icon on the Templates screen).
