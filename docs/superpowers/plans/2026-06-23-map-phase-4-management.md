# Map Phase 4 — Map management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scale the map to many maps — nest maps via pin/region "portals", navigate the tree (breadcrumb up, drill-down, dropdown), and add a per-map find panel that centres + selects a pin or region.

**Architecture:** A pin or region gains an optional `childMapId` (a portal). A map's parent and breadcrumb are *derived* from incoming portals (no stored `parentMapId`), consistent with the existing `pinType`/`regionStyle` "derive, never store" model. The route adds breadcrumb navigation, portal controls in the selection panels, and a find panel; `MapView` gains a portal indicator and a generalised centre-on-target.

**Tech Stack:** React + TypeScript (strict), Dexie/IndexedDB, dexie-react-hooks (`useLiveQuery`), Leaflet + leaflet-draw, Vitest + happy-dom + fake-indexeddb.

## Global Constraints

- TypeScript is `strict`. Run `npm run lint && npm run build && npm run test:run` before claiming done (CI gate).
- Data layer lives under `src/db/` behind the barrel `src/db/index.ts` (`export *` per module). Always import from `'../db'`/`'./db'`. New public runtime helpers must also be listed in `barrel.test.ts`'s `EXPECTED_FUNCTIONS`.
- `CURRENT_SCHEMA_VERSION` in `backup.ts` **mirrors** the Dexie store version in `schema.ts`; bump them together.
- The pin/region colour model is unchanged (per-pin colour override stays out of scope). Portals are the only new pin/region field.
- Parent/breadcrumb are derived — do **not** add a stored `parentMapId` field.
- No literal `Date.now()`/`Math.random()` in React render (react-hooks/purity lint rule); a nonce counter is incremented inside an event handler, never during render.

---

## File Structure

- `src/db/types.ts` — add optional `childMapId` to `MapPin` and `MapRegion`.
- `src/db/schema.ts` — Dexie **v7** indexing `childMapId` on `pins` and `regions`.
- `src/db/maps.ts` — new pure derivation helpers: `findParentMapId`, `mapBreadcrumb`, `ancestorMapIds`.
- `src/db/index.ts` — barrel already re-exports via `export *`; no change needed (verified by `barrel.test.ts`).
- `src/db/backup.ts` — bump `CURRENT_SCHEMA_VERSION` to 7 (field rides inside existing arrays; no new fields, no migration step).
- `src/components/MapView.tsx` — portal indicator (pins + regions) and a `focusTarget` centre-on-target prop.
- `src/routes/MapRoute.tsx` — breadcrumb bar, `switchToMap` helper, portal controls in both panels, portal flags into the style maps, find panel.
- `src/index.css` — breadcrumb, portal badge, and find-panel styles.
- Tests: `src/db/backup.test.ts` (childMapId round-trip + v7 stamp), `src/db/maps-nesting.test.ts` (new — derivation helpers), `src/db/barrel.test.ts` (new helper names).

---

## Task 1: Data model, schema v7, backup version bump

**Files:**
- Modify: `src/db/types.ts` (MapPin, MapRegion)
- Modify: `src/db/schema.ts` (add version 7)
- Modify: `src/db/backup.ts:26` (`CURRENT_SCHEMA_VERSION`)
- Test: `src/db/backup.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MapPin.childMapId?: string`, `MapRegion.childMapId?: string`; `CURRENT_SCHEMA_VERSION === 7`; Dexie store version 7 with `childMapId` indexed on `pins`/`regions`.

- [ ] **Step 1: Write the failing tests**

Add to `src/db/backup.test.ts`. First, extend the imports to include `MapPin` and `MapRegion` is not required — the test builds plain objects. Append these tests inside the existing `describe('importAll — round-trips', …)` block (after the `round-trips regions` test) and add a new top-level assertion for the version:

```ts
  it('round-trips pin and region portals (childMapId)', async () => {
    await db.maps.add({ id: 'm1', name: 'Continent', image: '', width: 1, height: 1, createdAt: 1 })
    await db.maps.add({ id: 'm2', name: 'City', image: '', width: 1, height: 1, createdAt: 2 })
    await db.pins.add({ id: 'pin1', mapId: 'm1', lat: 1, lng: 1, label: 'Capital', pageId: null, childMapId: 'm2' })
    await db.regions.add({
      id: 'r1', mapId: 'm1', points: [[0, 0], [0, 5], [5, 0]], label: 'Reach',
      pageId: null, childMapId: 'm2',
    })

    const json = await exportAll()
    await clearAll()
    await importAll(json)

    expect(await db.pins.get('pin1')).toMatchObject({ id: 'pin1', childMapId: 'm2' })
    expect(await db.regions.get('r1')).toMatchObject({ id: 'r1', childMapId: 'm2' })
  })
```

Add a new `describe` block at the end of the file:

```ts
describe('schema version', () => {
  it('is at 7 for Phase 4 (childMapId portals)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(7)
  })

  it('stamps a v6 backup up to 7 with no data loss', () => {
    const out = migrateBackup({ schemaVersion: 6, pages: [], regions: [] })
    expect(out.schemaVersion).toBe(7)
    expect(out.regions).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/db/backup.test.ts`
Expected: FAIL — `expect(CURRENT_SCHEMA_VERSION).toBe(7)` fails (still 6); the portal round-trip may fail TS compile until `childMapId` exists on the types.

- [ ] **Step 3: Add `childMapId` to the data model**

In `src/db/types.ts`, add the field to `MapPin` (after `pageId`):

```ts
export interface MapPin {
  id: string
  mapId: string
  lat: number // Leaflet coordinates (see MapView for details)
  lng: number
  label: string
  pageId: string | null // linked lore page, or null
  childMapId?: string // portal: the map this pin opens (drill-down); absent ⇒ none
}
```

and to `MapRegion` (after `color`):

```ts
export interface MapRegion {
  id: string
  mapId: string
  points: [number, number][] // [lat, lng] vertices in Leaflet CRS.Simple coords
  label: string
  pageId: string | null // linked lore page, or null
  color?: string // per-region colour override; absent ⇒ derive from page type
  childMapId?: string // portal: the map this region opens (drill-down); absent ⇒ none
}
```

- [ ] **Step 4: Add Dexie version 7**

In `src/db/schema.ts`, after the `this.version(6)` block (ends at line 156), add:

```ts
    // v7 indexes childMapId on pins & regions for map nesting (portals);
    // existing data is preserved (an added index needs no data migration).
    this.version(7).stores({
      pages: 'id, title, category, updatedAt',
      maps: 'id, name, createdAt',
      pins: 'id, mapId, pageId, childMapId',
      regions: 'id, mapId, pageId, childMapId',
      meta: '&key',
      templates: 'id, name',
      snapshots: '++id, timestamp',
      calendars: 'id, name, createdAt',
      events: 'id, calendarId, startAbsolute, pageId',
    })
```

- [ ] **Step 5: Bump the backup schema version**

In `src/db/backup.ts`, change line 26:

```ts
export const CURRENT_SCHEMA_VERSION = 7
```

Then, inside the `MIGRATIONS` object, immediately after the existing `5: (d) => …` entry (line 76) and before the object's closing `}`, add a documentation comment (no new migration step — the field is additive/optional):

```ts
  // v7 added pin/region childMapId portals — an additive optional field inside the
  // existing pins/regions arrays, so no migration step is needed (old backups simply
  // lack it ⇒ no portal). The version still bumps to mirror the Dexie store version.
```

(The `migrateBackup` while-loop increments 6→7 with no step and stamps version 7.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:run -- src/db/backup.test.ts`
Expected: PASS (all backup tests, including the two new ones).

- [ ] **Step 7: Build to confirm types**

Run: `npm run build`
Expected: PASS (tsc clean).

- [ ] **Step 8: Commit**

```bash
git add src/db/types.ts src/db/schema.ts src/db/backup.ts src/db/backup.test.ts
git commit -m "feat(map): childMapId portals — data model, Dexie v7, backup bump (#53)"
```

---

## Task 2: Map-nesting derivation helpers

**Files:**
- Modify: `src/db/maps.ts` (add helpers + import `WorldMap`)
- Modify: `src/db/barrel.test.ts` (list new helper names)
- Test: `src/db/maps-nesting.test.ts` (new)

**Interfaces:**
- Consumes: `MapPin.childMapId`, `MapRegion.childMapId` (Task 1); `WorldMap` from `./types`.
- Produces:
  - `findParentMapId(mapId: string, pins: MapPin[], regions: MapRegion[]): string | null`
  - `mapBreadcrumb(mapId: string, maps: WorldMap[], pins: MapPin[], regions: MapRegion[]): WorldMap[]`
  - `ancestorMapIds(mapId: string, pins: MapPin[], regions: MapRegion[]): Set<string>`

- [ ] **Step 1: Write the failing tests**

Create `src/db/maps-nesting.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { findParentMapId, mapBreadcrumb, ancestorMapIds } from '../db'
import type { MapPin, MapRegion, WorldMap } from '../db'

// Phase 4 nests maps via "portals": a pin or region carries childMapId, the map
// it opens. A map's parent and breadcrumb are derived from incoming portals — no
// stored parentMapId — so these pure helpers are the single source of truth.

const wmap = (id: string): WorldMap => ({ id, name: id, image: '', width: 1, height: 1, createdAt: 1 })
const pin = (id: string, mapId: string, childMapId?: string): MapPin => ({
  id, mapId, lat: 0, lng: 0, label: id, pageId: null, ...(childMapId ? { childMapId } : {}),
})
const region = (id: string, mapId: string, childMapId?: string): MapRegion => ({
  id, mapId, points: [[0, 0], [0, 1], [1, 0]], label: id, pageId: null,
  ...(childMapId ? { childMapId } : {}),
})

describe('findParentMapId', () => {
  it('returns the mapId of the pin portal that opens the map', () => {
    const pins = [pin('p1', 'continent', 'city')]
    expect(findParentMapId('city', pins, [])).toBe('continent')
  })

  it('falls back to a region portal when no pin opens the map', () => {
    const regions = [region('r1', 'continent', 'reach')]
    expect(findParentMapId('reach', [], regions)).toBe('continent')
  })

  it('prefers a pin portal over a region portal', () => {
    const pins = [pin('p1', 'fromPin', 'target')]
    const regions = [region('r1', 'fromRegion', 'target')]
    expect(findParentMapId('target', pins, regions)).toBe('fromPin')
  })

  it('returns null when no portal opens the map (top-level)', () => {
    expect(findParentMapId('continent', [], [])).toBeNull()
  })
})

describe('mapBreadcrumb', () => {
  const maps = [wmap('continent'), wmap('region'), wmap('city')]
  // continent --pin--> region --pin--> city
  const pins = [pin('p1', 'continent', 'region'), pin('p2', 'region', 'city')]

  it('builds the ancestor chain root→current', () => {
    expect(mapBreadcrumb('city', maps, pins, []).map((m) => m.id))
      .toEqual(['continent', 'region', 'city'])
  })

  it('returns just the map itself when it is top-level', () => {
    expect(mapBreadcrumb('continent', maps, pins, []).map((m) => m.id)).toEqual(['continent'])
  })

  it('returns an empty chain for an unknown map', () => {
    expect(mapBreadcrumb('ghost', maps, pins, [])).toEqual([])
  })

  it('terminates on a cycle instead of looping forever', () => {
    // a opens b, b opens a — a deliberate cycle
    const cyc = [pin('p1', 'a', 'b'), pin('p2', 'b', 'a')]
    const cycMaps = [wmap('a'), wmap('b')]
    const ids = mapBreadcrumb('a', cycMaps, cyc, []).map((m) => m.id)
    expect(ids[ids.length - 1]).toBe('a')
    expect(ids.length).toBeLessThanOrEqual(2)
  })
})

describe('ancestorMapIds', () => {
  const pins = [pin('p1', 'continent', 'region'), pin('p2', 'region', 'city')]

  it('returns the map itself plus all its ancestors', () => {
    expect(ancestorMapIds('city', pins, [])).toEqual(new Set(['city', 'region', 'continent']))
  })

  it('returns just the map itself when top-level', () => {
    expect(ancestorMapIds('continent', pins, [])).toEqual(new Set(['continent']))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/db/maps-nesting.test.ts`
Expected: FAIL — helpers are not exported / not defined.

- [ ] **Step 3: Implement the helpers**

In `src/db/maps.ts`, add `WorldMap` to the type import on line 2:

```ts
import type { InfoboxTemplate, LorePage, MapPin, MapRegion, WorldMap } from './types'
```

Append at the end of the file:

```ts
// ---------------------------------------------------------------------------
// Map nesting — derived parent / breadcrumb (Phase 4)
// ---------------------------------------------------------------------------
// A pin or region carries an optional `childMapId` — the map it opens (a
// "portal"). A map's parent is *derived* by finding the portal that opens it
// (pins before regions); there is no stored parentMapId. All three helpers are
// pure so callers pass the arrays once per render and they stay test-friendly.

/** The mapId of the first portal (pins before regions) whose childMapId === mapId,
 *  or null when no portal opens this map (a top-level map). */
export function findParentMapId(mapId: string, pins: MapPin[], regions: MapRegion[]): string | null {
  const pin = pins.find((p) => p.childMapId === mapId)
  if (pin) return pin.mapId
  const region = regions.find((r) => r.childMapId === mapId)
  return region ? region.mapId : null
}

/** The ancestor chain root→current as WorldMaps, derived by walking incoming
 *  portals upward. A `visited` set guards against cycles; an unknown map (or one
 *  whose ancestor is unknown) yields an empty/short chain. */
export function mapBreadcrumb(
  mapId: string,
  maps: WorldMap[],
  pins: MapPin[],
  regions: MapRegion[],
): WorldMap[] {
  const byId = new Map(maps.map((m) => [m.id, m]))
  const chain: WorldMap[] = []
  const visited = new Set<string>()
  let cur: string | null = mapId
  while (cur && !visited.has(cur)) {
    visited.add(cur)
    const m = byId.get(cur)
    if (!m) break
    chain.unshift(m)
    cur = findParentMapId(cur, pins, regions)
  }
  return chain
}

/** The set of maps a portal on `mapId` must not target (the map itself and its
 *  ancestors) — choosing one would create a cycle. */
export function ancestorMapIds(mapId: string, pins: MapPin[], regions: MapRegion[]): Set<string> {
  const set = new Set<string>()
  let cur: string | null = mapId
  while (cur && !set.has(cur)) {
    set.add(cur)
    cur = findParentMapId(cur, pins, regions)
  }
  return set
}
```

- [ ] **Step 4: Register the helpers in the barrel test**

In `src/db/barrel.test.ts`, extend the `maps.ts` line in `EXPECTED_FUNCTIONS` (line 25):

```ts
  // maps.ts
  'addMap', 'deleteMap', 'addPin', 'pinType', 'addRegion', 'regionStyle',
  'findParentMapId', 'mapBreadcrumb', 'ancestorMapIds',
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/db/maps-nesting.test.ts src/db/barrel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/maps.ts src/db/maps-nesting.test.ts src/db/barrel.test.ts
git commit -m "feat(map): derive map parent & breadcrumb from portals (#53)"
```

---

## Task 3: MapView — portal indicator and centre-on-target

**Files:**
- Modify: `src/components/MapView.tsx`
- Modify: `src/index.css` (portal badge)

**Interfaces:**
- Consumes: `MapPin.childMapId`, `MapRegion.childMapId`.
- Produces (for the route in Tasks 4–5):
  - `PinMarkerStyle` gains `portal?: boolean`.
  - `Props.regionStyles` becomes `Map<string, { color: string; portal?: boolean }>`.
  - New prop `focusTarget?: FocusTarget | null` where `export interface FocusTarget { kind: 'pin' | 'region'; id: string; nonce: number }`.

No unit test (Leaflet rendering is not unit-tested in this codebase — consistent with the existing absence of a MapView test). Verified via build + manual smoke.

- [ ] **Step 1: Extend the style/prop types and export FocusTarget**

In `src/components/MapView.tsx`, change `PinMarkerStyle` (lines 16-19):

```ts
export interface PinMarkerStyle {
  color: string
  icon: string | null
  portal?: boolean // pin opens a child map — show a drill-down badge
}

/** A request to centre the map on a pin or region. `nonce` changes on every
 *  request so re-selecting the same target re-pans. */
export interface FocusTarget {
  kind: 'pin' | 'region'
  id: string
  nonce: number
}
```

In `Props` (lines 21-38), change the `regionStyles` type and add `focusTarget`:

```ts
  regionStyles: Map<string, { color: string; portal?: boolean }>
```

```ts
  focusTarget?: FocusTarget | null
```

Add `focusTarget` to the destructured params (line 42-45):

```ts
export default function MapView({
  map, pins, styles, addMode, selectedPinId, onMapClick, onPinClick, onPinMove, focusPinId,
  regions, regionStyles, selectedRegionId, drawMode, onRegionClick, onRegionCreate, onRegionEdit,
  focusTarget,
}: Props) {
```

- [ ] **Step 2: Render the portal badge on pins**

In `makeIcon` (lines 313-326), add the badge when `style.portal`:

```ts
function makeIcon(pin: MapPin, style: PinMarkerStyle, selected: boolean): L.DivIcon {
  const safe = pin.label.replace(/</g, '&lt;')
  const emoji = style.icon ? `<span class="pin-emoji">${style.icon}</span>` : ''
  const portal = style.portal ? '<span class="pin-portal" title="Opens another map">⤵</span>' : ''
  const idAttr = pin.pageId ? ` data-pin-id="${pin.id}"` : ''
  return L.divIcon({
    className: 'pin-icon-wrap',
    html:
      `<div class="pin-icon${selected ? ' selected' : ''}"${idAttr}>${emoji}` +
      `<span class="pin-dot" style="background:${style.color}"></span>${portal}` +
      `<span class="pin-label">${safe}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}
```

- [ ] **Step 3: Show portals on region tooltips**

In the polygon sync effect (lines 198-246), derive the portal flag and label text once per region, and use it for both create and update. Replace the body of the `for (const region of regions)` loop's style/label handling:

Change the fill lookup line (line 208) and add a label string:

```ts
      const entry = regionStyles.get(region.id)
      const fill = entry?.color ?? '#a0a0a0'
      const labelText = entry?.portal ? `${region.label} ⤵` : region.label
```

In the update branch (`if (poly) { … }`), change the tooltip line:

```ts
        poly.setTooltipContent(labelText)
```

In the create branch (`else { … }`), change the `bindTooltip` line:

```ts
        p.bindTooltip(labelText, { permanent: true, direction: 'center', className: 'region-label' })
```

(The `style` object on lines 209-214 still uses `fill`; it is unchanged.)

- [ ] **Step 4: Add the centre-on-target effect**

After the existing `focusPinId` effect (ends line 305), add:

```ts
  // Centre the map on a pin or region requested by the route (find panel / drill).
  // `focusTarget.nonce` changes per request so re-selecting the same target re-pans.
  useEffect(() => {
    const lmap = mapRef.current
    if (!lmap || !focusTarget) return
    if (focusTarget.kind === 'pin') {
      const pin = pinsRef.current.find((p) => p.id === focusTarget.id)
      if (pin) lmap.setView([pin.lat, pin.lng], Math.max(lmap.getZoom(), 1))
    } else {
      const poly = polygonsRef.current.get(focusTarget.id)
      if (poly) lmap.fitBounds(poly.getBounds())
    }
  }, [focusTarget])
```

- [ ] **Step 5: Add the portal-badge CSS**

In `src/index.css`, after the `.pin-emoji` rule (line 608), add:

```css
.pin-portal {
  position: absolute; top: -6px; right: -10px; font-size: 12px; line-height: 1;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.7)); pointer-events: none;
}
```

(`.pin-icon` is `position: relative`? It is not — add `position: relative;` to the existing `.pin-icon` rule on line 602 so the badge anchors to it.)

Change line 602 to:

```css
.pin-icon { position: relative; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; white-space: nowrap; }
```

- [ ] **Step 6: Build to confirm types**

Run: `npm run build`
Expected: PASS. (The route still passes the old `regionStyles` shape — that is fine; `{ color: string }` is assignable to `{ color: string; portal?: boolean }`. The new `focusTarget` prop is optional.)

- [ ] **Step 7: Commit**

```bash
git add src/components/MapView.tsx src/index.css
git commit -m "feat(map): MapView portal badge + centre-on-target focus (#53)"
```

---

## Task 4: MapRoute — breadcrumb, jumping, and portal controls

**Files:**
- Modify: `src/routes/MapRoute.tsx`
- Modify: `src/index.css` (breadcrumb)

**Interfaces:**
- Consumes: `mapBreadcrumb`, `ancestorMapIds` (Task 2); `FocusTarget`, the `portal` style flags, and the centre-on-target prop (Task 3).
- Produces: nothing consumed by later tasks except the `switchToMap`, `focusTarget` state, and `focusPin`/`focusRegion` helpers reused by Task 5.

No unit test (route wiring is exercised via build + manual smoke, consistent with the codebase).

- [ ] **Step 1: Import the new helpers and FocusTarget**

In `src/routes/MapRoute.tsx`, extend the db import (lines 4-7) to add the helpers:

```ts
import {
  db, addMap, addPin, addRegion, deleteMap, pinType, regionStyle,
  mapBreadcrumb, ancestorMapIds,
  TYPE_COLORS, type MapPin, type MapRegion, type InfoboxTemplate,
} from '../db'
import MapView, { type PinMarkerStyle, type FocusTarget } from '../components/MapView'
```

- [ ] **Step 2: Add cross-map live queries + focus/find state**

After the existing `regionsData` live query (line 54), add cross-map portal data for the breadcrumb, and new UI state near the other `useState` calls (after line 22):

Add state (after line 22, `const [selectedRegionId, …]`):

```ts
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const [showFind, setShowFind] = useState(false)
  const [findQuery, setFindQuery] = useState('')
```

Add live queries (after line 54, before the `regions`/`pins` memos):

```ts
  // All pins/regions across every map — needed to derive the breadcrumb (which
  // portal opens this map) and the cycle-exclusion set for the portal picker.
  const allPinsData = useLiveQuery(() => db.pins.toArray(), [])
  const allRegionsData = useLiveQuery(() => db.regions.toArray(), [])
```

After the existing `templates` memo (line 58), add:

```ts
  const allPins = useMemo(() => allPinsData ?? [], [allPinsData])
  const allRegions = useMemo(() => allRegionsData ?? [], [allRegionsData])
```

- [ ] **Step 3: Derive breadcrumb, ancestor set, and maps-by-id**

After the `legend` memo (ends line 99), add:

```ts
  const mapsById = useMemo(() => new Map(maps.map((m) => [m.id, m])), [maps])
  const breadcrumb = useMemo(
    () => mapBreadcrumb(mapId, maps, allPins, allRegions),
    [mapId, maps, allPins, allRegions],
  )
  // Maps a portal on the current map may NOT target (itself + its ancestors).
  const portalExcluded = useMemo(
    () => ancestorMapIds(mapId, allPins, allRegions),
    [mapId, allPins, allRegions],
  )
  const portalTargets = useMemo(
    () => maps.filter((m) => !portalExcluded.has(m.id)),
    [maps, portalExcluded],
  )
```

- [ ] **Step 4: Add portal flags to the style maps**

Replace the `pinStyles` memo (lines 120-124):

```ts
  const pinStyles = useMemo(() => {
    const m = new Map<string, PinMarkerStyle>()
    for (const p of pins) {
      const t = pinTypes.get(p.id)!
      m.set(p.id, { color: t.color, icon: t.icon, portal: !!p.childMapId })
    }
    return m
  }, [pins, pinTypes])
```

Replace the `regionFills` memo (lines 113-117):

```ts
  const regionFills = useMemo(() => {
    const m = new Map<string, { color: string; portal?: boolean }>()
    for (const r of regions) {
      m.set(r.id, { color: regionStyles.get(r.id)?.fill ?? '#a0a0a0', portal: !!r.childMapId })
    }
    return m
  }, [regions, regionStyles])
```

- [ ] **Step 5: Add `switchToMap`, `focusPin`, `focusRegion` helpers**

After the `toggleType` function (ends line 136), add:

```ts
  // Switch the active map, resetting all transient UI (used by the dropdown,
  // breadcrumb, and the "Enter map →" drill-down).
  function switchToMap(id: string) {
    setActiveId(id)
    setSelectedPinId(null)
    setSelectedRegionId(null)
    setAddMode(false)
    setDrawMode(false)
    setHiddenTypes(new Set())
    setFindQuery('')
  }

  // Select + centre on a pin/region. Bumping nonce re-pans even if it was already
  // selected (incremented in a handler, never during render — purity rule).
  function focusPin(id: string) {
    setSelectedPinId(id)
    setSelectedRegionId(null)
    setFocusTarget((t) => ({ kind: 'pin', id, nonce: (t?.nonce ?? 0) + 1 }))
  }
  function focusRegion(id: string) {
    setSelectedRegionId(id)
    setSelectedPinId(null)
    setFocusTarget((t) => ({ kind: 'region', id, nonce: (t?.nonce ?? 0) + 1 }))
  }
```

- [ ] **Step 6: Replace the dropdown onChange with `switchToMap` and add a breadcrumb + Find button**

Replace the `<select>` block in the toolbar (lines 183-191) with a breadcrumb (shown when there is more than one level) followed by the dropdown:

```tsx
        {breadcrumb.length > 1 && (
          <nav className="map-breadcrumb" aria-label="Map hierarchy">
            {breadcrumb.map((m, i) => {
              const last = i === breadcrumb.length - 1
              return (
                <span key={m.id} className="map-crumb">
                  {last
                    ? <span className="map-crumb-current">{m.name}</span>
                    : <button className="map-crumb-link" onClick={() => switchToMap(m.id)}>{m.name}</button>}
                  {!last && <span className="map-crumb-sep">›</span>}
                </span>
              )
            })}
          </nav>
        )}
        <select value={currentMap?.id} onChange={(e) => switchToMap(e.target.value)}>
          {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
```

Add a Find toggle button to the toolbar — after the "Delete map" button (line 211), before the `.map-hint` span:

```tsx
        <button
          className={showFind ? 'primary-btn' : 'ghost-btn'}
          onClick={() => setShowFind((v) => !v)}
        >
          🔍 Find
        </button>
```

- [ ] **Step 7: Pass `focusTarget` to MapView and route pin/region clicks through focus**

In the `<MapView … />` element (lines 217-235), add the `focusTarget` prop and change the click handlers to centre on click as well (optional but consistent). Add this line among the props:

```tsx
            focusTarget={focusTarget}
```

(Leave `onPinClick`/`onRegionClick` as the existing select-only handlers — clicking a marker should not re-centre. Centre-on-target is driven by the find panel and is wired in Task 5.)

- [ ] **Step 8: Add the "Opens map" picker + "Enter map →" to the pin panel**

In the pin panel, after the "Linked page" `<select>` (ends line 276) and before `.pin-panel-actions` (line 277), add:

```tsx
            <label>Opens map</label>
            <select
              value={selectedPin.childMapId ?? ''}
              onChange={(e) => {
                const v = e.target.value
                if (v) db.pins.update(selectedPin.id, { childMapId: v })
                else db.pins.update(selectedPin.id, (p) => { delete p.childMapId })
              }}
            >
              <option value="">— none —</option>
              {portalTargets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
```

In `.pin-panel-actions` (lines 277-287), add an "Enter map →" button before "Open page →" when the portal resolves to an existing map:

```tsx
            <div className="pin-panel-actions">
              {selectedPin.childMapId && mapsById.has(selectedPin.childMapId) && (
                <button className="ghost-btn" onClick={() => switchToMap(selectedPin.childMapId!)}>Enter map →</button>
              )}
              {selectedPin.pageId && (
                <button className="ghost-btn" onClick={() => navigate(`/page/${selectedPin.pageId}`)}>Open page →</button>
              )}
              <button
                className="ghost-btn danger"
                onClick={() => { db.pins.delete(selectedPin.id); setSelectedPinId(null) }}
              >
                Delete pin
              </button>
            </div>
```

- [ ] **Step 9: Add the same portal controls to the region panel**

In the region panel, after the colour `.region-swatches` block (ends line 328) and before its `.pin-panel-actions` (line 329), add:

```tsx
            <label>Opens map</label>
            <select
              value={selectedRegion.childMapId ?? ''}
              onChange={(e) => {
                const v = e.target.value
                if (v) db.regions.update(selectedRegion.id, { childMapId: v })
                else db.regions.update(selectedRegion.id, (r) => { delete r.childMapId })
              }}
            >
              <option value="">— none —</option>
              {portalTargets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
```

In the region panel's `.pin-panel-actions` (lines 329-339), add the "Enter map →" button before "Open page →":

```tsx
            <div className="pin-panel-actions">
              {selectedRegion.childMapId && mapsById.has(selectedRegion.childMapId) && (
                <button className="ghost-btn" onClick={() => switchToMap(selectedRegion.childMapId!)}>Enter map →</button>
              )}
              {selectedRegion.pageId && (
                <button className="ghost-btn" onClick={() => navigate(`/page/${selectedRegion.pageId}`)}>Open page →</button>
              )}
              <button
                className="ghost-btn danger"
                onClick={() => { db.regions.delete(selectedRegion.id); setSelectedRegionId(null) }}
              >
                Delete region
              </button>
            </div>
```

- [ ] **Step 10: Add breadcrumb CSS**

In `src/index.css`, after `.map-toolbar select` (line 596), add:

```css
.map-breadcrumb { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 13px; }
.map-crumb { display: inline-flex; align-items: center; gap: 4px; }
.map-crumb-link {
  background: none; border: none; color: var(--accent); cursor: pointer; padding: 2px 4px;
  border-radius: 5px; font-size: 13px;
}
.map-crumb-link:hover { background: var(--bg-2); }
.map-crumb-current { color: var(--ink); font-weight: 600; padding: 2px 4px; }
.map-crumb-sep { color: var(--ink-faint); }
```

- [ ] **Step 11: Build + lint to confirm**

Run: `npm run build && npm run lint`
Expected: PASS. (Watch for unused-var lint on `focusPin`/`focusRegion` — they are used in Task 5. If Task 5 is implemented in the same session this is fine; if landing Task 4 alone, temporarily reference them is unnecessary because Step 7 leaves marker clicks unchanged. To keep Task 4 self-contained and lint-clean, wire the find panel in Task 5 immediately after, or merge Tasks 4–5 into one commit.)

- [ ] **Step 12: Commit**

```bash
git add src/routes/MapRoute.tsx src/index.css
git commit -m "feat(map): breadcrumb, map jumping, and portal controls (#53)"
```

---

## Task 5: MapRoute — find panel

**Files:**
- Modify: `src/routes/MapRoute.tsx`
- Modify: `src/index.css` (find panel)

**Interfaces:**
- Consumes: `showFind`, `findQuery`, `setShowFind`, `setFindQuery`, `focusPin`, `focusRegion`, `visiblePins`, `visibleRegions` (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Derive the filtered find results**

In `src/routes/MapRoute.tsx`, after the `selectedRegion` line (line 140), add:

```ts
  // Find panel: current-map pins + regions matching the query, respecting the
  // legend filter (so the list matches what's visible on the map).
  const findResults = useMemo(() => {
    const q = findQuery.trim().toLowerCase()
    const pinRows = visiblePins
      .filter((p) => p.label.toLowerCase().includes(q))
      .map((p) => ({ kind: 'pin' as const, id: p.id, label: p.label }))
    const regionRows = visibleRegions
      .filter((r) => r.label.toLowerCase().includes(q))
      .map((r) => ({ kind: 'region' as const, id: r.id, label: r.label }))
    return [...pinRows, ...regionRows].sort((a, b) => a.label.localeCompare(b.label))
  }, [visiblePins, visibleRegions, findQuery])
```

- [ ] **Step 2: Render the find panel**

In the `.map-body` div, after the `MapView` element (closes line 236) and before the `legend` block (line 238), add:

```tsx
        {showFind && (
          <div className="map-find">
            <div className="map-find-head">
              <input
                autoFocus
                placeholder="Find a pin or region…"
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
              />
              <button className="tag-x" onClick={() => { setShowFind(false); setFindQuery('') }}>×</button>
            </div>
            <div className="map-find-list">
              {findResults.length === 0 && <p className="muted map-find-empty">No matches</p>}
              {findResults.map((row) => (
                <button
                  key={`${row.kind}-${row.id}`}
                  className="map-find-row"
                  onClick={() => (row.kind === 'pin' ? focusPin(row.id) : focusRegion(row.id))}
                >
                  <span className="map-find-mark">{row.kind === 'pin' ? '📍' : '▱'}</span>
                  <span className="map-find-label">{row.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 3: Add find-panel CSS**

In `src/index.css`, after the `.legend-count` rule (line 639), add:

```css
.map-find {
  position: absolute; top: 16px; left: 16px; z-index: 1000; width: 240px; max-height: 50%;
  display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: 0 8px 30px rgba(0,0,0,.5); overflow: hidden;
}
.map-find-head { display: flex; align-items: center; gap: 6px; padding: 8px; }
.map-find-head input {
  flex: 1; background: var(--bg-2); border: 1px solid var(--border); color: var(--ink);
  border-radius: 7px; padding: 7px 9px; font-size: 13px;
}
.map-find-list { overflow-y: auto; padding: 4px 8px 8px; display: flex; flex-direction: column; gap: 2px; }
.map-find-row {
  display: flex; align-items: center; gap: 8px; padding: 5px 6px; border: none; background: none;
  color: var(--ink); cursor: pointer; border-radius: 6px; font-size: 13px; text-align: left;
}
.map-find-row:hover { background: var(--bg-2); }
.map-find-mark { flex-shrink: 0; }
.map-find-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.map-find-empty { margin: 4px 6px; font-size: 13px; }
```

- [ ] **Step 4: Build + lint + full test run**

Run: `npm run lint && npm run build && npm run test:run`
Expected: PASS (lint clean — `focusPin`/`focusRegion` are now used; build clean; all tests green).

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`, open http://localhost:5174/#/map. Verify:
- Upload two maps. On map A, add a pin, select it, set "Opens map" → map B. The pin shows a ⤵ badge; the panel shows "Enter map →"; clicking it switches to map B and the breadcrumb shows `A › B`. Clicking `A` in the breadcrumb returns to A.
- Repeat with a region (its tooltip gains ⤵; "Enter map →" works).
- "🔍 Find": typing filters the current map's pins + regions; clicking a result centres + selects it (a region fits its bounds). Hidden (legend-filtered) types don't appear in the list.
- The "Opens map" picker does not list the current map or its ancestors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/MapRoute.tsx src/index.css
git commit -m "feat(map): per-map find panel (pins + regions) (#53)"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** Nested maps (portal model) → Tasks 1–4; jumping (breadcrumb + Enter map + dropdown) → Task 4; find panel → Task 5; derived parent/breadcrumb → Task 2; backup → Task 1; cycle prevention → `ancestorMapIds` (Task 2) used by `portalTargets` (Task 4); portal indicator + centre-on-target → Task 3.
- **Type consistency:** `regionStyles` map shape `{ color: string; portal?: boolean }` is consistent across MapView (Task 3) and the route's `regionFills` (Task 4); `FocusTarget` is defined in Task 3 and consumed in Tasks 4–5; helper signatures match between Task 2's definitions and their Task 4 call sites.
- **Lint coupling:** Tasks 4 and 5 are tightly coupled (`focusPin`/`focusRegion` defined in 4, used in 5). Land them in the same session; if landing Task 4 alone, expect a transient unused-var lint until Task 5 — noted in Task 4 Step 11.
