# Map Wiki Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users hover a map pin to preview its linked page, and jump from a page to its pin on the map via a deep link.

**Architecture:** Pins drive the **existing** app-wide hover popover through the `showPageHover(pageId, title, rect)` bus (pins store `pageId`, so no title lookup). "Show on map" is a deep link: a "Location" block in the page sidebar navigates to `#/map?pin=<id>`; `MapRoute` reads the param, switches to that pin's map, selects it, and passes a new `focusPinId` prop to `MapView`, which pans to it. No data-model or schema change.

**Tech Stack:** React + TypeScript, Dexie (IndexedDB), `dexie-react-hooks` `useLiveQuery`, Leaflet, react-router-dom v7 (`HashRouter`), Vite.

**Testing note:** This project has **no automated test suite** (see `CLAUDE.md`). Each task is verified with `npm run build` (tsc type-check), `npm run lint`, and explicit manual checks in the running app (`npm run dev`, port 5174). Commit after each task.

## Global Constraints

- Dev/preview server is pinned to **port 5174** (`strictPort`); do not change it.
- IndexedDB stores `pins` as `'id, mapId, pageId'` (v5) — `pageId` is indexed; **no schema bump** for this feature.
- The hover bus (`src/wikiLinkHover.ts`) and `WikiLinkPopover` (mounted once at the app root in `App.tsx`) already exist — **reuse them; do not add a second popover.**
- Unlinked pins (`pageId == null`) must get **no** preview.
- Hover previews are suppressed while dragging a pin and while add-mode is active.

---

## File Structure

- `src/components/MapView.tsx` — stamp `data-pin-id` on linked pins' markers, delegate pin hover to the bus (Task 1), and add a `focusPinId` pan effect (Task 2).
- `src/routes/MapRoute.tsx` — read `?pin=` and drive `activeId` / `selectedPinId` / `focusPinId` (Task 2).
- `src/routes/PageRoute.tsx` — query pins linking the page and render the "Location" block (Task 3).
- `src/index.css` — "Location" block styling (Task 3).

No new files.

---

## Task 1: Hover previews on pins (`MapView.tsx`)

**Files:**
- Modify: `src/components/MapView.tsx`

**Interfaces:**
- Consumes: `showPageHover(pageId: string, title: string, rect: DOMRect)` and `scheduleWikiHoverClose()` from `src/wikiLinkHover.ts` (already exist).
- Produces: marker DOM elements carry `data-pin-id="<pin.id>"` on the `.pin-icon` div for linked pins only.

- [ ] **Step 1: Import the hover bus**

In `src/components/MapView.tsx`, add after the existing `import type { WorldMap, MapPin } from '../db'` line (line 4):

```tsx
import { showPageHover, scheduleWikiHoverClose } from '../wikiLinkHover'
```

- [ ] **Step 2: Add refs for the delegated hover handlers**

The delegated listeners are attached once but need the *current* `pins` and `addMode`, plus a drag flag. In `MapView`, just after the existing `cbRef` effect (the `useEffect(() => { cbRef.current = … })` block, ~line 32-34), add:

```tsx
  // Latest pins / add-mode for the delegated hover handlers (attached once below).
  const pinsRef = useRef(pins)
  pinsRef.current = pins
  const addModeRef = useRef(addMode)
  addModeRef.current = addMode
  // True between a pin's dragstart and dragend, to suppress hover previews.
  const draggingRef = useRef(false)
```

- [ ] **Step 3: Add the delegated hover effect**

In `MapView`, after the "Reflect add-mode in the cursor" effect (the `useEffect(() => { … }, [addMode])` block, ~line 60-63), add:

```tsx
  // Pin hover → page preview, reusing the app-wide popover bus. Delegated on the
  // map container so it survives Leaflet re-creating marker elements. Suppressed
  // while dragging or placing a pin (mirrors editor edit-mode suppression).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function over(e: MouseEvent) {
      if (addModeRef.current || draggingRef.current) return
      const icon = (e.target as HTMLElement).closest('.pin-icon[data-pin-id]') as HTMLElement | null
      if (!icon) return
      const pin = pinsRef.current.find((p) => p.id === icon.dataset.pinId)
      if (!pin?.pageId) return
      showPageHover(pin.pageId, pin.label, icon.getBoundingClientRect())
    }
    function out(e: MouseEvent) {
      if ((e.target as HTMLElement).closest('.pin-icon[data-pin-id]')) scheduleWikiHoverClose()
    }
    el.addEventListener('mouseover', over)
    el.addEventListener('mouseout', out)
    return () => {
      el.removeEventListener('mouseover', over)
      el.removeEventListener('mouseout', out)
    }
  }, [])
```

- [ ] **Step 4: Track drag start/end and close the popover on drag**

In the marker-sync effect, the marker is created in the `else` branch (~line 81-93). Replace the existing `m.on('dragend', …)` handler with a `dragstart` + `dragend` pair so the drag flag is set/cleared and any open popover is dismissed when a drag begins:

```tsx
        m.on('dragstart', () => {
          draggingRef.current = true
          scheduleWikiHoverClose()
        })
        m.on('dragend', () => {
          draggingRef.current = false
          const { lat, lng } = m.getLatLng()
          cbRef.current.onPinMove(pin.id, lat, lng)
        })
```

- [ ] **Step 5: Stamp `data-pin-id` on linked markers via `makeIcon`**

Change `makeIcon` to take the whole pin (so it can read `id` and `pageId`) and stamp `data-pin-id` only for linked pins. Replace the `makeIcon` function (~line 116-130) with:

```tsx
// A small teardrop pin rendered as an HTML element, tinted by its type colour
// with an optional emoji above the dot. Linked pins carry data-pin-id so the
// delegated hover handler can resolve them back to a page.
function makeIcon(pin: MapPin, style: PinMarkerStyle, selected: boolean): L.DivIcon {
  const safe = pin.label.replace(/</g, '&lt;')
  const emoji = style.icon ? `<span class="pin-emoji">${style.icon}</span>` : ''
  const idAttr = pin.pageId ? ` data-pin-id="${pin.id}"` : ''
  return L.divIcon({
    className: 'pin-icon-wrap',
    html:
      `<div class="pin-icon${selected ? ' selected' : ''}"${idAttr}>${emoji}` +
      `<span class="pin-dot" style="background:${style.color}"></span>` +
      `<span class="pin-label">${safe}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}
```

- [ ] **Step 6: Update the `makeIcon` call site**

In the marker-sync effect, the call currently reads `const icon = makeIcon(pin.label, style, selected)` (~line 76). Change it to pass the pin:

```tsx
      const icon = makeIcon(pin, style, selected)
```

- [ ] **Step 7: Verify type-check and lint**

Run: `npm run build && npm run lint`
Expected: build succeeds (no TS errors), lint clean.

- [ ] **Step 8: Manual check — pin hover previews**

Run `npm run dev`, open `http://localhost:5174`, go to Map.
1. Hover a pin **linked** to a page → after ~300 ms the page preview card appears (category chip, title, summary, and infobox image if present). Move the cursor into the card → it stays open. Move away → it dismisses.
2. Hover an **unlinked** pin → no card appears.
3. Start dragging a pin → no card appears during the drag; the pin still repositions and persists.
4. Click "📍 Add pin" (add-mode) → hovering existing pins shows no card.

- [ ] **Step 9: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "feat(map): hover previews on linked pins"
```

---

## Task 2: Deep-link a pin (`?pin=` → focus on map)

**Files:**
- Modify: `src/components/MapView.tsx` (add `focusPinId` prop + pan effect)
- Modify: `src/routes/MapRoute.tsx` (read `?pin=`, drive map/selection/focus)

**Interfaces:**
- Produces: `MapView` accepts a new optional prop `focusPinId?: string | null`. `MapRoute` reads the `pin` query param and passes it through.
- Consumes: `useSearchParams` from `react-router-dom`; `db.pins.get(id)` from `src/db.ts`.

- [ ] **Step 1: Add the `focusPinId` prop to `MapView`'s `Props`**

In `src/components/MapView.tsx`, add to the `Props` interface (after `onPinMove`, ~line 19):

```tsx
  focusPinId?: string | null
```

- [ ] **Step 2: Destructure `focusPinId`**

Update the component signature (~line 24-26) to include it:

```tsx
export default function MapView({
  map, pins, styles, addMode, selectedPinId, onMapClick, onPinClick, onPinMove, focusPinId,
}: Props) {
```

- [ ] **Step 3: Add the pan-to-focus effect**

In `MapView`, after the marker-sync effect (the `}, [pins, styles, selectedPinId, addMode])` block, add:

```tsx
  // Pan to a deep-linked pin once its marker exists. `focusedRef` ensures we pan
  // once per target rather than on every pins update (e.g. while dragging).
  const focusedRef = useRef<string | null>(null)
  useEffect(() => {
    const lmap = mapRef.current
    if (!lmap || !focusPinId || focusedRef.current === focusPinId) return
    const pin = pins.find((p) => p.id === focusPinId)
    if (!pin) return
    focusedRef.current = focusPinId
    lmap.setView([pin.lat, pin.lng], Math.max(lmap.getZoom(), 1))
  }, [focusPinId, pins])
```

- [ ] **Step 4: Read `?pin=` in `MapRoute` and import `useEffect`**

In `src/routes/MapRoute.tsx`, change the React import (line 1) to add `useEffect`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
```

Change the router import (line 2) to add `useSearchParams`:

```tsx
import { useNavigate, useSearchParams } from 'react-router-dom'
```

- [ ] **Step 5: Resolve the param to a map + selection**

In `MapRoute`, just after the existing state declarations (after `const [confirmDeleteMap, setConfirmDeleteMap] = useState(false)`, ~line 17), add:

```tsx
  const [searchParams] = useSearchParams()
  const focusPinId = searchParams.get('pin')

  // A deep link (#/map?pin=<id>) switches to that pin's map and selects it.
  // MapView then pans to it. A stale/deleted id is a harmless no-op.
  useEffect(() => {
    if (!focusPinId) return
    let cancelled = false
    db.pins.get(focusPinId).then((pin) => {
      if (cancelled || !pin) return
      setActiveId(pin.mapId)
      setSelectedPinId(pin.id)
    })
    return () => { cancelled = true }
  }, [focusPinId])
```

- [ ] **Step 6: Pass `focusPinId` to `MapView`**

In the `<MapView … />` element (~line 144-154), add the prop (e.g. after `onPinMove`):

```tsx
            focusPinId={focusPinId}
```

- [ ] **Step 7: Verify type-check and lint**

Run: `npm run build && npm run lint`
Expected: build succeeds, lint clean.

- [ ] **Step 8: Manual check — deep link focuses a pin**

Run `npm run dev`. You need a pin id: open DevTools console on `http://localhost:5174` and run
```js
const r = indexedDB.open('lore-app'); r.onsuccess = e =>
  e.target.result.transaction('pins').objectStore('pins').getAll().onsuccess =
    ev => console.table(ev.target.result.map(p => ({ id: p.id, label: p.label, mapId: p.mapId, pageId: p.pageId })))
```
1. Pick a pin id and navigate the browser to `http://localhost:5174/#/map?pin=<that-id>`.
   Expected: the map switches to that pin's map (if different), the pin is selected (pin panel open), and the view pans to it.
2. If the pin is on a non-default map, confirm the map dropdown reflects the switch.
3. Navigate to `#/map?pin=does-not-exist` → the map opens to its default with nothing selected (no error).
4. Reload while on `#/map?pin=<id>` → it re-selects and re-pans.

- [ ] **Step 9: Commit**

```bash
git add src/components/MapView.tsx src/routes/MapRoute.tsx
git commit -m "feat(map): focus a pin via #/map?pin= deep link"
```

---

## Task 3: "Location" block on the page (`PageRoute.tsx`)

**Files:**
- Modify: `src/routes/PageRoute.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `db.pins.where('pageId').equals(id)`, `db.maps.toArray()`, the existing `navigate` from `useNavigate()`.
- Produces: navigations to `/map?pin=<pinId>` (consumed by Task 2).

- [ ] **Step 1: Query the pins that link this page**

In `src/routes/PageRoute.tsx`, after the `knownTitles` live query (the block ending ~line 30), add:

```tsx
  // Pins that link to this page, with their map names — drives the "Location"
  // block. pageId is indexed, so the where() is cheap.
  const pinLocations = useLiveQuery(async () => {
    const linking = await db.pins.where('pageId').equals(id).toArray()
    if (linking.length === 0) return []
    const mapName = new Map((await db.maps.toArray()).map((m) => [m.id, m.name]))
    return linking.map((p) => ({
      pinId: p.id,
      label: p.label,
      mapName: mapName.get(p.mapId) ?? 'Map',
    }))
  }, [id]) ?? []
```

- [ ] **Step 2: Render the block in the page sidebar**

In `PageRoute.tsx`, inside `.page-aside`, insert the block **between** the infobox `?...:` expression and `<Backlinks pageId={id} />` (i.e. immediately before the `<Backlinks … />` line, ~line 244). It shows only in view mode and only when at least one pin links the page:

```tsx
          {!editing && pinLocations.length > 0 && (
            <div className="page-locations">
              <div className="page-locations-head">On the map</div>
              {pinLocations.map((loc) => (
                <button
                  key={loc.pinId}
                  className="ghost-btn location-row"
                  onClick={() => navigate(`/map?pin=${loc.pinId}`)}
                  title="Show this pin on the map"
                >
                  📍 {pinLocations.length > 1 ? `${loc.mapName} — ${loc.label || 'Pin'}` : 'Show on map'}
                </button>
              ))}
            </div>
          )}
```

- [ ] **Step 3: Add the "Location" block styling**

In `src/index.css`, near the page-aside / infobox rules (search for `.page-aside`), add:

```css
.page-locations { display: flex; flex-direction: column; gap: 4px; margin-top: 16px; }
.page-locations-head {
  font-family: var(--display); font-size: 13px; letter-spacing: 0.5px;
  color: var(--ink-dim); text-transform: uppercase; margin-bottom: 2px;
}
.location-row { text-align: left; justify-content: flex-start; }
```

- [ ] **Step 4: Verify type-check and lint**

Run: `npm run build && npm run lint`
Expected: build succeeds, lint clean.

- [ ] **Step 5: Manual check — Location block + end-to-end**

Run `npm run dev`.
1. On a page with **exactly one** linking pin → the sidebar shows an "On the map" block with a single "📍 Show on map" button; clicking it opens the map, selects the pin, opens the pin panel, and pans to it.
2. Link a second pin (on a different map) to the same page (via the map's pin panel "Linked page" dropdown). Reopen the page → the block now lists **two rows** with `Map name — Pin label`; each opens the correct map + pin.
3. A page with **no** linking pin → no "On the map" block.
4. A page that has a linking pin but **no infobox content** → the block still appears (it's not gated by the infobox).
5. Enter edit mode on the page → the block disappears (view-mode only).

- [ ] **Step 6: Commit**

```bash
git add src/routes/PageRoute.tsx src/index.css
git commit -m "feat(map): \"Show on map\" location block on pages"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:**
  - Part A hover previews (delegated bus, linked-only, drag/add-mode suppression) → Task 1.
  - Part B page side ("Location" block below infobox in `PageRoute`, single button vs per-map picker, 0-pin hidden) → Task 3.
  - Part B map side (`?pin=` via `useSearchParams`, switch `activeId`, select pin, `focusPinId` pan) → Task 2.
  - Edge cases (stale/deleted id no-op; empty-infobox still shows block; deleted page can't originate block) → Task 2 Step 5 / Task 3 Steps 1-2 & manual checks.
- **Placeholder scan:** no TBD/TODO; every code step shows full code; manual checks are concrete (including the console snippet to obtain a pin id).
- **Type consistency:** `focusPinId?: string | null` defined in Task 2 Step 1, destructured Step 2, consumed in the pan effect Step 3, and supplied by `MapRoute` Step 6 from `searchParams.get('pin')` (which returns `string | null`). `makeIcon(pin, style, selected)` signature (Task 1 Step 5) matches its single call site (Step 6). `pinLocations` shape `{ pinId, label, mapName }` defined and consumed within Task 3.
- **No schema change:** `pins.pageId` already indexed at v5 — confirmed against `src/db.ts` `stores()`.
- **Reuse honoured:** no second popover; `showPageHover` / `scheduleWikiHoverClose` / `WikiLinkPopover` reused as-is.
