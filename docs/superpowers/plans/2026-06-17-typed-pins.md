# Typed Pins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make map pins inherit color + icon from their linked page's type, add drag-to-reposition, and a legend/filter panel.

**Architecture:** Pins store no type data — type is *derived* from `pin.pageId → page.category → template`. A new `pinType()` helper in `db.ts` centralises that resolution so both Leaflet markers and the legend compute identically. Page types (`InfoboxTemplate`) gain an optional `icon`, set on the Templates screen and backfilled onto built-ins non-destructively.

**Tech Stack:** React + TypeScript, Dexie (IndexedDB), `dexie-react-hooks` `useLiveQuery`, Leaflet, Vite.

**Testing note:** This project has **no automated test suite** (see `CLAUDE.md`). Each task is verified with `npm run build` (tsc type-check), `npm run lint`, and explicit manual checks in the running app (`npm run dev`, served on port 5174). Commit after each task.

---

## File Structure

- `src/db.ts` — add `icon?` to `InfoboxTemplate`, a `BUILTIN_ICONS` record, icon backfill in `seedTemplates()` and `resetTemplate()`, and the new `pinType()` helper + `PinType` type.
- `src/components/MapView.tsx` — typed marker rendering (color + icon), drag-to-reposition. Takes a per-pin style map from the route.
- `src/routes/MapRoute.tsx` — reactively read templates, compute pin styles + legend rows, render the legend/filter panel, filter hidden types out of the pins passed to `MapView`.
- `src/routes/TemplatesRoute.tsx` — an icon input next to the colour row.
- `src/index.css` — marker icon styling + legend panel styling.

No new files. All changes extend existing modules following their current patterns.

---

## Task 1: Add `icon` to page types (data model + seeding)

**Files:**
- Modify: `src/db.ts` (interface ~line 220, helpers near `hue` ~line 232, `seedTemplates` ~line 360, `resetTemplate` ~line 469)

- [ ] **Step 1: Add the optional `icon` field to the `InfoboxTemplate` interface**

In `src/db.ts`, find the interface (around line 220) and add `icon`:

```ts
/** A page type: a coloured category plus the starter rows for its infobox. */
export interface InfoboxTemplate {
  id: string
  name: string
  color: string // accent colour for this type's badges/dots
  icon?: string // optional emoji shown on map pins for this type
  items: TemplateItem[]
  builtin: boolean // true for the shipped starter templates
}
```

- [ ] **Step 2: Add a `BUILTIN_ICONS` record next to the `hue` helper**

In `src/db.ts`, just after the `hue` helper (around line 232), add:

```ts
// Default emojis for the shipped page types. Backfilled onto built-ins by
// seedTemplates() without overwriting a user's choice (mirrors the colour backfill).
export const BUILTIN_ICONS: Record<string, string> = {
  Character: '🧑', Country: '🏳️', Deity: '✨', Geography: '⛰️', Item: '🎒',
  Organization: '🏛️', Religion: '⛩️', Species: '🐾', Settlement: '🏰',
  Condition: '🤒', Conflict: '⚔️', Document: '📜', Culture: '🎭',
  Language: '🗣️', Material: '⛏️', Myth: '🐉', Technology: '⚙️',
  Tradition: '🎎', Spell: '🔮',
}
```

- [ ] **Step 3: Backfill icons in `seedTemplates()`**

In `src/db.ts`, at the **end** of `seedTemplates()` (after the existing `needColor` block, before the closing brace ~line 377), add a re-read + icon backfill. Re-reading covers built-ins that were just `bulkAdd`-ed this run:

```ts
  // Backfill default icons onto built-ins that don't have one yet (never
  // overwrites a user's icon). Re-read so freshly-added built-ins are included.
  const afterSeed = await db.templates.toArray()
  const needIcon = afterSeed.filter((t) => t.builtin && !t.icon && BUILTIN_ICONS[t.name])
  await Promise.all(needIcon.map((t) => db.templates.update(t.id, { icon: BUILTIN_ICONS[t.name] })))
```

- [ ] **Step 4: Preserve the icon when resetting a built-in**

In `src/db.ts`, update `resetTemplate()` (~line 469) so a reset restores the shipped icon too:

```ts
/** Restore a built-in template's rows to their shipped defaults. */
export async function resetTemplate(id: string): Promise<void> {
  const original = BUILTIN_TEMPLATES.find((t) => t.id === id)
  if (original) await db.templates.put({ ...original, icon: BUILTIN_ICONS[original.name] })
}
```

- [ ] **Step 5: Verify it type-checks and lints**

Run: `npm run build && npm run lint`
Expected: build succeeds (no TS errors), lint clean.

- [ ] **Step 6: Manual check — icons seed**

Run `npm run dev`, open `http://localhost:5174`. Open DevTools console and run:
```js
(await indexedDB.databases())  // confirm the lore DB exists
```
Then in the app go to the Templates screen — every built-in type should now resolve an icon in Task 5 (no UI yet, so for now verify via console):
```js
// In console, on the app origin:
const req = indexedDB.open('lore-app'); req.onsuccess = e => {
  e.target.result.transaction('templates').objectStore('templates').getAll().onsuccess =
    ev => console.table(ev.target.result.map(t => ({name: t.name, icon: t.icon})))
}
```
Expected: built-ins show emojis (e.g. Character → 🧑). No icon column should be blank for a built-in.

- [ ] **Step 7: Commit**

```bash
git add src/db.ts
git commit -m "feat(map): add optional icon to page types with seeding"
```

---

## Task 2: `pinType()` resolution helper

**Files:**
- Modify: `src/db.ts` (add near the map CRUD helpers, after `addPin` ~line 821)

- [ ] **Step 1: Add the `PinType` type and `pinType()` helper**

In `src/db.ts`, after `addPin()` (~line 821), add:

```ts
/** A pin's derived visual identity. Pins store no type — it comes from the
 *  linked page's category. Unlinked/unresolved pins are "Untyped". */
export interface PinType {
  name: string | null   // page-type name, or null when untyped
  color: string         // type colour, or neutral grey when untyped
  icon: string | null   // type emoji, or null
}

/** Resolve a pin's type from its linked page. `pagesById` and `templatesByName`
 *  (keyed by lower-cased name) are passed in so callers build them once per render. */
export function pinType(
  pin: MapPin,
  pagesById: Map<string, LorePage>,
  templatesByName: Map<string, InfoboxTemplate>,
): PinType {
  const page = pin.pageId ? pagesById.get(pin.pageId) : undefined
  const name = page?.category ?? null
  if (!name) return { name: null, color: '#a0a0a0', icon: null }
  const tpl = templatesByName.get(name.toLowerCase())
  return { name, color: tpl?.color ?? categoryColor(name), icon: tpl?.icon ?? null }
}
```

- [ ] **Step 2: Verify type-check and lint**

Run: `npm run build && npm run lint`
Expected: build succeeds, lint clean.

- [ ] **Step 3: Commit**

```bash
git add src/db.ts
git commit -m "feat(map): add pinType() derivation helper"
```

---

## Task 3: Typed markers + drag-to-reposition (`MapView.tsx`)

**Files:**
- Modify: `src/components/MapView.tsx`
- Modify: `src/index.css` (pin styling ~line 538)

- [ ] **Step 1: Extend `Props` and the marker sync to use derived styles + drag**

Replace the body of `src/components/MapView.tsx` with the version below. Changes: `Props` gains a `styles` map (pinId → `{ color, icon }`) and an `onPinMove` callback; `makeIcon` takes color+icon; markers are `draggable` (off in add-mode) and persist on `dragend`; the marker effect depends on `styles` so type/colour/icon edits re-render live.

```tsx
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { WorldMap, MapPin } from '../db'

export interface PinMarkerStyle {
  color: string
  icon: string | null
}

interface Props {
  map: WorldMap
  pins: MapPin[]
  styles: Map<string, PinMarkerStyle>
  addMode: boolean
  selectedPinId: string | null
  onMapClick: (lat: number, lng: number) => void
  onPinClick: (pinId: string) => void
  onPinMove: (pinId: string, lat: number, lng: number) => void
}

// We use a "Simple" coordinate system so the map is just the flat image, with
// pixel-based coordinates instead of real-world latitude/longitude.
export default function MapView({
  map, pins, styles, addMode, selectedPinId, onMapClick, onPinClick, onPinMove,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  // Keep latest callbacks in a ref so we can attach handlers once.
  const cbRef = useRef({ onMapClick, onPinClick, onPinMove })
  useEffect(() => {
    cbRef.current = { onMapClick, onPinClick, onPinMove }
  })

  // Create the Leaflet map once per world-map image.
  useEffect(() => {
    if (!containerRef.current) return
    const bounds: L.LatLngBoundsExpression = [[0, 0], [map.height, map.width]]
    const lmap = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -4,
      maxZoom: 4,
      zoomControl: true,
      attributionControl: false,
    })
    L.imageOverlay(map.image, bounds).addTo(lmap)
    lmap.fitBounds(bounds)
    lmap.on('click', (e) => cbRef.current.onMapClick(e.latlng.lat, e.latlng.lng))
    mapRef.current = lmap
    const markers = markersRef.current
    return () => {
      lmap.remove()
      mapRef.current = null
      markers.clear()
    }
  }, [map.id, map.image, map.width, map.height])

  // Reflect add-mode in the cursor.
  useEffect(() => {
    const el = containerRef.current
    if (el) el.style.cursor = addMode ? 'crosshair' : ''
  }, [addMode])

  // Sync markers with the pins array and their derived styles.
  useEffect(() => {
    const lmap = mapRef.current
    if (!lmap) return
    const existing = markersRef.current
    const seen = new Set<string>()

    for (const pin of pins) {
      seen.add(pin.id)
      const selected = pin.id === selectedPinId
      const style = styles.get(pin.id) ?? { color: '#a0a0a0', icon: null }
      const icon = makeIcon(pin.label, style, selected)
      let marker = existing.get(pin.id)
      if (marker) {
        marker.setLatLng([pin.lat, pin.lng])
        marker.setIcon(icon)
      } else {
        marker = L.marker([pin.lat, pin.lng], { icon, draggable: !addMode }).addTo(lmap)
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e) // don't also fire a map click
          cbRef.current.onPinClick(pin.id)
        })
        marker.on('dragend', () => {
          const { lat, lng } = marker!.getLatLng()
          cbRef.current.onPinMove(pin.id, lat, lng)
        })
        existing.set(pin.id, marker)
      }
      // Dragging is disabled while placing a new pin to avoid click/drag conflicts.
      if (marker.dragging) addMode ? marker.dragging.disable() : marker.dragging.enable()
    }

    // Remove markers whose pins were deleted or filtered out.
    for (const [id, marker] of existing) {
      if (!seen.has(id)) {
        marker.remove()
        existing.delete(id)
      }
    }
  }, [pins, styles, selectedPinId, addMode])

  return <div ref={containerRef} className="map-canvas" />
}

// A small teardrop pin rendered as an HTML element, tinted by its type colour
// with an optional emoji above the dot.
function makeIcon(label: string, style: PinMarkerStyle, selected: boolean): L.DivIcon {
  const safe = label.replace(/</g, '&lt;')
  const emoji = style.icon ? `<span class="pin-emoji">${style.icon}</span>` : ''
  return L.divIcon({
    className: 'pin-icon-wrap',
    html:
      `<div class="pin-icon${selected ? ' selected' : ''}">${emoji}` +
      `<span class="pin-dot" style="background:${style.color}"></span>` +
      `<span class="pin-label">${safe}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}
```

- [ ] **Step 2: Add the `.pin-emoji` style**

In `src/index.css`, just after the `.pin-icon.selected .pin-dot` rule (~line 544), add:

```css
.pin-emoji { font-size: 15px; line-height: 1; margin-bottom: 2px; filter: drop-shadow(0 1px 1px rgba(0,0,0,.6)); }
```

(The inline `background` set in `makeIcon` overrides the default `.pin-dot` background — the existing `.pin-dot` rule stays as the unselected fallback shape.)

- [ ] **Step 3: Verify type-check and lint**

Run: `npm run build && npm run lint`
Expected: build will likely **fail** here because `MapRoute.tsx` doesn't yet pass `styles`/`onPinMove`. That's fine — it's fixed in Task 4. If you want a green checkpoint first, do Task 4 before committing. Otherwise confirm the only errors are the missing `MapView` props in `MapRoute.tsx`.

- [ ] **Step 4: Commit (with Task 4) — see Task 4 Step 6**

This task and Task 4 share a build boundary; commit them together at the end of Task 4.

---

## Task 4: Wire styles + legend/filter into `MapRoute.tsx`

**Files:**
- Modify: `src/routes/MapRoute.tsx`
- Modify: `src/index.css` (add legend styles after the pin rules)

- [ ] **Step 1: Read templates reactively and build lookup maps + pin styles**

In `src/routes/MapRoute.tsx`, update the imports and add the derived data. Change the import line to include the helpers/types:

```ts
import { db, addMap, addPin, deleteMap, pinType, type MapPin, type InfoboxTemplate } from '../db'
import MapView, { type PinMarkerStyle } from '../components/MapView'
```

Add a reactive templates read alongside the existing `allPages` read (after line ~27):

```ts
  const templates = useLiveQuery(() => db.templates.toArray(), []) ?? []
```

Add `useMemo` to the React import at the top:

```ts
import { useMemo, useRef, useState } from 'react'
```

- [ ] **Step 2: Add hidden-type filter state and derive styles + legend rows**

In `MapRoute.tsx`, after `selectedPin` (~line 28), add:

```ts
  // Legend filter: set of type-keys hidden on this map. "" = the Untyped group.
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())

  const pagesById = useMemo(() => new Map(allPages.map((p) => [p.id, p])), [allPages])
  const templatesByName = useMemo(
    () => new Map(templates.map((t) => [t.name.toLowerCase(), t] as [string, InfoboxTemplate])),
    [templates],
  )

  // Resolve every pin's derived type once.
  const pinTypes = useMemo(
    () => new Map(pins.map((p) => [p.id, pinType(p, pagesById, templatesByName)])),
    [pins, pagesById, templatesByName],
  )

  // Legend rows: one per distinct type present on this map (plus Untyped), with counts.
  const legend = useMemo(() => {
    const rows = new Map<string, { key: string; name: string; color: string; icon: string | null; count: number }>()
    for (const p of pins) {
      const t = pinTypes.get(p.id)!
      const key = t.name ?? ''
      const row = rows.get(key)
      if (row) row.count++
      else rows.set(key, { key, name: t.name ?? 'Untyped', color: t.color, icon: t.icon, count: 1 })
    }
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [pins, pinTypes])

  // Pins passed to the map, minus any whose type is hidden.
  const visiblePins = useMemo(
    () => pins.filter((p) => !hiddenTypes.has(pinTypes.get(p.id)?.name ?? '')),
    [pins, pinTypes, hiddenTypes],
  )

  // Marker styles keyed by pin id (only what MapView needs).
  const pinStyles = useMemo(() => {
    const m = new Map<string, PinMarkerStyle>()
    for (const [id, t] of pinTypes) m.set(id, { color: t.color, icon: t.icon })
    return m
  }, [pinTypes])

  function toggleType(key: string) {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
```

- [ ] **Step 3: Reset the filter when switching maps**

The map `<select>` `onChange` (~line 63) currently does `setActiveId` + `setSelectedPinId(null)`. Add a filter reset:

```tsx
        <select value={currentMap?.id} onChange={(e) => { setActiveId(e.target.value); setSelectedPinId(null); setHiddenTypes(new Set()) }}>
```

- [ ] **Step 4: Pass the new props to `MapView` and render the legend**

In `MapRoute.tsx`, replace the `<MapView ... />` element (~line 84-94) with one that passes `visiblePins`, `pinStyles`, and `onPinMove`:

```tsx
        {currentMap && (
          <MapView
            key={currentMap.id}
            map={currentMap}
            pins={visiblePins}
            styles={pinStyles}
            addMode={addMode}
            selectedPinId={selectedPinId}
            onMapClick={handleMapClick}
            onPinClick={setSelectedPinId}
            onPinMove={(id, lat, lng) => db.pins.update(id, { lat, lng })}
          />
        )}

        {legend.length > 0 && (
          <div className="map-legend">
            {legend.map((row) => {
              const hidden = hiddenTypes.has(row.key)
              return (
                <button
                  key={row.key}
                  className={hidden ? 'legend-row hidden' : 'legend-row'}
                  onClick={() => toggleType(row.key)}
                  title={hidden ? 'Show these pins' : 'Hide these pins'}
                >
                  <span className="legend-swatch" style={{ background: row.color }}>{row.icon ?? ''}</span>
                  <span className="legend-name">{row.name}</span>
                  <span className="legend-count">{row.count}</span>
                </button>
              )
            })}
          </div>
        )}
```

- [ ] **Step 5: Add legend styling**

In `src/index.css`, after the `.pin-label` rule (~line 548), add:

```css
.map-legend {
  position: absolute; bottom: 16px; left: 16px; z-index: 1000; max-height: 40%;
  overflow-y: auto; display: flex; flex-direction: column; gap: 2px;
  background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 8px; box-shadow: 0 8px 30px rgba(0,0,0,.5);
}
.legend-row {
  display: flex; align-items: center; gap: 8px; padding: 4px 6px; border: none;
  background: none; color: var(--ink); cursor: pointer; border-radius: 6px; font-size: 13px;
}
.legend-row:hover { background: var(--bg-2); }
.legend-row.hidden { opacity: 0.4; }
.legend-swatch {
  width: 18px; height: 18px; border-radius: 50%; display: inline-flex;
  align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0;
  border: 1px solid rgba(0,0,0,.4);
}
.legend-name { flex: 1; text-align: left; }
.legend-count { color: var(--ink-faint); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 6: Verify type-check and lint**

Run: `npm run build && npm run lint`
Expected: build succeeds (Task 3 + Task 4 now consistent), lint clean.

- [ ] **Step 7: Manual check — typed pins, drag, filter**

Run `npm run dev`, open `http://localhost:5174`, go to Map (upload an image if none).
1. Add a pin, link it to a page whose type is e.g. "Settlement" → pin dot turns that type's colour with the 🏰 emoji above it. **Live:** change that page's type on its page → the pin recolours without reload.
2. Add a pin, leave it unlinked → neutral grey dot, no emoji; legend shows an "Untyped" row.
3. Drag a pin to a new spot, reload the page → it stays moved.
4. With "Add pin" active, confirm pins are not draggable; after placing, dragging works again.
5. Click a legend row → those pins disappear from the map and the row dims; click again → they return. Switch maps → filter resets.

- [ ] **Step 8: Commit**

```bash
git add src/components/MapView.tsx src/routes/MapRoute.tsx src/index.css
git commit -m "feat(map): typed pins, drag-to-reposition, legend filter"
```

---

## Task 5: Icon input on the Templates screen

**Files:**
- Modify: `src/routes/TemplatesRoute.tsx` (colour row ~line 123-141)

- [ ] **Step 1: Add an icon input beside the colour row**

In `src/routes/TemplatesRoute.tsx`, immediately after the closing `</div>` of `.template-color-row` (~line 141), add an icon row:

```tsx
            <div className="template-color-row">
              <span className="template-color-label">Icon</span>
              <input
                className="template-icon-input"
                value={selected.icon ?? ''}
                maxLength={4}
                placeholder="🏰"
                title="An emoji shown on map pins of this type"
                onChange={(e) => updateTemplate(selected.id, { icon: e.target.value })}
              />
              {selected.icon && (
                <button
                  className="mini-btn"
                  onClick={() => updateTemplate(selected.id, { icon: '' })}
                  title="Clear icon"
                >
                  Clear
                </button>
              )}
            </div>
```

(`maxLength={4}` leaves room for multi-codepoint emoji like 🏳️. Reuses the existing `.template-color-row` layout class.)

- [ ] **Step 2: Add a width for the icon input**

In `src/index.css`, near the templates styles (search for `.template-color-label`), add:

```css
.template-icon-input { width: 60px; text-align: center; font-size: 18px; background: var(--bg-2); border: 1px solid var(--border); color: var(--ink); border-radius: 7px; padding: 4px; }
```

- [ ] **Step 3: Verify type-check and lint**

Run: `npm run build && npm run lint`
Expected: build succeeds, lint clean.

- [ ] **Step 4: Manual check — icon edits round-trip**

Run `npm run dev`, open the Templates screen.
1. Select a type → the icon input shows its current emoji.
2. Change it to a new emoji → go to Map, a linked pin of that type updates to the new emoji (live, no reload).
3. Clear it → pins of that type show a coloured dot with no emoji.
4. On a built-in, click "↺ Reset" → its shipped icon comes back.

- [ ] **Step 5: Commit**

```bash
git add src/routes/TemplatesRoute.tsx src/index.css
git commit -m "feat(templates): per-type icon field"
```

---

## Task 6: Verify backup round-trips the new field

**Files:** none (verification only — `exportAll()`/`importAll()` already serialise the whole `templates` table, so `icon` is included automatically).

- [ ] **Step 1: Manual round-trip check**

Run `npm run dev`. On the Home screen:
1. Set a distinctive icon on a custom type, then **Export** a backup (JSON download).
2. Open the JSON in an editor → confirm the template object contains your `icon`.
3. Change the icon in-app, then **Import** the backup → confirm the icon reverts to the exported value (import replaces all data).

- [ ] **Step 2: Final full verification**

Run: `npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 3: No commit needed** (verification only). If any fix was required, commit it with a `fix(map): …` message.

---

## Self-Review (completed by plan author)

- **Spec coverage:** Data model `icon` + derive-only pins (Tasks 1–2); typed marker rendering + drag (Task 3); legend + filter (Task 4); Templates icon field (Task 5); backup round-trip + unlinked/neutral behaviour (Tasks 1/4/6). All spec sections mapped.
- **Deferred scope honoured:** no pin search, no centering-from-list, no nesting, no hover previews, no regions, no per-pin override.
- **Type consistency:** `PinType` (db.ts) vs `PinMarkerStyle` (MapView) are distinct by design — the route maps the former to the latter in Task 4 Step 2. `pinType()`, `BUILTIN_ICONS`, `hiddenTypes`, `pinStyles`, `visiblePins`, `onPinMove` names are used identically across tasks.
- **Dexie version:** adding an optional non-indexed `icon` field needs **no** version bump (schema indexes unchanged at v5) — confirmed against `src/db.ts` `version(5)`.
