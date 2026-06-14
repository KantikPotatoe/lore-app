import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { WorldMap, MapPin } from '../db'

interface Props {
  map: WorldMap
  pins: MapPin[]
  addMode: boolean
  selectedPinId: string | null
  onMapClick: (lat: number, lng: number) => void
  onPinClick: (pinId: string) => void
}

// We use a "Simple" coordinate system so the map is just the flat image, with
// pixel-based coordinates instead of real-world latitude/longitude.
export default function MapView({ map, pins, addMode, selectedPinId, onMapClick, onPinClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  // Keep latest callbacks in a ref so we can attach the click handler once.
  const cbRef = useRef({ onMapClick, onPinClick })
  useEffect(() => {
    cbRef.current = { onMapClick, onPinClick }
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

  // Sync markers with the pins array.
  useEffect(() => {
    const lmap = mapRef.current
    if (!lmap) return
    const existing = markersRef.current
    const seen = new Set<string>()

    for (const pin of pins) {
      seen.add(pin.id)
      const selected = pin.id === selectedPinId
      const icon = makeIcon(pin.label, selected)
      let marker = existing.get(pin.id)
      if (marker) {
        marker.setLatLng([pin.lat, pin.lng])
        marker.setIcon(icon)
      } else {
        marker = L.marker([pin.lat, pin.lng], { icon }).addTo(lmap)
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e) // don't also fire a map click
          cbRef.current.onPinClick(pin.id)
        })
        existing.set(pin.id, marker)
      }
    }

    // Remove markers whose pins were deleted.
    for (const [id, marker] of existing) {
      if (!seen.has(id)) {
        marker.remove()
        existing.delete(id)
      }
    }
  }, [pins, selectedPinId])

  return <div ref={containerRef} className="map-canvas" />
}

// A small teardrop pin rendered as an HTML element.
function makeIcon(label: string, selected: boolean): L.DivIcon {
  const safe = label.replace(/</g, '&lt;')
  return L.divIcon({
    className: 'pin-icon-wrap',
    html: `<div class="pin-icon${selected ? ' selected' : ''}"><span class="pin-dot"></span><span class="pin-label">${safe}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}
