# Add pins (and regions) inside regions — design

Issue #90 (Roadmap #14): "Currently you can't add a pin within a region on a map."

## Problem

In `src/components/MapView.tsx`, every region polygon's click handler
unconditionally calls `L.DomEvent.stopPropagation(e)` before selecting the
region. That stops the click from reaching the Leaflet map's `click` handler,
which is what places a pin (`MapRoute.handleMapClick` via `onMapClick`). The
leaflet-draw polygon drawer also relies on map-level clicks. So any click that
lands on a region selects that region instead of placing a pin or feeding the
drawer — you can't drop a pin inside a region, nor draw a region inside one.

## Fix

Make the region click handler mode-aware. When **add-pin mode** or
**draw-region mode** is active, the handler returns early *without* stopping
propagation, letting the click fall through to the map (place pin) or the
leaflet-draw drawer (draw region). Otherwise it behaves exactly as today:
stop propagation and select the region.

```js
p.on('click', (e) => {
  // While placing a pin or drawing a region, let the click reach the map
  // beneath so it can drop a pin / feed the drawer instead of selecting us.
  if (addModeRef.current || drawModeRef.current) return
  L.DomEvent.stopPropagation(e)
  cbRef.current.onRegionClick(region.id)
})
```

`addModeRef` and `drawModeRef` already exist and are kept current, so no new
state or props are required.

## Scope / non-goals

- One handler change in `src/components/MapView.tsx`. No data-model, schema, or
  DB changes. A pin placed over a region is an ordinary pin at those
  coordinates — no parent/child relationship is implied.
- Region hover previews are already suppressed during these modes; unchanged.
- Clicking an existing pin marker while in add-mode still selects that pin
  (can't stack a pin exactly on another) — unchanged, acceptable.

## Testing

The region click handler is imperative Leaflet glue inside a `useEffect`, not
reachable by the pure-helper unit tests (`src/db/maps-nesting.test.ts`).
Verify manually in the running app:

1. Add-pin mode → click inside a region → a pin drops at the click point.
2. Add-region mode → draw a polygon overlapping a region → new region created.
3. No mode → click a region → region still selects (regression check).

Note in the PR that this path isn't unit-testable without a Leaflet DOM
harness, consistent with the rest of `MapView`.
