# Map Phase 4 — Map management (nested maps, find panel, jumping)

**Issue:** [#53](https://github.com/KantikPotatoe/lore-app/issues/53) · **Milestone:** Map Feature Roadmap · **Roadmap:** `docs/map-roadmap.md`

Scale the map to many maps. Three features tell one story: maps form a tree via
**portals** (a pin or region opens a child map), you **navigate** that tree
(breadcrumb up, portal drill-down, dropdown anywhere), and a per-map **find panel**
jumps to any pin or region.

## Goals

- **Nested maps** — a pin or region can open a child map (continent → region → city).
- **Jumping between maps** — a breadcrumb up the ancestry, an "Enter map →" drill-down,
  and the existing all-maps dropdown for arbitrary jumps.
- **Find panel** — a searchable, clickable list of the current map's pins and regions;
  clicking centres + selects.
- All of it survives export/import like every other field.

## Non-goals (v1)

- A stored `parentMapId` field. The parent is **derived** from the incoming portal,
  consistent with the "derive, never store" model behind `pinType`/`regionStyle`.
- Cross-map search. The find panel is scoped to the active map (the global `SearchModal`
  already covers cross-page search; cross-map pin search can come later).
- Enforcing a strict single-parent tree. Multiple portals may target the same child; the
  breadcrumb picks one deterministically.
- Moving/reparenting maps via drag, a maps-tree sidebar, or thumbnails.
- Changing the pin/region colour model (per-pin override stays out of scope).

## Nesting model — portals (derived parent)

A pin **or** a region carries an optional `childMapId` — the map it opens. The portal
link is the **single source of truth**: a map's parent and full breadcrumb are derived by
finding which portal points to it. There is no `parentMapId` field to keep in sync.

- **Parent of a map M** = the `mapId` of any portal (pin or region) whose
  `childMapId === M`. None ⇒ M is top-level.
- **Breadcrumb of M** = walk up from M to the root: `[…ancestors, M]`. A `visited` set
  breaks any accidental cycle so the walk always terminates.
- **Multiple portals to the same child**: allowed. The parent lookup returns the first
  match by a deterministic order (pins before regions, then insertion order); the
  breadcrumb is stable for a given DB state.
- **Dangling portal**: if the target map is deleted, `childMapId` resolves to nothing —
  no drill-down, the panel shows no "Enter map →". No cascade or cleanup needed.

### Cycle prevention

When choosing a portal target in the selection panel, the picker offers all maps **except
the current map and its ancestors** (so a map can never open one of its own ancestors).
This is the only structural guard; the `visited` set in the breadcrumb walk is a
defensive backstop.

## Data model — `src/db/types.ts`

Additive optional fields on the existing interfaces; **no new table**.

```ts
/** A pin dropped on a map, optionally linked to a lore page. */
export interface MapPin {
  id: string
  mapId: string
  lat: number
  lng: number
  label: string
  pageId: string | null
  childMapId?: string // portal: the map this pin opens; absent ⇒ no drill-down
}

/** A drawable area on a map … */
export interface MapRegion {
  id: string
  mapId: string
  points: [number, number][]
  label: string
  pageId: string | null
  color?: string
  childMapId?: string // portal: the map this region opens; absent ⇒ no drill-down
}
```

`childMapId` absent ⇒ the pin/region is a plain pin/region (current behaviour). A pin may
have both a `pageId` and a `childMapId` (e.g. "Capital City" links to its page *and* opens
the city map).

## DB layer

### Schema — `src/db/schema.ts`

Add Dexie **version 7** carrying every store forward and indexing `childMapId` on both
tables (so parent lookups are cheap and reactive):

```
pins:    'id, mapId, pageId, childMapId'
regions: 'id, mapId, pageId, childMapId'
```

All other stores unchanged. Existing data is preserved (an added index needs no data
migration; existing rows simply have no `childMapId`).

### Derivation — `src/db/maps.ts`

- `findParentMapId(mapId, pins, regions): string | null` — returns the `mapId` of the
  first portal whose `childMapId === mapId` (pins scanned before regions), or `null` (a
  *derivation*, not the rejected stored field). Pure; callers pass the portal arrays so it
  stays test-friendly and React-render cheap.
- `mapBreadcrumb(mapId, maps, pins, regions): WorldMap[]` — walks parents to the root and
  returns the chain `[root, …, current]` (resolving each id to its `WorldMap`). A
  `visited` set guards against cycles; an unknown/absent map yields an empty chain.
- `descendantMapIds(mapId, pins, regions): Set<string>` *(optional helper)* and/or
  `ancestorMapIds(mapId, pins, regions): Set<string>` to build the cycle-exclusion set for
  the portal picker. The picker needs **ancestors of the current map** (plus the current
  map itself) excluded.

Portal edits (`childMapId`) happen inline via `db.pins.update`/`db.regions.update` in the
route, mirroring how label/pageId/colour are edited today.

### Barrel — `src/db/index.ts`

Re-export the new helpers (`parentMapId`, `mapBreadcrumb`, and any ancestor helper). The
`export *` from `./maps` covers runtime exports; ensure the names are reachable so
`barrel.test.ts` passes.

## Rendering — `src/components/MapView.tsx`

- **Portal indicator**: a pin or region with a `childMapId` gets a subtle marker so it's
  discoverable — pins add a small ⤵ badge (or a ring) to the divIcon HTML; regions add a
  CSS class to the polygon (e.g. dashed border) or a ⤵ glyph appended to the tooltip
  label. The indicator is presentational; `MapView` is told which ids are portals via the
  style maps it already receives (extend `PinMarkerStyle` with `portal?: boolean`, and the
  region fill map entry with `portal?: boolean`).
- **Centre-on-target for the find panel**: generalise the existing "pan to a deep-linked
  pin" path so the route can request a pan to an arbitrary pin *or* region:
  - Pins: reuse the current `setView([lat, lng], …)` approach.
  - Regions: `lmap.fitBounds(polygon.getBounds())` (the polygon layer already exists in
    `polygonsRef`).
  - Mechanism: a `focusKey`-style prop (e.g. `{ kind: 'pin'|'region', id, nonce }`) so
    re-clicking the same item re-pans. Keep the existing `focusPinId` deep-link behaviour
    working (it can funnel through the same path).

`MapView` keeps all current pin/region responsibilities; Phase 4 additions are the portal
indicator and the generalised centre-on-target.

## Route & UX — `src/routes/MapRoute.tsx`

State and live data:

- `liveQuery` **all** pins and regions (id, mapId, childMapId) — or all maps' portals —
  needed to derive the breadcrumb across maps. The active map's pins/regions for rendering
  stay as today (`where('mapId').equals(mapId)`). Keep the cross-map query lightweight.
- Derive `breadcrumb = mapBreadcrumb(mapId, maps, allPins, allRegions)` per render.
- Mark which current-map pins/regions are portals (`childMapId` set) to pass the `portal`
  flag into the style maps.

**Toolbar / breadcrumb:**

- Add a **breadcrumb bar** (`Continent › Region › City`); each ancestor segment is a
  button that switches `activeId` to that map (clears selection/draw/find like the
  dropdown's `onChange` does). The current segment is non-interactive.
- Keep the existing **all-maps `<select>`** for direct jumps to any map.
- Add a **"🔍 Find"** toggle button that shows/hides the find panel.

**Find panel** (sibling to the legend, toggled):

- A text input (label filter, case-insensitive) plus a scrollable list of the current
  map's pins and regions that pass the legend's `hiddenTypes` filter (so the list matches
  what's visible). Each row: a 📍/▱ marker + the label.
- Clicking a row selects it (`setSelectedPinId`/`setSelectedRegionId`, clearing the other)
  and requests a centre-on-target via the new `MapView` focus mechanism.
- Empty query ⇒ full list; no matches ⇒ a muted "No matches" line.

**Selection panels** (pin and region) gain portal controls:

- **Opens map** — a `<select>` of maps to set `childMapId`. Options exclude the current
  map and its ancestors (cycle guard); a `— none —` option clears the portal. Set inline
  via `db.pins.update`/`db.regions.update`.
- **Enter map →** — shown when `childMapId` is set (and resolves to an existing map);
  switches `activeId` to that map (clearing selection/draw/find), parallel to the existing
  **Open page →** button.

Selecting from the find panel, drilling via a portal, and clicking a breadcrumb segment
all reset transient UI (selection, draw mode, find query) the same way the dropdown does.

## Backup — `src/db/backup.ts`

- Bump `CURRENT_SCHEMA_VERSION` to **7** to mirror the Dexie store version.
- `childMapId` rides along inside the existing `pins`/`regions` arrays — **no new
  `BackupData`/`BackupCounts` fields** and **no `MIGRATIONS` step** required: the field is
  additive and optional, so old backups simply lack it (⇒ no portal). `migrateBackup`'s
  loop increments past 6→7 with no step and stamps version 7; new app reading a v6/legacy
  backup yields portals-absent data, old app reading a v7 backup ignores the field.
- No sanitization change — `childMapId` is an id string (React-escaped where shown), never
  HTML.
- A `childMapId` pointing at a map absent from the imported backup is a harmless dangling
  portal (resolves to no drill-down).

## Testing

- **`maps` derivation**: `findParentMapId` finds the incoming portal (pin before region)
  or null; `mapBreadcrumb` builds a 3-level chain root→current; a root map yields an empty/
  single-element chain; a cycle terminates via the `visited` guard; a dangling target is
  ignored. Ancestor/exclusion helper returns current + ancestors.
- **Backup**: export→import round-trips `childMapId` on pins and regions; a v6 and a
  legacy (no `schemaVersion`) backup import with portals absent and no error; `parseBackup`
  counts unchanged.
- **Barrel** (`barrel.test.ts`): auto-covers the new re-exports.
- **Find panel filtering**: pure label-filter + `hiddenTypes` derivation is unit-testable.
- **MapView**: Leaflet pan/`fitBounds` and portal-indicator rendering are not unit-tested
  (consistent with the current code, which has no MapView test).

Run `npm run lint && npm run build && npm run test:run` before claiming done (CI gate).

## Risks / notes

- **Deriving the parent requires cross-map portal data.** The route adds a lightweight
  live query over all pins/regions (their `childMapId`) for the breadcrumb. At a
  worldbuilder's scale (tens of maps, hundreds of pins) this is cheap; if it ever grows,
  the `childMapId` index supports `where('childMapId').equals(mapId)` lookups directly.
- **Multiple portals to one child** make the "parent" ambiguous; we resolve
  deterministically and accept it. Documented, not enforced.
- **Breadcrumb vs dropdown overlap.** Both navigate maps; they coexist (breadcrumb for
  ancestry/up, dropdown for arbitrary jumps). The flat dropdown is unchanged for v1.
- **Indicator subtlety.** The portal badge must not collide visually with the type emoji
  on pins; keep it small and positioned distinctly (e.g. corner ⤵).
