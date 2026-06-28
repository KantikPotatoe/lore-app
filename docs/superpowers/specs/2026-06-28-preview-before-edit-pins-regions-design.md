# Preview-before-edit for pins/regions (#91)

**Status:** Approved (design)
**Issue:** #91 — Roadmap #15
**Date:** 2026-06-28

## Problem

Clicking a pin or region on the map jumps straight into the corner edit panel
(`.pin-panel`: label input, linked-page select, colour, opens-map, delete).
There is no calm, read-only step to *look at* what a marker points to before
mutating it. Issue #91 asks for a preview card (reusing the `WikiLinkPopover`
visual pattern) shown on click, with an explicit **Edit** action that opens the
existing edit panel.

## Current behaviour (baseline)

- `MapView` renders pins as Leaflet markers and regions as polygons. A marker
  `click` calls `onPinClick(id)`; a polygon `click` calls `onRegionClick(id)`
  (both `stopPropagation` so the map's own `click` doesn't also fire).
- `MapRoute` stores `selectedPinId` / `selectedRegionId`. Whenever one is set,
  the corner `.pin-panel` edit form renders immediately.
- A *hover* over a **linked** pin/region already shows a transient read-only
  card through the app-wide `wikiLinkHover` bus → `WikiLinkPopover`
  (category chip + title + summary + infobox image).
- `useEscapeKey` backs out one layer at a time: find panel → selected pin →
  selected region → add mode → draw mode.

So there are two layers today: a hover preview (linked items only) and an
instant edit panel (on click). This feature inserts a deliberate **preview step
on click** before edit.

## Design

### 1. Selection state model — `MapRoute`

Introduce a panel **mode** alongside the existing selection ids:

```ts
type PanelMode = 'preview' | 'edit'
const [panelMode, setPanelMode] = useState<PanelMode>('preview')
```

- Clicking a pin/region (`onPinClick` / `onRegionClick`) selects it **and** sets
  `panelMode='preview'`.
- The preview card renders when a pin/region is selected and `panelMode==='preview'`.
- The **existing** corner `.pin-panel` edit form renders when a pin/region is
  selected and `panelMode==='edit'`. Its contents are unchanged.
- `switchToMap`, `focusPin`, and `focusRegion` reset `panelMode='preview'`
  (Find-panel results land in preview, consistent with map clicks).
- **Esc ladder** extends to back out one layer: when `panelMode==='edit'`, Esc
  drops to `'preview'`; when in preview with a selection, Esc deselects. Other
  rungs (find, add mode, draw mode) are unchanged.

No change to how pins/regions are persisted — the edit panel still writes
through `db.pins.update` / `db.regions.update`.

### 2. Anchoring & tracking — `MapView`

`MapView` owns the Leaflet map, so it positions the card. It renders an
absolutely-positioned **overlay wrapper** inside the map container (`.map-canvas`)
at the selected target's screen position:

- Pin: `map.latLngToContainerPoint([pin.lat, pin.lng])`.
- Region: centre of the polygon's bounds (`poly.getBounds().getCenter()` →
  `latLngToContainerPoint`).

The wrapper repositions on Leaflet `move` / `zoom` / `resize` events by mutating
its own `style.transform` directly — **no React re-render per frame** (the same
technique Leaflet tooltips/markers use). The wrapper is shown only while a
preview is open.

`MapView` stays ignorant of card *contents*. It gains:

- a prop describing the **anchor target** (kind + id, or null), and
- a `previewCard?: React.ReactNode` prop it renders inside the positioned wrapper.

`MapRoute` builds the node (it has the resolved page data and the
navigate/switch handlers).

**Dismissal:** a background map `click` while not in add/draw mode clears the
selection (closes the card). Pin/region clicks already `stopPropagation`, so they
don't bubble to the map. (`handleMapClick` currently early-returns unless
`addMode`; it will also clear selection in the idle case.)

### 3. Preview card component — `MapPreviewCard`

A new **presentational** component (props in, callbacks out → unit-testable with
React Testing Library, no Leaflet needed). Styled with the existing
`.wiki-hover-popover` / `.popover-*` classes plus a small additions block for the
action row.

Props (shape, not final signature):

```ts
interface MapPreviewCardProps {
  label: string                 // pin/region label
  page: LorePage | null         // resolved linked page, or null if unlinked
  isPortal: boolean             // has childMapId
  onEdit: () => void
  onOpenPage?: () => void       // present only when page != null
  onEnterMap?: () => void       // present only when isPortal
  onClose: () => void
}
```

Rendering:

- **Linked** (`page != null`): infobox image (if any) + category chip
  (`categoryColor(page.category)`) + page title + summary, with the marker label.
- **Unlinked** (`page == null`): just the marker label and a hint.
- Action row: **Edit** (always) · **Open page →** (if linked) ·
  **Enter map →** (if portal) · **×** close (in the header).

`MapRoute` resolves the linked page from its existing `pagesById` map, so no new
DB query is needed.

### 4. Hover-preview coexistence

The hover popover stays. To avoid two cards on the same element, `MapView`'s
delegated hover handler (`over`) skips a pin/region whose id equals the currently
selected target — it already receives `selectedPinId` / `selectedRegionId` as
props. Hovering a *different* marker while a card is open still previews normally.

### 5. Edit panel

Unchanged. It is simply gated behind `panelMode==='edit'` instead of rendering on
selection. The preview's **Edit** button sets `panelMode='edit'`. Preview is a
floating card at the marker; edit remains the corner `.pin-panel` (existing
layout, not rebuilt).

## Components & data flow

```
MapRoute
  ├─ state: selectedPinId, selectedRegionId, panelMode
  ├─ resolves selected page from pagesById
  ├─ builds <MapPreviewCard …/> node           ── passed as prop ──┐
  └─ renders MapView (anchor target + previewCard prop)            │
                                                                    ▼
MapView (Leaflet)
  ├─ positions an overlay wrapper at the anchor (latLngToContainerPoint)
  ├─ tracks it on move/zoom/resize (direct DOM, no re-render)
  ├─ renders {previewCard} inside the wrapper
  ├─ background map click (idle) → onMapClick clears selection
  └─ hover handler skips the selected target's id
```

## Testing

- `src/components/MapPreviewCard.test.tsx` (RTL):
  - linked page renders chip + title + summary; unlinked renders label only;
  - **Edit** always present and fires `onEdit`;
  - **Open page →** present iff `page != null`, fires `onOpenPage`;
  - **Enter map →** present iff `isPortal`, fires `onEnterMap`;
  - **×** fires `onClose`.
- Leaflet positioning/tracking in `MapView` stays untested, consistent with the
  repo (no existing `MapView`/`MapRoute` tests; Leaflet needs a real DOM).
- Run `npm run lint`, `npm run build`, `npm run test:run` before claiming done
  (CI gate).

## Out of scope (YAGNI)

- Editing pin/region fields inline from the preview card (Edit opens the full
  panel).
- Reworking the corner edit panel's layout or making it float.
- Changing the hover popover's content or behaviour beyond the same-target skip.
- Keyboard navigation between markers.

## PR / versioning

New feature → PR label **`version:minor`** (per CLAUDE.md version-label policy).
