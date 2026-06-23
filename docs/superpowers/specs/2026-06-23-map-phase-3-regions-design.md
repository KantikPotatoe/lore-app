# Map Phase 3 — Regions (Leaflet polygons)

**Issue:** [#52](https://github.com/KantikPotatoe/lore-app/issues/52) · **Milestone:** Map Feature Roadmap · **Roadmap:** `docs/map-roadmap.md`

Drawable areas on a map (territories, biomes) with their own labels, colours, and
optional links to pages — the area-shaped counterpart to typed pins. Pins (Phase 1)
are points that derive colour/icon strictly from their linked page's type; regions
are filled polygons that mostly do the same but allow a per-region colour override,
because area fills carry colour meaning that points don't (e.g. a political map with a
distinct colour per kingdom).

## Goals

- Draw a polygon on a map, give it a label, optionally link it to a page.
- Region colour is **hybrid**: derived from the linked page's type by default, with an
  optional per-region override; neutral grey when neither applies.
- Regions reach pin parity for the wiki ecosystem: legend filter, hover preview card,
  selection panel with "Open page".
- Regions survive export/import like every other table.

## Non-goals (v1)

- Per-region z-order / layering controls.
- Polygon holes or multi-polygons.
- Vertex snapping, region-to-region adjacency, area calculations.
- Changing the **pin** model (per-pin colour override remains out of scope).

## Colour model

Hybrid, resolved as `region.color ?? derivedTypeColour ?? grey`:

- `region.color` set ⇒ use it (override).
- else if the region links to a page ⇒ use that page's type colour (the exact pin
  pipeline: `pageId → page → page.category → template.color`, falling back to
  `categoryColor`).
- else ⇒ neutral grey `#a0a0a0`.

The **legend/filter bucket is always the *derived* type** (from `pageId`), independent
of any colour override. Toggling a type in the legend hides that type's pins *and*
regions uniformly. A region with an override colour but no linked page buckets under
"Untyped" (same as an unlinked pin), and is hidden/shown by the Untyped legend row.

Regions do not show the type emoji icon (pins do); only the fill + a centred label.

## Data model — `src/db/types.ts`

```ts
/** A drawable area on a map (territory, biome…), optionally linked to a page. */
export interface MapRegion {
  id: string
  mapId: string
  points: [number, number][] // [lat, lng] vertices in CRS.Simple coords
  label: string
  pageId: string | null      // linked lore page, or null
  color?: string             // per-region override; absent ⇒ derive from page type
}
```

`points` are Leaflet `CRS.Simple` coordinates, the same space pins store `lat`/`lng`
in (see `MapView`). A polygon needs ≥ 3 vertices; the draw flow only emits a region
once the user closes a 3+-vertex shape.

## DB layer

### Schema — `src/db/schema.ts`

Add a Dexie **version 6** that carries every existing store forward unchanged and adds:

```
regions: 'id, mapId, pageId'
```

Register `regions!: Table<MapRegion, string>` on `LoreDB`.

### CRUD & resolution — `src/db/maps.ts`

- `addRegion(mapId: string, points: [number, number][]): Promise<string>` — inserts a
  region with `label: 'New region'`, `pageId: null`, no `color`. Returns the id.
- Extend `deleteMap` to cascade-delete the map's regions in the same transaction
  (`db.regions.where('mapId').equals(mapId).delete()`).
- Extract the shared type walk out of `pinType` into a private
  `typeFromPage(pageId, pagesById, templatesByName): PinType` so it is the single
  source of truth. `pinType` delegates to it.
- `regionStyle(region, pagesById, templatesByName): { color: string; typeName: string | null }`
  returns the resolved fill colour (`region.color ?? typeFromPage(...).color`) and the
  derived type name (the legend/filter bucket key; `null` ⇒ Untyped).
- Region label/pageId/colour edits and deletes happen inline via `db.regions.*` in the
  route, mirroring how pins use `db.pins.update`/`db.pins.delete`.

### Barrel — `src/db/index.ts`

Re-export `MapRegion`, `addRegion`, and `regionStyle` (the `export *` from `./maps`
covers the runtime helpers; the type re-export must be present so `barrel.test.ts`
passes).

## Rendering — `src/components/MapView.tsx`

Dependencies: add `leaflet-draw` and `@types/leaflet-draw`; import
`'leaflet-draw'` and `'leaflet-draw/dist/leaflet.draw.css'`.

New props alongside the pin props:

- `regions: MapRegion[]`
- `regionStyles: Map<string, { color: string }>`
- `selectedRegionId: string | null`
- `drawMode: boolean`
- `onRegionClick: (id: string) => void`
- `onRegionCreate: (points: [number, number][]) => void`
- `onRegionEdit: (id: string, points: [number, number][]) => void`

Behaviour:

- Polygons render in the default `overlayPane` (z-index 400), **below** the marker
  pane (z-index 600), so pins stay clickable on top. A `Map<string, L.Polygon>` ref is
  diffed against `regions` each render — add new, update `setLatLngs`/`setStyle`, remove
  deleted — the same pattern the marker sync uses.
- **Drawing is programmatic** (not the leaflet-draw control toolbar, to match the app's
  custom toolbar buttons): when `drawMode` turns on, `new L.Draw.Polygon(map).enable()`;
  on `L.Draw.Event.CREATED`, read the layer's latlngs and call `onRegionCreate`. The
  route then exits draw mode and selects the new region. Disable/teardown the draw
  handler when `drawMode` turns off or the component unmounts.
- **Editing**: when a region is selected, enable that polygon layer's leaflet-draw
  `.editing` handle (drag vertices, drag midpoints to insert); on deselect/save, read
  the latlngs and call `onRegionEdit`. Only the selected region is editable at a time.
- Each polygon: `bindTooltip(label, { permanent: true, direction: 'center', className: 'region-label' })`;
  `click` selects (stopping propagation so it doesn't also fire a map click);
  `mouseover`/`mouseout` reuse `showPageHover(pin.pageId, label, rect)` /
  `scheduleWikiHoverClose()` — suppressed while drawing or editing, mirroring the pin
  hover suppression.
- Style: `{ color: stroke, fillColor, fillOpacity: 0.25, weight: 2 }`, where `stroke`
  is the same colour (slightly darkened or full-opacity border). Selected region: higher
  `fillOpacity` and `weight`.

`MapView` keeps its existing pin responsibilities; regions are additive and share the
one Leaflet map instance.

## Route & UX — `src/routes/MapRoute.tsx`

- `liveQuery` the current map's regions (`db.regions.where('mapId').equals(mapId)`).
- Compute each region's `regionStyle` once per render (like `pinTypes`); derive
  `regionStyles` (id → `{ color }`) and `visibleRegions` (filtered by `hiddenTypes`
  using the derived type bucket).
- **Toolbar**: add a **"▱ Add region"** button toggling `drawMode`, mirroring the
  "📍 Add pin" button (turning one on clears the other and any selection).
- **Legend**: rows now count pins **and** regions per derived type; toggling a row hides
  both. Build the legend from pins and regions together; counts are combined per type
  key (Untyped covers unlinked pins and link-less regions).
- **Region panel** (parallel to the pin panel), shown when a region is selected:
  - **Label** — text input (`db.regions.update`).
  - **Linked page** — page `<select>` (`pageId`).
  - **Colour** — a row of `TYPE_COLORS` swatches plus a "Derive from type" default
    choice; selecting a swatch sets `region.color`, choosing the default clears it.
  - **Open page →** when linked; **Delete region** (clears selection).
- Selecting a region clears any selected pin and vice versa (one selection at a time);
  drawing modes clear selections.

## Backup — `src/db/backup.ts` + `src/routes/HomeRoute.tsx`

- Bump `CURRENT_SCHEMA_VERSION` to **6** (mirrors Dexie store version).
- Add `regions?: MapRegion[]` to `BackupData`; add `regions: number` to `BackupCounts`
  and populate it in `parseBackup`.
- `exportAll` reads `db.regions`; `importAll` clears and `bulkAdd`s `regions` inside the
  existing transaction (add `db.regions` to the transaction's table list).
- Add migration step `5: (d) => ({ ...d, regions: asArray(d.regions) })` so v5/legacy
  backups gain an empty `regions` array.
- No sanitization needed — a region carries no HTML (label is plain text, React-escaped;
  it never hits `dangerouslySetInnerHTML`).
- Update `fmtCounts` in `HomeRoute.tsx` to include `regions`.

## Testing

- **Data layer** (`maps`): `addRegion` inserts with defaults; `deleteMap` cascade-deletes
  regions; `regionStyle` precedence — override colour wins over derived, derived wins over
  grey, grey when unlinked & no override; derived type bucket is the page's category
  regardless of override.
- **Backup**: export then import round-trips regions; `migrateBackup` fills `regions` for a
  v5 and a legacy (no `schemaVersion`) backup; `parseBackup` counts include regions.
- **Barrel** (`barrel.test.ts`): auto-covers the new re-exports.
- **MapView**: Leaflet rendering and leaflet-draw interaction are not unit-tested
  (consistent with the current code, which has no MapView test); the testable logic lives
  in `regionStyle` and the route's pure derivations.

Run `npm run lint && npm run build && npm run test:run` before claiming done (CI gate).

## Risks / notes

- **leaflet-draw + CRS.Simple**: leaflet-draw assumes lat/lng but operates on the map's
  CRS; polygon drawing/editing works under `CRS.Simple`, but vertex-handle behaviour
  should be smoke-tested. Programmatic `L.Draw.Polygon`/`.editing` avoids the control
  toolbar's styling clash.
- **leaflet-draw maintenance**: a large, dated dependency. Accepted for the drawing/edit
  handles it provides; scoped to `MapView`.
- **Pane ordering**: relies on Leaflet's default pane z-order (overlay 400 < marker 600).
  No custom panes needed.
