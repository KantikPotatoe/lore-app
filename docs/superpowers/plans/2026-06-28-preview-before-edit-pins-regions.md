# Preview-before-edit for pins/regions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a pin/region opens a read-only floating preview card anchored to it, with an explicit **Edit** button that opens the existing corner edit panel — instead of jumping straight into edit mode.

**Architecture:** A new presentational `MapPreviewCard` component (props in, callbacks out) renders the card; `MapRoute` owns a `panelMode: 'preview' | 'edit'` flag and builds the card node from already-loaded page data; `MapView` (which owns the Leaflet map) positions an overlay wrapper at the marker and tracks it on pan/zoom. The existing edit panel and hover popover are reused unchanged except for gating and a same-target hover skip.

**Tech Stack:** React 18 + TypeScript (strict), Leaflet, Dexie/`useLiveQuery`, Vitest + React Testing Library + happy-dom.

## Global Constraints

- TypeScript `strict` — no `any` leaks, no unused vars.
- Import shared API from the barrel: `import { … } from '../db'` (never deep paths).
- Reuse existing CSS classes where they exist (`.wiki-hover-popover`, `.popover-*`, `.tag-x`, `.mini-btn`); add only the few new classes named in this plan.
- Dev server port is pinned to 5174 — do not change it.
- Before claiming done: `npm run lint`, `npm run build`, `npm run test:run` must all pass (CI gate).
- PR label when opening the PR: **`version:minor`** (new feature).

---

### Task 1: `MapPreviewCard` presentational component + tests

**Files:**
- Create: `src/components/MapPreviewCard.tsx`
- Create: `src/components/MapPreviewCard.test.tsx`
- Modify: `src/index.css` (append new card classes near the `.wiki-hover-popover` block, ~line 1280)

**Interfaces:**
- Consumes: `LorePage` and `categoryColor` from `../db`.
- Produces:
  ```ts
  interface MapPreviewCardProps {
    label: string
    page: LorePage | null     // resolved linked page, or null if unlinked
    isPortal: boolean         // pin/region opens a child map
    onEdit: () => void
    onOpenPage?: () => void   // provided only when page != null
    onEnterMap?: () => void   // provided only when isPortal
    onClose: () => void
  }
  export default function MapPreviewCard(props: MapPreviewCardProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/components/MapPreviewCard.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import MapPreviewCard from './MapPreviewCard'
import type { LorePage } from '../db'

afterEach(cleanup)

const page: LorePage = {
  id: 'p1',
  title: 'Riverford',
  category: 'Place',
  content: '',
  summary: 'A trade town on the delta.',
  tags: [],
  status: 'draft',
  createdAt: 1,
  updatedAt: 1,
}

describe('MapPreviewCard', () => {
  it('renders the linked page preview: title, summary, category chip', () => {
    render(
      <MapPreviewCard label="Riverford pin" page={page} isPortal={false}
        onEdit={() => {}} onOpenPage={() => {}} onClose={() => {}} />,
    )
    expect(screen.getByText('Riverford')).toBeTruthy()
    expect(screen.getByText('A trade town on the delta.')).toBeTruthy()
    expect(screen.getByText('Place')).toBeTruthy()
    expect(screen.getByText('Riverford pin')).toBeTruthy()
  })

  it('shows an unlinked hint and no Open page button when page is null', () => {
    render(
      <MapPreviewCard label="Unknown spot" page={null} isPortal={false}
        onEdit={() => {}} onClose={() => {}} />,
    )
    expect(screen.getByText('Unknown spot')).toBeTruthy()
    expect(screen.getByText(/not linked/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /open page/i })).toBeNull()
  })

  it('always offers Edit and fires onEdit', () => {
    const onEdit = vi.fn()
    render(
      <MapPreviewCard label="x" page={null} isPortal={false}
        onEdit={onEdit} onClose={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('offers Open page only when linked and fires onOpenPage', () => {
    const onOpenPage = vi.fn()
    render(
      <MapPreviewCard label="x" page={page} isPortal={false}
        onEdit={() => {}} onOpenPage={onOpenPage} onClose={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /open page/i }))
    expect(onOpenPage).toHaveBeenCalledOnce()
  })

  it('offers Enter map only when a portal and fires onEnterMap', () => {
    const onEnterMap = vi.fn()
    const { rerender } = render(
      <MapPreviewCard label="x" page={null} isPortal={false}
        onEdit={() => {}} onClose={() => {}} />,
    )
    expect(screen.queryByRole('button', { name: /enter map/i })).toBeNull()
    rerender(
      <MapPreviewCard label="x" page={null} isPortal={true}
        onEdit={() => {}} onEnterMap={onEnterMap} onClose={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /enter map/i }))
    expect(onEnterMap).toHaveBeenCalledOnce()
  })

  it('fires onClose from the × button', () => {
    const onClose = vi.fn()
    render(
      <MapPreviewCard label="x" page={null} isPortal={false}
        onEdit={() => {}} onClose={onClose} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/components/MapPreviewCard.test.tsx`
Expected: FAIL — `Cannot find module './MapPreviewCard'` (file not created yet).

- [ ] **Step 3: Implement the component**

Create `src/components/MapPreviewCard.tsx`:

```tsx
import { categoryColor } from '../db'
import type { LorePage } from '../db'

interface MapPreviewCardProps {
  label: string
  page: LorePage | null
  isPortal: boolean
  onEdit: () => void
  onOpenPage?: () => void
  onEnterMap?: () => void
  onClose: () => void
}

/** Read-only preview shown when a pin/region is clicked, reusing the
 *  WikiLinkPopover visual pattern. Edit opens the full corner edit panel. */
export default function MapPreviewCard({
  label, page, isPortal, onEdit, onOpenPage, onEnterMap, onClose,
}: MapPreviewCardProps) {
  return (
    <div className="wiki-hover-popover map-preview-card" role="dialog" aria-label="Marker preview">
      {page?.infobox?.image && <img className="popover-image" src={page.infobox.image} alt="" />}
      <div className="popover-body">
        <div className="map-preview-head">
          <span className="map-preview-label">{label}</span>
          <button className="tag-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {page ? (
          <>
            <div className="popover-header">
              <span className="popover-chip" style={{ background: categoryColor(page.category) }}>
                {page.category}
              </span>
            </div>
            <div className="popover-title">{page.title}</div>
            {page.summary && <div className="popover-summary">{page.summary}</div>}
          </>
        ) : (
          <div className="popover-broken">Not linked to a page</div>
        )}
        <div className="map-preview-actions">
          <button className="mini-btn" onClick={onEdit}>✎ Edit</button>
          {page && onOpenPage && (
            <button className="mini-btn" onClick={onOpenPage}>Open page →</button>
          )}
          {isPortal && onEnterMap && (
            <button className="mini-btn" onClick={onEnterMap}>Enter map →</button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the CSS**

Append to `src/index.css` immediately after the `.popover-loading` rule (the end of the popover block, ~line 1280):

```css
/* ── Map preview card (click-to-preview) ─────────────────────────────── */
.map-preview-anchor { position: absolute; left: 0; top: 0; z-index: 1000; pointer-events: none; }
.map-preview-card {
  position: absolute; transform: translate(-50%, calc(-100% - 14px)); pointer-events: auto;
}
.map-preview-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.map-preview-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-faint); }
.map-preview-actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/MapPreviewCard.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/MapPreviewCard.tsx src/components/MapPreviewCard.test.tsx src/index.css
git commit -m "feat: add MapPreviewCard for click-to-preview pins/regions (#91)"
```

---

### Task 2: `MapView` — position the card + track on pan/zoom + hover skip + background-click dismiss

**Files:**
- Modify: `src/components/MapView.tsx`

**Interfaces:**
- Consumes: nothing new from Task 1 (card node arrives as an opaque `React.ReactNode`).
- Produces (new `Props` fields consumed by Task 3):
  ```ts
  previewTarget?: { kind: 'pin' | 'region'; id: string } | null
  previewCard?: React.ReactNode
  // selectedPinId / selectedRegionId already exist on Props.
  ```

> No unit test: `MapView` drives Leaflet and needs a real DOM, so it is untested in this repo (no existing `MapView`/`MapRoute` tests). Verify via `npm run build` + manual check in Task 4's manual-verify step.

- [ ] **Step 1: Add the two new props to the `Props` interface**

In `src/components/MapView.tsx`, add to `interface Props` (after `focusTarget?: FocusTarget | null`):

```ts
  previewTarget?: { kind: 'pin' | 'region'; id: string } | null
  previewCard?: React.ReactNode
```

And destructure them in the component signature (add to the existing destructure list):

```ts
  focusTarget,
  previewTarget, previewCard,
}: Props) {
```

- [ ] **Step 2: Add refs for the overlay and the current selection**

Below `const draggingRef = useRef(false)` add:

```ts
  // Overlay wrapper that holds the preview card, positioned over the marker.
  const overlayRef = useRef<HTMLDivElement>(null)
  // Latest selection ids, read by the delegated hover handler to skip the
  // marker whose preview card is already open (avoids a double card).
  const selectedPinIdRef = useRef(selectedPinId)
  const selectedRegionIdRef = useRef(selectedRegionId)
```

Then extend the existing ref-sync effect (the one that sets `pinsRef.current = pins` etc.) to also keep these current:

```ts
  useEffect(() => {
    pinsRef.current = pins
    addModeRef.current = addMode
    regionsRef.current = regions
    drawModeRef.current = drawMode
    selectedPinIdRef.current = selectedPinId
    selectedRegionIdRef.current = selectedRegionId
  })
```

- [ ] **Step 3: Skip hover for the already-selected marker**

In the delegated pin-hover effect, in the `over` function, after resolving `pin`, add the skip (so the card+hover don't stack on the same pin):

```ts
    function over(e: MouseEvent) {
      if (addModeRef.current || draggingRef.current) return
      const icon = (e.target as HTMLElement).closest('.pin-icon[data-pin-id]') as HTMLElement | null
      if (!icon) return
      if (icon.dataset.pinId === selectedPinIdRef.current) return
      const pin = pinsRef.current.find((p) => p.id === icon.dataset.pinId)
      if (!pin?.pageId) return
      showPageHover(pin.pageId, pin.label, icon.getBoundingClientRect())
    }
```

In the polygon `mouseover` handler (inside the regions sync effect, the `p.on('mouseover', …)` block) add the matching region skip as the first line:

```ts
        p.on('mouseover', () => {
          if (drawModeRef.current || editingRef.current) return
          if (region.id === selectedRegionIdRef.current) return
          const r = regionsRef.current.find((x) => x.id === region.id)
          if (!r?.pageId) return
          const el = p.getElement() as HTMLElement | null
          if (el) showPageHover(r.pageId, r.label, el.getBoundingClientRect())
        })
```

- [ ] **Step 4: Position + track the overlay**

Add this effect after the `focusTarget` centring effect (near the end, before `return`):

```ts
  // Position the preview overlay over its marker and keep it there as the map
  // pans/zooms. Coordinates are container points; the overlay is a sibling of
  // the map canvas inside the position:relative .map-body, so they align.
  useEffect(() => {
    const lmap = mapRef.current
    const el = overlayRef.current
    if (!lmap || !el || !previewTarget) return
    const update = () => {
      let latlng: L.LatLng | null = null
      if (previewTarget.kind === 'pin') {
        const pin = pinsRef.current.find((p) => p.id === previewTarget.id)
        if (pin) latlng = L.latLng(pin.lat, pin.lng)
      } else {
        const poly = polygonsRef.current.get(previewTarget.id)
        if (poly) latlng = poly.getBounds().getCenter()
      }
      if (!latlng) return
      const pt = lmap.latLngToContainerPoint(latlng)
      el.style.left = `${pt.x}px`
      el.style.top = `${pt.y}px`
    }
    update()
    lmap.on('move zoom zoomanim resize', update)
    return () => { lmap.off('move zoom zoomanim resize', update) }
  }, [previewTarget, pins, regions])
```

- [ ] **Step 5: Render the overlay alongside the canvas**

Change the component's return from:

```tsx
  return <div ref={containerRef} className="map-canvas" />
```

to:

```tsx
  return (
    <>
      <div ref={containerRef} className="map-canvas" />
      {previewCard && (
        <div ref={overlayRef} className="map-preview-anchor">{previewCard}</div>
      )}
    </>
  )
```

- [ ] **Step 6: Type-check the changes**

Run: `npm run build`
Expected: PASS (tsc clean, vite build succeeds). If `React.ReactNode` is unresolved, ensure `react` types are in scope (they already are via existing imports — no new import needed; `React.ReactNode` resolves from the global JSX types).

- [ ] **Step 7: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "feat: position + track preview overlay in MapView, skip hover on selected marker (#91)"
```

---

### Task 3: `MapRoute` — `panelMode`, build the card node, gate the edit panel, Esc ladder, background-click dismiss

**Files:**
- Modify: `src/routes/MapRoute.tsx`

**Interfaces:**
- Consumes: `MapPreviewCard` (Task 1) and the new `MapView` props `previewTarget` / `previewCard` (Task 2).
- Produces: end-to-end behaviour; no new exports.

> No unit test (Leaflet-driven route, untested in this repo). Verify via `npm run build` + the manual checklist in Step 9.

- [ ] **Step 1: Import the card**

Add to the imports at the top of `src/routes/MapRoute.tsx`:

```ts
import MapPreviewCard from '../components/MapPreviewCard'
```

- [ ] **Step 2: Add the `panelMode` state**

After `const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)` add:

```ts
  // Click selects + previews; the preview's Edit button flips to the edit panel.
  const [panelMode, setPanelMode] = useState<'preview' | 'edit'>('preview')
```

- [ ] **Step 3: Reset mode to preview on map switch and on focus**

In `switchToMap`, add `setPanelMode('preview')` (alongside the other resets):

```ts
  function switchToMap(id: string) {
    setActiveId(id)
    setSelectedPinId(null)
    setSelectedRegionId(null)
    setAddMode(false)
    setDrawMode(false)
    setHiddenTypes(new Set())
    setFindQuery('')
    setShowFind(false)
    setFocusTarget(null)
    setPanelMode('preview')
  }
```

In `focusPin` and `focusRegion`, add `setPanelMode('preview')`:

```ts
  function focusPin(id: string) {
    setSelectedPinId(id)
    setSelectedRegionId(null)
    setPanelMode('preview')
    setFocusTarget((t) => ({ kind: 'pin', id, nonce: (t?.nonce ?? 0) + 1 }))
  }
  function focusRegion(id: string) {
    setSelectedRegionId(id)
    setSelectedPinId(null)
    setPanelMode('preview')
    setFocusTarget((t) => ({ kind: 'region', id, nonce: (t?.nonce ?? 0) + 1 }))
  }
```

- [ ] **Step 4: Extend the Esc ladder**

Replace the `useEscapeKey` block with the edit→preview rung added first among the selection rungs:

```ts
  useEscapeKey(() => {
    if (showFind) { setShowFind(false); setFindQuery('') }
    else if ((selectedPinId || selectedRegionId) && panelMode === 'edit') setPanelMode('preview')
    else if (selectedPinId) setSelectedPinId(null)
    else if (selectedRegionId) setSelectedRegionId(null)
    else if (addMode) setAddMode(false)
    else if (drawMode) setDrawMode(false)
  }, !confirmDeleteMap)
```

- [ ] **Step 5: Dismiss the card on a background map click; set preview mode after creating a pin/region**

Replace `handleMapClick`:

```ts
  async function handleMapClick(lat: number, lng: number) {
    if (addMode && currentMap) {
      const id = await addPin(currentMap.id, lat, lng)
      setSelectedPinId(id)
      setPanelMode('preview')
      setAddMode(false)
      return
    }
    // Idle background click closes any open preview/edit panel. (Draw mode feeds
    // the drawer, so leave selection alone there.)
    if (drawMode) return
    setSelectedPinId(null)
    setSelectedRegionId(null)
  }
```

In `handleRegionCreate`, add `setPanelMode('preview')`:

```ts
  async function handleRegionCreate(points: [number, number][]) {
    if (!currentMap) return
    const id = await addRegion(currentMap.id, points)
    setDrawMode(false)
    setSelectedPinId(null)
    setSelectedRegionId(id)
    setPanelMode('preview')
  }
```

- [ ] **Step 6: Build the preview target + card node**

After the `selectedPin` / `selectedRegion` derivations (the two `const selectedPin = …` / `const selectedRegion = …` lines, ~line 209), add:

```ts
  // What MapView should anchor the overlay to (stable while the selection holds).
  const previewTarget = useMemo<{ kind: 'pin' | 'region'; id: string } | null>(() => {
    if (panelMode !== 'preview') return null
    if (selectedPinId && selectedPin) return { kind: 'pin', id: selectedPinId }
    if (selectedRegionId && selectedRegion) return { kind: 'region', id: selectedRegionId }
    return null
  }, [panelMode, selectedPinId, selectedRegionId, selectedPin, selectedRegion])

  // The card React node, built from already-loaded page data (no new query).
  const previewItem = selectedPin ?? selectedRegion
  const previewCard = panelMode === 'preview' && previewItem ? (() => {
    const page = previewItem.pageId ? pagesById.get(previewItem.pageId) ?? null : null
    const isPortal = !!previewItem.childMapId && mapsById.has(previewItem.childMapId)
    return (
      <MapPreviewCard
        label={previewItem.label}
        page={page}
        isPortal={isPortal}
        onEdit={() => setPanelMode('edit')}
        onOpenPage={previewItem.pageId ? () => navigate(`/page/${previewItem.pageId}`) : undefined}
        onEnterMap={isPortal ? () => switchToMap(previewItem.childMapId!) : undefined}
        onClose={() => { setSelectedPinId(null); setSelectedRegionId(null) }}
      />
    )
  })() : null
```

> Note: `pagesById` is the full page map (`new Map(allPages.map(...))`), not filtered by category, so linked pages always resolve. `previewItem` is `MapPin | MapRegion`; both carry `label`, `pageId`, and `childMapId`.

- [ ] **Step 7: Set preview mode on pin/region click and pass the new props to `MapView`**

Update the `MapView` element's click handlers and add the two new props:

```tsx
          <MapView
            key={currentMap.id}
            map={currentMap}
            pins={visiblePins}
            styles={pinStyles}
            addMode={addMode}
            selectedPinId={selectedPinId}
            onMapClick={handleMapClick}
            onPinClick={(id) => { setSelectedPinId(id); setSelectedRegionId(null); setPanelMode('preview') }}
            onPinMove={(id, lat, lng) => db.pins.update(id, { lat, lng })}
            focusPinId={focusPinId}
            regions={visibleRegions}
            regionStyles={regionFills}
            selectedRegionId={selectedRegionId}
            drawMode={drawMode}
            onRegionClick={(id) => { setSelectedRegionId(id); setSelectedPinId(null); setPanelMode('preview') }}
            onRegionCreate={handleRegionCreate}
            onRegionEdit={(id, points) => db.regions.update(id, { points })}
            focusTarget={focusTarget}
            previewTarget={previewTarget}
            previewCard={previewCard}
          />
```

- [ ] **Step 8: Gate the corner edit panels behind edit mode**

Change the two panel render guards. For the pin panel, change:

```tsx
        {selectedPin && (
          <div className="pin-panel">
```

to:

```tsx
        {selectedPin && panelMode === 'edit' && (
          <div className="pin-panel">
```

For the region panel, change:

```tsx
        {selectedRegion && (
          <div className="pin-panel">
```

to:

```tsx
        {selectedRegion && panelMode === 'edit' && (
          <div className="pin-panel">
```

- [ ] **Step 9: Build, lint, and manually verify**

Run: `npm run build && npm run lint`
Expected: both PASS.

Then `npm run dev` and verify in the browser (http://localhost:5174, `#/map`):
1. Click a **linked** pin → floating card shows chip + title + summary (+ image if any) above the pin; no edit panel.
2. Click **Edit** on the card → corner edit panel opens; card disappears.
3. **Esc** from the edit panel → returns to the preview card; **Esc** again → deselects (card gone).
4. Pan/zoom with the card open → card stays anchored to the pin.
5. Click an **unlinked** pin → card shows the label + "Not linked to a page" + Edit only.
6. Click a **portal** pin/region → card shows **Enter map →**; it drills in.
7. Click empty map → card closes. Click a **region** → card centred on the region.
8. Hover a *different* pin while a card is open → hover popover still appears; hovering the selected pin shows no second card.

- [ ] **Step 10: Commit**

```bash
git add src/routes/MapRoute.tsx
git commit -m "feat: gate pin/region edit behind a click preview card (#91)"
```

---

### Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full CI gate**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all PASS (lint clean, build clean, all tests green including the 6 new `MapPreviewCard` tests).

- [ ] **Step 2: Confirm the manual checklist from Task 3 Step 9 still holds** (spot-check after the full build).

- [ ] **Step 3: (When opening the PR)** apply the **`version:minor`** label, per CLAUDE.md.

---

## Self-Review notes

- **Spec coverage:** §1 state model → Task 3 (panelMode, resets, Esc); §2 anchoring/tracking → Task 2 (overlay effect, fragment render); §3 card component → Task 1; §4 hover coexistence → Task 2 Step 3 (pin + region skip); §5 edit panel gating → Task 3 Step 8; testing → Task 1 tests + Task 4. All covered.
- **Type consistency:** `previewTarget: { kind: 'pin' | 'region'; id: string } | null` and `previewCard: React.ReactNode` are identical in Task 2's `Props` and Task 3's `MapView` usage. `MapPreviewCardProps` matches between Task 1's definition and Task 3's usage (optional `onOpenPage`/`onEnterMap` passed only when applicable).
- **No placeholders:** every code step contains complete code.
- **Out of scope (per spec):** inline field editing on the card, card edge-flip/clamping near viewport edges (basic above-the-pin placement only), and any rework of the corner edit panel or hover popover content.
