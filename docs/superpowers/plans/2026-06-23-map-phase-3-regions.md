# Map Phase 3 — Regions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drawable polygon regions to the map — labelled, optionally page-linked areas whose colour derives from the linked page's type with an optional per-region override.

**Architecture:** A new `regions` Dexie table (schema v6) and `MapRegion` type, resolved through a shared `linkedPageType` helper that also backs pins. `MapView` renders polygons in Leaflet's overlay pane (below pins) and uses the `leaflet-draw` plugin programmatically for drawing/vertex-editing. `MapRoute` wires the toolbar, legend (now counting pins + regions per type), and a region selection panel. Backup gains a region table behind a migration step.

**Tech Stack:** React + TypeScript (strict), Dexie + dexie-react-hooks (`useLiveQuery`), Leaflet (`CRS.Simple`) + `leaflet-draw`, Vitest + happy-dom + fake-indexeddb.

## Global Constraints

- TypeScript is `strict` — no `any` leaks into exported signatures; cast locally where `leaflet-draw` lacks types.
- Data layer is split behind the barrel `src/db/index.ts` (`export *` per module). Any new public API must be reachable from `'../db'`; `src/db/barrel.test.ts` lists exported **functions** explicitly — add new ones to its `EXPECTED_FUNCTIONS`.
- Pins keep their model unchanged: colour/icon derive strictly from page type, no per-pin override.
- Region colour resolves `region.color ?? derivedTypeColour ?? '#a0a0a0'`. The legend/filter bucket is always the **derived** type (from `pageId`), independent of any override.
- Bump **both** the Dexie store version (`schema.ts`) and `CURRENT_SCHEMA_VERSION` (`backup.ts`) to **6** together, and add a `MIGRATIONS` step.
- CI gate (must all pass before "done"): `npm run lint && npm run build && npm run test:run`.
- Single-file test run: `npm run test:run -- <path>`.

---

### Task 1: Data model, schema v6, region type resolution & CRUD

**Files:**
- Modify: `src/db/types.ts` (add `MapRegion`)
- Modify: `src/db/schema.ts` (register `regions` table, add v6)
- Modify: `src/db/maps.ts` (extract `linkedPageType`, add `regionStyle`, `addRegion`, cascade in `deleteMap`)
- Modify: `src/db/barrel.test.ts` (add `addRegion`, `regionStyle` to `EXPECTED_FUNCTIONS`)
- Create: `src/db/regions.test.ts`

**Interfaces:**
- Produces:
  - `interface MapRegion { id: string; mapId: string; points: [number, number][]; label: string; pageId: string | null; color?: string }`
  - `addRegion(mapId: string, points: [number, number][]): Promise<string>`
  - `regionStyle(region: MapRegion, pagesById: Map<string, LorePage>, templatesByName: Map<string, InfoboxTemplate>): { fill: string; type: PinType }` — `fill` is the resolved fill colour (override or derived); `type` is the derived `PinType` (its `.name` is the legend bucket, `null` ⇒ Untyped; `.color` is the type's own colour for the legend swatch).
  - `db.regions: Table<MapRegion, string>`
- Consumes: existing `pinType`, `PinType`, `categoryColor`, `uid`, `now`, `deleteMap`.

- [ ] **Step 1: Add the `MapRegion` type**

In `src/db/types.ts`, add after the `MapPin` interface (around line 70):

```ts
/** A drawable area on a map (territory, biome…), optionally linked to a page.
 *  Colour derives from the linked page's type unless `color` overrides it. */
export interface MapRegion {
  id: string
  mapId: string
  points: [number, number][] // [lat, lng] vertices in Leaflet CRS.Simple coords
  label: string
  pageId: string | null // linked lore page, or null
  color?: string // per-region colour override; absent ⇒ derive from page type
}
```

- [ ] **Step 2: Register the `regions` table + Dexie v6**

In `src/db/schema.ts`:

Add the import (extend the existing type import list):

```ts
import type {
  LorePage,
  WorldMap,
  MapPin,
  MapRegion,
  MetaEntry,
  InfoboxTemplate,
  Snapshot,
  Calendar,
  TimelineEvent,
} from './types'
```

Add the table field on the `LoreDB` class (after `pins!`):

```ts
  pins!: Table<MapPin, string>
  regions!: Table<MapRegion, string>
```

Add a v6 block immediately after the v5 block in the constructor:

```ts
    // v6 adds drawable map regions (polygons); existing data is preserved.
    this.version(6).stores({
      pages: 'id, title, category, updatedAt',
      maps: 'id, name, createdAt',
      pins: 'id, mapId, pageId',
      regions: 'id, mapId, pageId',
      meta: '&key',
      templates: 'id, name',
      snapshots: '++id, timestamp',
      calendars: 'id, name, createdAt',
      events: 'id, calendarId, startAbsolute, pageId',
    })
```

- [ ] **Step 3: Write failing tests for resolution + CRUD**

Create `src/db/regions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  db,
  addRegion,
  regionStyle,
  deleteMap,
  type InfoboxTemplate,
  type LorePage,
  type MapRegion,
} from '../db'

// Regions are the area-shaped counterpart to typed pins (Phase 3). These tests
// pin the three data-layer guarantees: addRegion's defaults, deleteMap cascading
// to regions, and regionStyle's colour precedence + derived legend bucket.

async function clearMaps(): Promise<void> {
  await Promise.all([db.maps.clear(), db.pins.clear(), db.regions.clear(), db.pages.clear()])
}
beforeEach(clearMaps)

const tri: [number, number][] = [[0, 0], [0, 10], [10, 0]]

const page = (id: string, category: string): LorePage => ({
  id, title: `Page ${id}`, category, content: '', summary: '', status: 'Draft',
  tags: [], createdAt: 1, updatedAt: 1,
})
const tpl = (name: string, color: string): InfoboxTemplate => ({
  id: name, name, color, items: [], builtin: false,
})
const region = (over: Partial<MapRegion> = {}): MapRegion => ({
  id: 'r1', mapId: 'm1', points: tri, label: 'Region', pageId: null, ...over,
})

describe('addRegion', () => {
  it('inserts a region with default label and no link/colour', async () => {
    const id = await addRegion('m1', tri)
    const r = await db.regions.get(id)
    expect(r).toMatchObject({ mapId: 'm1', label: 'New region', pageId: null })
    expect(r!.points).toEqual(tri)
    expect(r!.color).toBeUndefined()
  })
})

describe('deleteMap cascade', () => {
  it('deletes the map and all its regions', async () => {
    await db.maps.add({ id: 'm1', name: 'M', image: '', width: 1, height: 1, createdAt: 1 })
    await addRegion('m1', tri)
    await addRegion('m1', tri)
    await deleteMap('m1')
    expect(await db.maps.get('m1')).toBeUndefined()
    expect(await db.regions.where('mapId').equals('m1').count()).toBe(0)
  })
})

describe('regionStyle — colour precedence & bucket', () => {
  const pages = new Map([['p1', page('p1', 'Country')]])
  const templates = new Map([['country', tpl('Country', '#7eb09b')]])

  it('uses the override colour when present, but keeps the derived bucket', () => {
    const s = regionStyle(region({ pageId: 'p1', color: '#ff0000' }), pages, templates)
    expect(s.fill).toBe('#ff0000')
    expect(s.type.name).toBe('Country')
    expect(s.type.color).toBe('#7eb09b')
  })

  it('derives the fill from the linked page type when no override', () => {
    const s = regionStyle(region({ pageId: 'p1' }), pages, templates)
    expect(s.fill).toBe('#7eb09b')
    expect(s.type.name).toBe('Country')
  })

  it('falls back to neutral grey + Untyped bucket when unlinked', () => {
    const s = regionStyle(region({ pageId: null }), pages, templates)
    expect(s.fill).toBe('#a0a0a0')
    expect(s.type.name).toBeNull()
  })

  it('uses override colour but stays Untyped when there is no link', () => {
    const s = regionStyle(region({ pageId: null, color: '#abcdef' }), pages, templates)
    expect(s.fill).toBe('#abcdef')
    expect(s.type.name).toBeNull()
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:run -- src/db/regions.test.ts`
Expected: FAIL — `addRegion` / `regionStyle` are not exported yet.

- [ ] **Step 5: Implement the data-layer functions**

In `src/db/maps.ts`, update the type import to add `MapRegion`:

```ts
import type { InfoboxTemplate, LorePage, MapPin, MapRegion } from './types'
```

Extend `deleteMap` to cascade regions:

```ts
export async function deleteMap(mapId: string): Promise<void> {
  await db.transaction('rw', db.maps, db.pins, db.regions, async () => {
    await db.maps.delete(mapId)
    await db.pins.where('mapId').equals(mapId).delete()
    await db.regions.where('mapId').equals(mapId).delete()
  })
}
```

Refactor the type walk into a shared private helper and make `pinType` delegate (replace the existing `pinType` body):

```ts
/** Resolve a linked page's type (page → category → template), the single source
 *  of truth shared by pins and regions. Returns Untyped when unlinked/unresolved. */
function linkedPageType(
  pageId: string | null,
  pagesById: Map<string, LorePage>,
  templatesByName: Map<string, InfoboxTemplate>,
): PinType {
  const page = pageId ? pagesById.get(pageId) : undefined
  const name = page?.category ?? null
  if (!name) return { name: null, color: '#a0a0a0', icon: null }
  const tpl = templatesByName.get(name.toLowerCase())
  return { name, color: tpl?.color ?? categoryColor(name), icon: tpl?.icon ?? null }
}

/** Resolve a pin's type from its linked page. `pagesById` and `templatesByName`
 *  (keyed by lower-cased name) are passed in so callers build them once per render. */
export function pinType(
  pin: MapPin,
  pagesById: Map<string, LorePage>,
  templatesByName: Map<string, InfoboxTemplate>,
): PinType {
  return linkedPageType(pin.pageId, pagesById, templatesByName)
}
```

Append the region helpers to `src/db/maps.ts`:

```ts
export async function addRegion(mapId: string, points: [number, number][]): Promise<string> {
  const id = uid()
  await db.regions.add({ id, mapId, points, label: 'New region', pageId: null })
  return id
}

/** A region's resolved fill colour plus its derived type. `fill` honours a
 *  per-region `color` override; `type` is always the derived page-type (its
 *  `.name` is the legend bucket — Untyped when null — and `.color` the type's
 *  own colour for the legend swatch). */
export function regionStyle(
  region: MapRegion,
  pagesById: Map<string, LorePage>,
  templatesByName: Map<string, InfoboxTemplate>,
): { fill: string; type: PinType } {
  const type = linkedPageType(region.pageId, pagesById, templatesByName)
  return { fill: region.color ?? type.color, type }
}
```

- [ ] **Step 6: Add the new exports to the barrel test**

In `src/db/barrel.test.ts`, update the `maps.ts` line of `EXPECTED_FUNCTIONS`:

```ts
  // maps.ts
  'addMap', 'deleteMap', 'addPin', 'pinType', 'addRegion', 'regionStyle',
```

- [ ] **Step 7: Run tests + lint + build**

Run: `npm run test:run -- src/db/regions.test.ts src/db/barrel.test.ts`
Expected: PASS (all region + barrel tests green).

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/db/types.ts src/db/schema.ts src/db/maps.ts src/db/barrel.test.ts src/db/regions.test.ts
git commit -m "feat(map): region data model, schema v6, type resolution & CRUD (#52)"
```

---

### Task 2: Backup support for regions

**Files:**
- Modify: `src/db/backup.ts` (version bump, `BackupData`, `BackupCounts`, migration, export/import)
- Modify: `src/routes/HomeRoute.tsx:209-210` (`fmtCounts`)
- Modify: `src/db.test.ts` (counts now include `regions`)
- Modify: `src/db/backup.test.ts` (`clearAll` + region round-trip + migration backfill)

**Interfaces:**
- Consumes: `MapRegion`, `db.regions` (Task 1), `asArray`, `migrateBackup`, `exportAll`, `importAll`.
- Produces: `BackupData.regions?: MapRegion[]`, `BackupCounts.regions: number`, `CURRENT_SCHEMA_VERSION = 6`.

- [ ] **Step 1: Update the failing tests first**

In `src/db.test.ts`, the two exact-count assertions must include `regions`. Replace the minimal-backup `counts` assertion (around line 35):

```ts
    expect(counts).toEqual({
      pages: 0,
      maps: 0,
      pins: 0,
      regions: 0,
      templates: 0,
      calendars: 0,
      events: 0,
    })
```

Replace the "counts every record kind" backup + assertion (around lines 46-64) so it includes regions:

```ts
    const backup = {
      exportedAt: 123,
      pages: [{ id: 'p1' }, { id: 'p2' }],
      maps: [{ id: 'm1' }],
      pins: [{ id: 'pin1' }, { id: 'pin2' }, { id: 'pin3' }],
      regions: [{ id: 'r1' }, { id: 'r2' }],
      templates: [{ id: 't1' }],
      calendars: [{ id: 'c1' }],
      events: [{ id: 'e1' }, { id: 'e2' }],
    }
    const { counts } = parseBackup(JSON.stringify(backup))
    expect(counts).toEqual({
      pages: 2,
      maps: 1,
      pins: 3,
      regions: 2,
      templates: 1,
      calendars: 1,
      events: 2,
    })
```

In `src/db/backup.test.ts`, add `db.regions` to `clearAll` (around line 22):

```ts
async function clearAll(): Promise<void> {
  await Promise.all([
    db.pages.clear(), db.maps.clear(), db.pins.clear(), db.regions.clear(),
    db.templates.clear(), db.calendars.clear(), db.events.clear(),
  ])
}
```

Add a region case to the legacy-migration test (inside the first `migrateBackup` test, after the existing `events` assertion ~line 74):

```ts
    expect(out.regions).toEqual([]) // added at v6
```

Add a region round-trip test inside the `importAll — round-trips` describe block:

```ts
  it('round-trips regions', async () => {
    await db.maps.add({ id: 'm1', name: 'M', image: '', width: 1, height: 1, createdAt: 1 })
    await db.regions.add({
      id: 'r1', mapId: 'm1', points: [[0, 0], [0, 5], [5, 0]], label: 'Forest',
      pageId: null, color: '#8fae6f',
    })

    const json = await exportAll()
    await clearAll()
    await importAll(json)

    expect(await db.regions.get('r1')).toMatchObject({ id: 'r1', label: 'Forest', color: '#8fae6f' })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/db.test.ts src/db/backup.test.ts`
Expected: FAIL — `regions` missing from counts / `db.regions` undefined in backup code.

- [ ] **Step 3: Update `backup.ts`**

Bump the version constant:

```ts
export const CURRENT_SCHEMA_VERSION = 6
```

Add `MapRegion` to the type import:

```ts
import type {
  Calendar,
  InfoboxTemplate,
  LorePage,
  MapPin,
  MapRegion,
  TimelineEvent,
  WorldMap,
} from './types'
```

Add `regions` to `BackupData` (after `pins?`):

```ts
  pins?: MapPin[]
  regions?: MapRegion[]
```

Add `regions` to `BackupCounts` (after `pins`):

```ts
  pins: number
  regions: number
```

Add the v5→v6 migration step to `MIGRATIONS`:

```ts
const MIGRATIONS: Record<number, (d: BackupData) => BackupData> = {
  // v3 added the editable infobox templates table (and its export field).
  2: (d) => ({ ...d, templates: asArray(d.templates) }),
  // v5 added the timeline calendars + events tables.
  4: (d) => ({ ...d, calendars: asArray(d.calendars), events: asArray(d.events) }),
  // v6 added the map regions table.
  5: (d) => ({ ...d, regions: asArray(d.regions) }),
}
```

Add `regions` to the `counts` object returned by `parseBackup` (after `pins`):

```ts
      pins: asArray(data.pins).length,
      regions: asArray(data.regions).length,
```

In `exportAll`, read and emit regions:

```ts
  const [pages, maps, pins, regions, templates, calendars, events] = await Promise.all([
    db.pages.toArray(),
    db.maps.toArray(),
    db.pins.toArray(),
    db.regions.toArray(),
    db.templates.toArray(),
    db.calendars.toArray(),
    db.events.toArray(),
  ])
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: pkg.version,
    exportedAt: now(),
    pages,
    maps,
    pins,
    regions,
    templates,
    calendars,
    events,
  })
```

In `importAll`, add `db.regions` to the transaction, clear, and bulkAdd:

```ts
  await db.transaction('rw', [db.pages, db.maps, db.pins, db.regions, db.templates, db.calendars, db.events], async () => {
    await Promise.all([
      db.pages.clear(), db.maps.clear(), db.pins.clear(), db.regions.clear(),
      db.templates.clear(), db.calendars.clear(), db.events.clear(),
    ])
    await db.pages.bulkAdd(asArray(data.pages))
    await db.maps.bulkAdd(asArray(data.maps))
    await db.pins.bulkAdd(asArray(data.pins))
    await db.regions.bulkAdd(asArray(data.regions))
    await db.templates.bulkAdd(asArray(data.templates))
    await db.calendars.bulkAdd(asArray(data.calendars))
    await db.events.bulkAdd(asArray(data.events))
  })
```

(No `sanitizeBackup` change — a region carries no HTML.)

- [ ] **Step 4: Update `fmtCounts` in HomeRoute**

In `src/routes/HomeRoute.tsx`, replace the `fmtCounts` line (~209-210):

```ts
  const fmtCounts = (c: BackupCounts) =>
    `${c.pages} pages · ${c.maps} maps · ${c.pins} pins · ${c.regions} regions · ${c.templates} page-types · ${c.calendars} calendars · ${c.events} events`
```

- [ ] **Step 5: Run tests + lint + build**

Run: `npm run test:run -- src/db.test.ts src/db/backup.test.ts`
Expected: PASS.

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/db/backup.ts src/routes/HomeRoute.tsx src/db.test.ts src/db/backup.test.ts
git commit -m "feat(backup): include map regions in export/import + v6 migration (#52)"
```

---

### Task 3: Render & draw regions in MapView (leaflet-draw)

**Files:**
- Modify: `package.json` (add `leaflet-draw`, `@types/leaflet-draw`)
- Modify: `src/components/MapView.tsx` (props, imports, region sync/draw/edit effects)
- Modify: `src/index.css` (region label style, near line 612)

**Interfaces:**
- Consumes: `MapRegion` (Task 1), `showPageHover`, `scheduleWikiHoverClose`.
- Produces (new `Props` fields on `MapView`):
  - `regions: MapRegion[]`
  - `regionStyles: Map<string, { color: string }>` — id → resolved fill colour
  - `selectedRegionId: string | null`
  - `drawMode: boolean`
  - `onRegionClick: (id: string) => void`
  - `onRegionCreate: (points: [number, number][]) => void`
  - `onRegionEdit: (id: string, points: [number, number][]) => void`

- [ ] **Step 1: Install leaflet-draw**

Run: `npm install leaflet-draw && npm install -D @types/leaflet-draw`
Expected: both added to `package.json`; no peer-dep errors (`leaflet-draw` targets Leaflet 1.x).

- [ ] **Step 2: Add imports + a typed handle for editing**

At the top of `src/components/MapView.tsx`, after the existing leaflet imports:

```ts
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import type { WorldMap, MapPin, MapRegion } from '../db'
import { showPageHover, scheduleWikiHoverClose } from '../wikiLinkHover'

// leaflet-draw augments polygon layers with an `editing` handler and adds the
// L.Draw.* / L.Draw.Event globals, but @types/leaflet-draw doesn't surface the
// per-layer handle, so we narrow it locally.
type EditablePolygon = L.Polygon & {
  editing: { enable(): void; disable(): void; enabled(): boolean }
}
```

- [ ] **Step 3: Extend the Props interface**

In `src/components/MapView.tsx`, add to `interface Props` (after `focusPinId?`):

```ts
  regions: MapRegion[]
  regionStyles: Map<string, { color: string }>
  selectedRegionId: string | null
  drawMode: boolean
  onRegionClick: (id: string) => void
  onRegionCreate: (points: [number, number][]) => void
  onRegionEdit: (id: string, points: [number, number][]) => void
```

And add them to the destructured params of `MapView({ ... })`:

```ts
export default function MapView({
  map, pins, styles, addMode, selectedPinId, onMapClick, onPinClick, onPinMove, focusPinId,
  regions, regionStyles, selectedRegionId, drawMode, onRegionClick, onRegionCreate, onRegionEdit,
}: Props) {
```

- [ ] **Step 4: Extend the callback + latest-value refs**

Replace the `cbRef` declaration/sync so region callbacks ride along:

```ts
  // Keep latest callbacks in a ref so we can attach handlers once.
  const cbRef = useRef({ onMapClick, onPinClick, onPinMove, onRegionClick, onRegionCreate, onRegionEdit })
  useEffect(() => {
    cbRef.current = { onMapClick, onPinClick, onPinMove, onRegionClick, onRegionCreate, onRegionEdit }
  })
```

Add region refs next to `pinsRef`/`addModeRef` and update their sync effect:

```ts
  // Latest pins / regions / modes for delegated + layer handlers.
  const pinsRef = useRef(pins)
  const addModeRef = useRef(addMode)
  const regionsRef = useRef(regions)
  const drawModeRef = useRef(drawMode)
  // True between a pin's dragstart and dragend, to suppress hover previews.
  const draggingRef = useRef(false)
  useEffect(() => {
    pinsRef.current = pins
    addModeRef.current = addMode
    regionsRef.current = regions
    drawModeRef.current = drawMode
  })
```

Add the polygon + editing refs near `markersRef`:

```ts
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const polygonsRef = useRef<Map<string, L.Polygon>>(new Map())
  // id of the region whose vertices are currently being edited, or null.
  const editingRef = useRef<string | null>(null)
```

- [ ] **Step 5: Clear polygons on map teardown**

In the map-creation effect's cleanup (where `markers.clear()` runs), also clear polygons:

```ts
    const markers = markersRef.current
    const polygons = polygonsRef.current
    return () => {
      lmap.remove()
      mapRef.current = null
      markers.clear()
      polygons.clear()
      editingRef.current = null
    }
```

- [ ] **Step 6: Region sync effect**

Add a new effect after the marker-sync effect (after the block ending at line ~156):

```ts
  // Sync polygons with the regions array and their derived fill colours. Polygons
  // live in the default overlay pane (z 400), below the marker pane (z 600), so
  // pins stay clickable on top.
  useEffect(() => {
    const lmap = mapRef.current
    if (!lmap) return
    const existing = polygonsRef.current
    const seen = new Set<string>()

    for (const region of regions) {
      if (region.points.length < 3) continue
      seen.add(region.id)
      const selected = region.id === selectedRegionId
      const fill = regionStyles.get(region.id)?.color ?? '#a0a0a0'
      const style: L.PathOptions = {
        color: fill,
        fillColor: fill,
        fillOpacity: selected ? 0.45 : 0.25,
        weight: selected ? 3 : 2,
      }
      const poly = existing.get(region.id)
      if (poly) {
        // Don't fight the user's in-progress vertex edits on this layer.
        if (editingRef.current !== region.id) poly.setLatLngs(region.points)
        poly.setStyle(style)
        poly.setTooltipContent(region.label)
      } else {
        const p = L.polygon(region.points, style).addTo(lmap)
        p.bindTooltip(region.label, { permanent: true, direction: 'center', className: 'region-label' })
        p.on('click', (e) => {
          L.DomEvent.stopPropagation(e) // don't also fire a map click
          cbRef.current.onRegionClick(region.id)
        })
        p.on('mouseover', () => {
          if (drawModeRef.current || editingRef.current) return
          const r = regionsRef.current.find((x) => x.id === region.id)
          if (!r?.pageId) return
          const el = p.getElement() as HTMLElement | null
          if (el) showPageHover(r.pageId, r.label, el.getBoundingClientRect())
        })
        p.on('mouseout', () => scheduleWikiHoverClose())
        existing.set(region.id, p)
      }
    }

    for (const [id, poly] of existing) {
      if (!seen.has(id)) {
        poly.remove()
        existing.delete(id)
      }
    }
  }, [regions, regionStyles, selectedRegionId])
```

- [ ] **Step 7: Drawing effect**

Add after the region-sync effect:

```ts
  // While drawMode is on, enable leaflet-draw's polygon drawer. On completion we
  // hand the vertices up; the new polygon is rendered from state (not added here),
  // so there's no duplicate layer.
  useEffect(() => {
    const lmap = mapRef.current
    if (!lmap || !drawMode) return
    const drawer = new L.Draw.Polygon(lmap, {
      allowIntersection: true,
      shapeOptions: { color: '#e0a458', weight: 2 },
    })
    drawer.enable()
    const onCreated = (e: L.LeafletEvent) => {
      const layer = (e as unknown as { layer: L.Polygon }).layer
      const ring = layer.getLatLngs()[0] as L.LatLng[]
      const points = ring.map((ll) => [ll.lat, ll.lng] as [number, number])
      if (points.length >= 3) cbRef.current.onRegionCreate(points)
    }
    lmap.on(L.Draw.Event.CREATED, onCreated)
    return () => {
      drawer.disable()
      lmap.off(L.Draw.Event.CREATED, onCreated)
    }
  }, [drawMode])
```

- [ ] **Step 8: Vertex-editing effect**

Add after the drawing effect (declared last so the sync effect has created the polygon first):

```ts
  // Enable vertex editing on the selected region; when selection leaves a region
  // that was being edited, disable editing and persist its new shape.
  useEffect(() => {
    const polys = polygonsRef.current
    const prev = editingRef.current
    if (prev && prev !== selectedRegionId) {
      const p = polys.get(prev) as EditablePolygon | undefined
      if (p?.editing?.enabled()) {
        p.editing.disable()
        const ring = p.getLatLngs()[0] as L.LatLng[]
        cbRef.current.onRegionEdit(prev, ring.map((ll) => [ll.lat, ll.lng] as [number, number]))
      }
      editingRef.current = null
    }
    if (selectedRegionId) {
      const p = polys.get(selectedRegionId) as EditablePolygon | undefined
      if (p?.editing && !p.editing.enabled()) {
        p.editing.enable()
        editingRef.current = selectedRegionId
      }
    }
  }, [selectedRegionId, regions])
```

- [ ] **Step 9: Region label CSS**

In `src/index.css`, after the `.pin-label` rule (~line 612), add:

```css
.region-label {
  background: rgba(20,18,14,.7); color: var(--ink); border: 1px solid var(--border);
  border-radius: 8px; padding: 1px 7px; font-size: 12px; font-weight: 600;
  box-shadow: none;
}
.region-label::before { display: none; } /* drop Leaflet's tooltip pointer arrow */
```

- [ ] **Step 10: Verify build + lint (MapView has no unit test by design)**

Run: `npm run lint && npm run build`
Expected: no errors. (Rendering is verified manually in Task 4's smoke test once the route wires it up.)

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json src/components/MapView.tsx src/index.css
git commit -m "feat(map): render & draw polygon regions via leaflet-draw (#52)"
```

---

### Task 4: Wire regions into MapRoute (toolbar, legend, panel)

**Files:**
- Modify: `src/routes/MapRoute.tsx`
- Modify: `src/index.css` (region swatch styles, near `.pin-panel`)

**Interfaces:**
- Consumes: `addRegion`, `regionStyle`, `MapRegion`, `TYPE_COLORS`, `db.regions`, and the new `MapView` props (Task 3).

- [ ] **Step 1: Import the region helpers**

In `src/routes/MapRoute.tsx`, extend the db import:

```ts
import {
  db, addMap, addPin, addRegion, deleteMap, pinType, regionStyle,
  TYPE_COLORS, type MapPin, type MapRegion, type InfoboxTemplate,
} from '../db'
```

- [ ] **Step 2: Add region state + live query**

After the existing `selectedPinId` state, add:

```ts
  const [drawMode, setDrawMode] = useState(false)
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
```

After the `pinsData` live query, add a regions live query (uses the same `mapId`):

```ts
  const regionsData = useLiveQuery(
    () => (mapId ? db.regions.where('mapId').equals(mapId).toArray() : Promise.resolve([] as MapRegion[])),
    [mapId],
  )
  const regions = useMemo(() => regionsData ?? [], [regionsData])
```

- [ ] **Step 3: Derive region styles + visible regions, and merge the legend**

After the existing `pinTypes` memo, add:

```ts
  // Resolve every region's fill + derived type once.
  const regionStyles = useMemo(
    () => new Map(regions.map((r) => [r.id, regionStyle(r, pagesById, templatesByName)])),
    [regions, pagesById, templatesByName],
  )
```

Replace the `legend` memo so it counts pins **and** regions per derived type:

```ts
  // Legend rows: one per distinct derived type present on this map (plus Untyped),
  // counting both pins and regions; toggling a row hides both.
  const legend = useMemo(() => {
    const rows = new Map<string, { key: string; name: string; color: string; icon: string | null; count: number }>()
    const bump = (name: string | null, color: string, icon: string | null) => {
      const key = name ?? ''
      const row = rows.get(key)
      if (row) row.count++
      else rows.set(key, { key, name: name ?? 'Untyped', color, icon, count: 1 })
    }
    for (const p of pins) {
      const t = pinTypes.get(p.id)!
      bump(t.name, t.color, t.icon)
    }
    for (const r of regions) {
      const s = regionStyles.get(r.id)!
      bump(s.type.name, s.type.color, s.type.icon)
    }
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [pins, pinTypes, regions, regionStyles])
```

Replace the `pinStyles` memo region-adjacent code by adding a region fill map and a visible-regions filter after the `visiblePins` memo:

```ts
  const visibleRegions = useMemo(
    () => regions.filter((r) => !hiddenTypes.has(regionStyles.get(r.id)?.type.name ?? '')),
    [regions, regionStyles, hiddenTypes],
  )

  // Fill colour per region id (only what MapView needs).
  const regionFills = useMemo(() => {
    const m = new Map<string, { color: string }>()
    for (const [id, s] of regionStyles) m.set(id, { color: s.fill })
    return m
  }, [regionStyles])
```

- [ ] **Step 4: Selected region + mutual-exclusion helpers**

After the existing `selectedPin` line, add:

```ts
  const selectedRegion = visibleRegions.find((r) => r.id === selectedRegionId) ?? null
```

Update the map-switch `onChange` (the `<select>` in the toolbar) to also reset region state:

```tsx
        <select value={currentMap?.id} onChange={(e) => {
          setActiveId(e.target.value)
          setSelectedPinId(null)
          setSelectedRegionId(null)
          setDrawMode(false)
          setHiddenTypes(new Set())
        }}>
```

- [ ] **Step 5: Add-pin / add-region toolbar buttons (mutually exclusive)**

Replace the existing "Add pin" button with both buttons (turning one mode on clears the other mode + all selections):

```tsx
        <button
          className={addMode ? 'primary-btn' : 'ghost-btn'}
          onClick={() => { setAddMode((v) => !v); setDrawMode(false); setSelectedPinId(null); setSelectedRegionId(null) }}
        >
          {addMode ? '✓ Click the map to place…' : '📍 Add pin'}
        </button>
        <button
          className={drawMode ? 'primary-btn' : 'ghost-btn'}
          onClick={() => { setDrawMode((v) => !v); setAddMode(false); setSelectedPinId(null); setSelectedRegionId(null) }}
        >
          {drawMode ? '✓ Click to draw, click first point to close' : '▱ Add region'}
        </button>
```

- [ ] **Step 6: Add a region click handler and pass region props to MapView**

Add a handler near `handleMapClick`:

```ts
  async function handleRegionCreate(points: [number, number][]) {
    if (!currentMap) return
    const id = await addRegion(currentMap.id, points)
    setDrawMode(false)
    setSelectedPinId(null)
    setSelectedRegionId(id)
  }
```

Update the `<MapView ... />` usage to pass region props and select-region clearing pins:

```tsx
          <MapView
            key={currentMap.id}
            map={currentMap}
            pins={visiblePins}
            styles={pinStyles}
            addMode={addMode}
            selectedPinId={selectedPinId}
            onMapClick={handleMapClick}
            onPinClick={(id) => { setSelectedPinId(id); setSelectedRegionId(null) }}
            onPinMove={(id, lat, lng) => db.pins.update(id, { lat, lng })}
            focusPinId={focusPinId}
            regions={visibleRegions}
            regionStyles={regionFills}
            selectedRegionId={selectedRegionId}
            drawMode={drawMode}
            onRegionClick={(id) => { setSelectedRegionId(id); setSelectedPinId(null) }}
            onRegionCreate={handleRegionCreate}
            onRegionEdit={(id, points) => db.regions.update(id, { points })}
          />
```

- [ ] **Step 7: Region selection panel**

After the `{selectedPin && ( … )}` block, add a region panel:

```tsx
        {selectedRegion && (
          <div className="pin-panel">
            <div className="pin-panel-head">
              <h3>Region</h3>
              <button className="tag-x" onClick={() => setSelectedRegionId(null)}>×</button>
            </div>
            <label>Label</label>
            <input
              value={selectedRegion.label}
              onChange={(e) => db.regions.update(selectedRegion.id, { label: e.target.value })}
            />
            <label>Linked page</label>
            <select
              value={selectedRegion.pageId ?? ''}
              onChange={(e) => db.regions.update(selectedRegion.id, { pageId: e.target.value || null })}
            >
              <option value="">— none —</option>
              {allPages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <label>Colour</label>
            <div className="region-swatches">
              <button
                className={selectedRegion.color ? 'region-swatch derive' : 'region-swatch derive active'}
                title="Derive from linked page type"
                onClick={() => db.regions.update(selectedRegion.id, { color: undefined })}
              >
                Auto
              </button>
              {TYPE_COLORS.map((c) => (
                <button
                  key={c}
                  className={selectedRegion.color === c ? 'region-swatch active' : 'region-swatch'}
                  style={{ background: c }}
                  title={c}
                  onClick={() => db.regions.update(selectedRegion.id, { color: c })}
                />
              ))}
            </div>
            <div className="pin-panel-actions">
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
          </div>
        )}
```

- [ ] **Step 8: Update the toolbar hint count (optional polish)**

Replace the pins hint span to also report regions:

```tsx
        <span className="map-hint">{pins.length} pins · {regions.length} regions</span>
```

- [ ] **Step 9: Region swatch CSS**

In `src/index.css`, after the `.pin-panel input, .pin-panel select` rule (~line 642), add:

```css
.region-swatches { display: flex; flex-wrap: wrap; gap: 6px; }
.region-swatch {
  width: 22px; height: 22px; border-radius: 6px; border: 2px solid transparent;
  cursor: pointer; padding: 0; background: var(--bg-2);
}
.region-swatch.active { border-color: var(--ink); }
.region-swatch.derive {
  width: auto; padding: 0 8px; height: 22px; color: var(--ink); font-size: 12px;
  border: 1px solid var(--border);
}
.region-swatch.derive.active { border-color: var(--ink); }
```

- [ ] **Step 10: Verify the full suite + a manual smoke test**

Run: `npm run lint && npm run build && npm run test:run`
Expected: lint clean, build OK, all tests pass.

Manual smoke test (`npm run dev`, open the pinned port 5174):
1. Upload a map (or open one). Click **▱ Add region**, click 3+ points, click the first point to close → a filled polygon with a "New region" label appears.
2. Click the region → panel opens. Set a Label, link a page → fill colour follows the page's type; the legend shows a combined pin+region count for that type.
3. Pick a swatch → fill overrides; click **Auto** → reverts to the derived colour. The legend bucket/swatch stays on the derived type.
4. Drag a vertex (region selected) → shape persists after deselecting.
5. Toggle the type in the legend → its pins **and** regions hide together.
6. Hover a linked region → the wiki preview card appears. **Open page →** navigates.
7. Export a backup, re-import it → the region survives with its label/colour.

- [ ] **Step 11: Commit**

```bash
git add src/routes/MapRoute.tsx src/index.css
git commit -m "feat(map): region toolbar, legend, and selection panel (#52)"
```

---

## Self-Review

**Spec coverage:**
- Data model `MapRegion` → Task 1. ✓
- Hybrid colour (`region.color ?? derived ?? grey`) → `regionStyle` (Task 1) + swatch panel (Task 4). ✓
- Legend bucket = derived type, toggling hides pins + regions → Task 4 legend merge + `visibleRegions`. ✓
- Schema v6 + cascade delete → Task 1. ✓
- leaflet-draw programmatic draw + per-layer vertex editing, polygons under pins → Task 3. ✓
- Centred permanent label, hover preview, click-to-select → Task 3. ✓
- Toolbar "Add region", region panel (label/page/colour/open/delete) → Task 4. ✓
- Backup: version bump, BackupData/Counts, migration step, export/import, fmtCounts → Task 2. ✓
- Tests: addRegion, cascade, regionStyle precedence, backup round-trip + migration, barrel re-exports, db.test counts → Tasks 1 & 2. ✓
- MapView untested by design → noted in Task 3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `regionStyle` returns `{ fill, type: PinType }` consistently (Task 1 definition, Task 3 `regionStyles` prop is `{ color }` derived from `.fill`, Task 4 `regionFills` maps `.fill → color` and legend reads `.type.{name,color,icon}`). `addRegion(mapId, points)`, `db.regions`, `CURRENT_SCHEMA_VERSION = 6`, and `MapRegion` fields match across tasks. MapView prop names (`regions`, `regionStyles`, `selectedRegionId`, `drawMode`, `onRegionClick`, `onRegionCreate`, `onRegionEdit`) are identical in Task 3's interface and Task 4's usage. ✓
