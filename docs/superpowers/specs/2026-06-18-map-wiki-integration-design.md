# Map Wiki Integration — Design

**Date:** 2026-06-18
**Status:** Approved, ready for implementation plan
**Phase:** 2 of 4 in the [Map Feature Roadmap](../../map-roadmap.md)
**Depends on:** Phase 1 (Typed Pins, PR #50) — builds on its `MapView.tsx` / `MapRoute.tsx` changes.

## Context

Lore Codex is a local-first worldbuilding wiki. After Phase 1, map pins inherit
their colour/icon from their linked page's type, can be dragged, and are filterable
via a legend. They still don't participate in the app's **navigation** fabric the way
wiki links do: you can't preview a pin's page without opening it, and from a page
there's no way to find where it sits on a map.

Two pieces of infrastructure already exist and make this phase mostly wiring:

- **`src/wikiLinkHover.ts`** — a module-level hover bus. It already exposes
  `showPageHover(pageId, title, rect)` for callers that *know* the page id (backlinks,
  sidebar, search), plus `scheduleWikiHoverClose()` / `cancelWikiHoverClose()`.
- **`src/components/WikiLinkPopover.tsx`** — mounted once at the app root
  (`position: fixed`, `z-index: 950`), it renders the floating preview card (category
  chip, title, summary, infobox image) and handles loading/missing states.

Pins store a `pageId` (`MapPin` in `src/db.ts`), so they can drive `showPageHover`
directly — no title resolution needed.

## Goal

Make pins navigable members of the wiki: **hover a pin to preview its page**, and
**jump from a page to its pin on the map**. No new data model; reuse existing
infrastructure.

## Design

### Part A — Hover previews on pins (`src/components/MapView.tsx`)

Pin markers are Leaflet `divIcon`s (HTML elements rendered into the map container).
Wire hover the same way `LoreEditor` wires `a[data-wikilink]`: delegated mouse events
on the map container, feeding the existing hover bus.

- `makeIcon()` stamps `data-pin-id` on the `.pin-icon` element **only for pins that
  have a `pageId`** (unlinked pins are not stamped, so they get no preview). To do
  this, `makeIcon` needs the pin's `id` and `pageId` (or a precomputed flag) in
  addition to its current `label`/`style`/`selected` arguments.
- Add a delegated `mouseover` / `mouseout` listener on the map container (attached
  once, like the existing click handling). On `mouseover` of an element inside a
  `.pin-icon[data-pin-id]`, resolve the pin from the rendered `pins`/marker map, then
  call `showPageHover(pin.pageId, pin.label, rect)` where `rect` is the marker
  element's `getBoundingClientRect()`. On `mouseout`, call `scheduleWikiHoverClose()`.
- The popover is already mounted at the app root, so it escapes the Leaflet
  container's stacking/overflow — no new mounting and no portal needed.
- **Suppression:** hover previews are suppressed while **dragging** and while
  **add-mode** is active (mirrors how `LoreEditor` suppresses link hovers in edit
  mode), so a popover never fights a drag or a placement click.

**Behaviour summary**

- Linked pin → rich popover (the same card wiki links show).
- Unlinked pin → keeps its always-visible label; no popover (nothing to preview).
- The popover's own `onMouseEnter`/`Leave` keep-open logic is untouched.

No data-model change.

### Part B — "Show on map" (page → pin)

#### Page side (`src/routes/PageRoute.tsx`)

A compact **"Location" block in the page's right sidebar (`.page-aside`), directly
below the infobox card**, owned by `PageRoute` — *not* inside `Infobox.tsx`. This
matters: `Infobox` returns `null` in view mode when it has no content
(`Infobox.tsx`), so a row inside it would disappear for a page that has a pin but an
empty/absent infobox. Owning the block in `PageRoute` decouples it from that guard.

- **Visibility:** view mode only; rendered only when ≥1 pin links this page.
- **Data:** a `useLiveQuery` reading the pins that link this page
  (`db.pins.where('pageId').equals(id).toArray()`), joined to their maps
  (`db.maps`) for display names.
- **By pin count:**
  - **0 pins** → block not rendered.
  - **1 pin** → a single "📍 Show on map" button → `navigate('/map?pin=<pinId>')`.
  - **multiple pins** → the block lists one row per pin (**map name + pin label**),
    each navigating to `#/map?pin=<thatPinId>`. This is the map picker.

#### Map side (`src/routes/MapRoute.tsx` + `src/components/MapView.tsx`)

- `MapRoute` reads `?pin=<id>` via `useSearchParams` (works under the app's
  `HashRouter`). When the param is present and resolves to a pin:
  - set `activeId` to that pin's `mapId` (switches the displayed map),
  - set `selectedPinId` to the pin (opens the existing pin panel),
  - pass the pin id to `MapView` as a new optional `focusPinId` prop.
- `MapView` gains an optional `focusPinId?: string | null`. An effect **keyed on
  `focusPinId`** pans the Leaflet map to that pin's lat/lng (a gentle `setView` at a
  readable zoom) once a marker for it exists, so it fires once per navigation rather
  than on every render.
- The `?pin=` param is left in the URL (bookmarkable / survives reload). Selecting or
  clicking other pins only updates local state; switching maps via the dropdown
  clears the selection (and the existing reset already clears `hiddenTypes`).

#### Edge cases

- **Stale / deleted pin id in the URL** → no-op: no map switch, nothing selected,
  no pan. The map opens to its normal default (first map).
- **Pin whose linked page was deleted** → the page route can't render the block for a
  non-existent page, so this can't originate from Part B; on the map side it's just a
  pin that resolves but has no preview (already handled by Phase 1 as "Untyped").

## Data flow

```
Hover (Part A):
  pin marker mouseover ─► showPageHover(pin.pageId, pin.label, rect)
                          └─► WikiLinkPopover (app root) renders card

Show on map (Part B):
  PageRoute: db.pins.where(pageId) ─► Location block ─► navigate(#/map?pin=<id>)
  MapRoute: useSearchParams ?pin ─► activeId = pin.mapId, selectedPinId = pin.id
                                    └─► MapView focusPinId ─► panTo(pin.latlng)
```

## Out of scope (deferred to later phases)

- Creating or placing a pin **from** a page (a page with no pin shows no block; you
  still add pins on the map). — Map-management / authoring concern.
- Hover previews for **unlinked** pins or a label-only tooltip.
- Regions/polygons (Phase 3); nested maps, pin search, jump-between-maps (Phase 4).
- Persisting the last-viewed map or selection beyond the `?pin=` deep link.

## Testing

The project has no automated test suite. Validate manually (`npm run dev`, port 5174):

- **Hover preview:** hover a linked pin → the page preview card appears after the
  usual delay, with category chip / title / summary / infobox image; moving into the
  card keeps it open; moving away dismisses it. Hover an unlinked pin → no card.
- **Suppression:** while dragging a pin, no card appears; with "Add pin" active,
  hovering existing pins shows no card.
- **Show on map (single):** on a page with exactly one pin, the Location block shows
  one button; clicking it opens the map to the right image, selects the pin, opens the
  pin panel, and pans to the pin.
- **Show on map (multiple):** on a page pinned on two maps, the block lists both
  (map name + label); each row opens the correct map and pin.
- **No pins:** a page with no linking pin shows no Location block.
- **Empty infobox:** a page with a pin but no infobox content still shows the block.
- **Deep link / reload:** reloading on `#/map?pin=<id>` re-selects and re-pans;
  a stale/deleted pin id is a harmless no-op.

## Files touched

- `src/components/MapView.tsx` — `data-pin-id` stamping, delegated hover listeners,
  `focusPinId` prop + pan effect.
- `src/routes/MapRoute.tsx` — read `?pin=`, resolve pin across maps, drive
  `activeId` / `selectedPinId` / `focusPinId`.
- `src/routes/PageRoute.tsx` — pins-for-page live query + the Location block UI.
- `src/index.css` — Location block styling (reusing infobox/aside idioms).

No new files; no Dexie schema change.
