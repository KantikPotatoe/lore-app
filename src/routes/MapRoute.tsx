import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addMap, addPin, deleteMap, type MapPin } from '../db'
import MapView from '../components/MapView'
import { compressImage } from '../imageUtils'

export default function MapRoute() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const maps = useLiveQuery(() => db.maps.orderBy('createdAt').toArray(), []) ?? []
  const [activeId, setActiveId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)

  // Default to the first map if none chosen yet.
  const currentMap = maps.find((m) => m.id === activeId) ?? maps[0] ?? null
  const mapId = currentMap?.id ?? ''

  const pins = useLiveQuery(
    () => (mapId ? db.pins.where('mapId').equals(mapId).toArray() : Promise.resolve([] as MapPin[])),
    [mapId],
  ) ?? []
  const allPages = useLiveQuery(() => db.pages.orderBy('title').toArray(), []) ?? []
  const selectedPin = pins.find((p) => p.id === selectedPinId) ?? null

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await compressImage(file, 4096)
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
        <select value={currentMap?.id} onChange={(e) => { setActiveId(e.target.value); setSelectedPinId(null) }}>
          {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button
          className={addMode ? 'primary-btn' : 'ghost-btn'}
          onClick={() => { setAddMode((v) => !v); setSelectedPinId(null) }}
        >
          {addMode ? '✓ Click the map to place…' : '📍 Add pin'}
        </button>
        <button className="ghost-btn" onClick={() => fileRef.current?.click()}>⭱ New map</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
        <button
          className="ghost-btn danger"
          onClick={async () => {
            if (!currentMap) return
            if (!confirm(`Delete "${currentMap.name}" and all its pins? This cannot be undone.`)) return
            setSelectedPinId(null)
            setActiveId(null)
            await deleteMap(currentMap.id)
          }}
        >
          Delete map
        </button>
        <span className="map-hint">{pins.length} pins</span>
      </div>

      <div className="map-body">
        {currentMap && (
          <MapView
            key={currentMap.id}
            map={currentMap}
            pins={pins}
            addMode={addMode}
            selectedPinId={selectedPinId}
            onMapClick={handleMapClick}
            onPinClick={setSelectedPinId}
          />
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
      </div>
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
