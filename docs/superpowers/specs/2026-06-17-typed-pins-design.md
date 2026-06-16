# Typed Pins — Design

**Date:** 2026-06-17
**Status:** Approved, ready for implementation plan
**Phase:** 1 of 4 in the Map feature roadmap

## Context

Lore Codex is a local-first worldbuilding wiki. The map feature (`MapRoute.tsx` +
`MapView.tsx`, data in `db.ts`) lets a user upload an image as a world map and drop
pins on it. Each pin has a text `label` and an optional linked `LorePage`
(`pageId`). Pins render as plain dots-with-labels via Leaflet's `Simple` CRS.

The map is the one feature that does not yet participate in the rest of the app's
ecosystem: pages have **types** (`InfoboxTemplate` — a named, colored category with
an icon-less infobox starter), colored categories, hover previews, backlinks, a
graph, and timelines. Pins ignore all of it.

### Roadmap (agreed, this spec covers Phase 1 only)

1. **Typed pins** ← this spec. Pins inherit color/icon from their linked page's
   type; drag-to-reposition; legend + filter panel.
2. **Wiki integration.** Hover previews on pins, "Show on map" from a page.
3. **Regions.** Leaflet polygons for territories/biomes with labels, colors, links.
4. **Map management.** Nested maps (continent → city), pin search, jump between maps.

Each phase is its own spec → plan → build cycle.

## Goal

Make pins first-class citizens of the typed/colored system the rest of the app
already uses, with the least possible duplicated data.

## Design

### 1. Data model — `src/db.ts`

- **`InfoboxTemplate` gains `icon?: string`** — an emoji, mirroring the existing
  optional `TimelineEvent.icon`. Set per type on the Templates screen.
  - `seedTemplates()` backfills sensible default icons onto the built-in types,
    using the **same non-destructive pattern as the existing color backfill**
    (only fills when absent; never overwrites a user's edit).
  - This is the only schema-shaped change. Adding an optional field to records in
    an existing table does not require a Dexie version bump (no new index), but
    confirm against the current schema version during implementation.
- **`MapPin` is unchanged.** Type, color, and icon are **derived, never stored**.
  A pin resolves its type by: `pin.pageId` → page → `page.category` → template →
  `{ color, icon }`. Deriving (not storing) guarantees the pin can never drift
  from the linked page's type.
- **Unlinked pins** (`pageId === null`) and pins whose linked page/type cannot be
  resolved fall back to a **neutral gray dot with no icon**. The pin panel nudges
  the user to link a page to give the pin a type.
- **New helper** `pinStyle(pin, pagesById, templatesByName) → { color, icon, label }`
  (or equivalent signature) centralises this resolution so markers and the legend
  compute style identically. Reuses `categoryColor()`/the templates cache where
  natural.

### 2. Rendering — `src/components/MapView.tsx`

- `makeIcon()` is extended to take `{ color, icon, selected }`:
  - The dot is tinted with the type `color`.
  - If `icon` is present, render it inside/above the dot.
  - Selected state keeps the current visual emphasis.
- **Drag-to-reposition:** markers are created with `draggable: true`; on `dragend`
  persist the new `lat`/`lng` via `db.pins.update(...)`. Dragging is **disabled
  while add-mode is active** to avoid click/drag conflicts.
- Markers re-render when a pin's **derived** style changes (type color/icon edited,
  or pin relinked). `MapRoute` already feeds `pins` and `allPages` reactively via
  `useLiveQuery`; add a reactive `templates` read so type edits propagate live.

### 3. Legend + filter panel — `src/routes/MapRoute.tsx`

- A corner-overlay panel listing each **type present on the current map**: color
  swatch + icon + name + pin count. Unlinked/untyped pins group under an
  **"Untyped"** row.
- Clicking a type **toggles visibility** of its pins. Hidden types are filtered out
  of the `pins` array passed to `MapView`, so `MapView` needs no marker-hiding
  logic of its own.
- Filter state is **local component state**, resets per map, **not persisted**.

### 4. Templates screen — `src/routes/TemplatesRoute.tsx`

- Each type row gets an **icon field** beside its color control: a small text/emoji
  input accepting a single emoji/character. If a lightweight emoji picker already
  exists in the codebase, reuse it; otherwise a plain input is acceptable.
- Wired through the existing `updateTemplate()`.

## Data flow

```
templates (useLiveQuery) ─┐
pages     (useLiveQuery) ─┼─► pinStyle() ─► markers (MapView) + legend rows
pins      (useLiveQuery) ─┘                     │
                                                └─ legend filter (local state)
                                                   ► filtered pins ► MapView
```

Editing a type's color/icon, relinking a pin, or dragging a pin all flow back
through Dexie and re-render reactively.

## Out of scope (deferred to later phases)

- Pin search; clickable pin list that centers/selects a pin.
- Jumping between maps; nested maps.
- Hover previews on pins ("Wiki integration" phase).
- Regions/polygons.
- Per-pin icon or color override (the model is strictly derive-from-type).

## Testing

The project has no automated test suite. Validate manually:

- Type with an icon → linked pins show that color + icon; editing the type updates
  pins live.
- Unlinked pin → neutral gray dot, no icon; grouped under "Untyped" in the legend.
- Drag a pin → new position persists across reload; dragging is off in add-mode.
- Legend toggle hides/shows the right pins; count is correct; resets when switching
  maps.
- Templates screen: setting/clearing an icon round-trips through `updateTemplate()`.
- Backup export/import round-trips the new template `icon` field.
