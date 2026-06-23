import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, addMap, addPin, addRegion, deleteMap, pinType, regionStyle,
  TYPE_COLORS, type MapPin, type MapRegion, type InfoboxTemplate,
} from '../db'
import MapView, { type PinMarkerStyle } from '../components/MapView'
import ConfirmDialog from '../components/ConfirmDialog'
import { compressImage } from '../imageUtils'

export default function MapRoute() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const maps = useLiveQuery(() => db.maps.orderBy('createdAt').toArray(), []) ?? []
  const [activeId, setActiveId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [confirmDeleteMap, setConfirmDeleteMap] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)

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

  // Default to the first map if none chosen yet.
  const currentMap = maps.find((m) => m.id === activeId) ?? maps[0] ?? null
  const mapId = currentMap?.id ?? ''

  const pinsData = useLiveQuery(
    () => (mapId ? db.pins.where('mapId').equals(mapId).toArray() : Promise.resolve([] as MapPin[])),
    [mapId],
  )
  const allPagesData = useLiveQuery(() => db.pages.orderBy('title').toArray(), [])
  const templatesData = useLiveQuery(() => db.templates.toArray(), [])
  // Stable empty-array fallbacks so downstream useMemo deps don't change every render.
  const regionsData = useLiveQuery(
    () => (mapId ? db.regions.where('mapId').equals(mapId).toArray() : Promise.resolve([] as MapRegion[])),
    [mapId],
  )
  const regions = useMemo(() => regionsData ?? [], [regionsData])
  const pins = useMemo(() => pinsData ?? [], [pinsData])
  const allPages = useMemo(() => allPagesData ?? [], [allPagesData])
  const templates = useMemo(() => templatesData ?? [], [templatesData])
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

  // Resolve every region's fill + derived type once.
  const regionStyles = useMemo(
    () => new Map(regions.map((r) => [r.id, regionStyle(r, pagesById, templatesByName)])),
    [regions, pagesById, templatesByName],
  )

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

  // Pins passed to the map, minus any whose type is hidden.
  const visiblePins = useMemo(
    () => pins.filter((p) => !hiddenTypes.has(pinTypes.get(p.id)?.name ?? '')),
    [pins, pinTypes, hiddenTypes],
  )

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

  // Marker styles keyed by pin id (only what MapView needs).
  const pinStyles = useMemo(() => {
    const m = new Map<string, PinMarkerStyle>()
    for (const [id, t] of pinTypes) m.set(id, { color: t.color, icon: t.icon })
    return m
  }, [pinTypes])

  function toggleType(key: string) {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Read from visiblePins so the pin panel closes when its type is filtered out.
  const selectedPin = visiblePins.find((p) => p.id === selectedPinId) ?? null
  const selectedRegion = visibleRegions.find((r) => r.id === selectedRegionId) ?? null

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await compressImage(file, 8192, 0.92)
    const { width, height } = await imageSize(dataUrl)
    const name = file.name.replace(/\.[^.]+$/, '')
    const id = await addMap(name, dataUrl, width, height)
    setActiveId(id)
    e.target.value = ''
  }

  async function handleMapClick(lat: number, lng: number) {
    if (!addMode || !currentMap) return
    const id = await addPin(currentMap.id, lat, lng)
    setSelectedPinId(id)
    setAddMode(false)
  }

  async function handleRegionCreate(points: [number, number][]) {
    if (!currentMap) return
    const id = await addRegion(currentMap.id, points)
    setDrawMode(false)
    setSelectedPinId(null)
    setSelectedRegionId(id)
  }

  // ---- No maps yet -------------------------------------------------------
  if (maps.length === 0) {
    return (
      <div className="map-empty">
        <h1>Maps</h1>
        <p className="muted">Upload an image of your world (PNG or JPG) to start dropping pins.</p>
        <button className="primary-btn" onClick={() => fileRef.current?.click()}>⭱ Upload a map image</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
      </div>
    )
  }

  return (
    <div className="map-page">
      <div className="map-toolbar">
        <select value={currentMap?.id} onChange={(e) => {
          setActiveId(e.target.value)
          setSelectedPinId(null)
          setSelectedRegionId(null)
          setDrawMode(false)
          setHiddenTypes(new Set())
        }}>
          {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
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
        <button className="ghost-btn" onClick={() => fileRef.current?.click()}>⭱ New map</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
        <button
          className="ghost-btn danger"
          onClick={() => currentMap && setConfirmDeleteMap(true)}
        >
          Delete map
        </button>
        <span className="map-hint">{pins.length} pins · {regions.length} regions</span>
      </div>

      <div className="map-body">
        {currentMap && (
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

        {selectedPin && (
          <div className="pin-panel">
            <div className="pin-panel-head">
              <h3>Pin</h3>
              <button className="tag-x" onClick={() => setSelectedPinId(null)}>×</button>
            </div>
            <label>Label</label>
            <input
              value={selectedPin.label}
              onChange={(e) => db.pins.update(selectedPin.id, { label: e.target.value })}
            />
            <label>Linked page</label>
            <select
              value={selectedPin.pageId ?? ''}
              onChange={(e) => db.pins.update(selectedPin.id, { pageId: e.target.value || null })}
            >
              <option value="">— none —</option>
              {allPages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <div className="pin-panel-actions">
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
          </div>
        )}

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
      </div>

      <ConfirmDialog
        open={confirmDeleteMap}
        title="Delete map?"
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          setConfirmDeleteMap(false)
          if (!currentMap) return
          setSelectedPinId(null)
          setActiveId(null)
          await deleteMap(currentMap.id)
        }}
        onCancel={() => setConfirmDeleteMap(false)}
      >
        Delete “{currentMap?.name}” and all its pins? This cannot be undone.
      </ConfirmDialog>
    </div>
  )
}

function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = src
  })
}
