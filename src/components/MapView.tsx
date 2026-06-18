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
        const m = L.marker([pin.lat, pin.lng], { icon, draggable: !addMode }).addTo(lmap)
        marker = m
        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e) // don't also fire a map click
          cbRef.current.onPinClick(pin.id)
        })
        m.on('dragend', () => {
          const { lat, lng } = m.getLatLng()
          cbRef.current.onPinMove(pin.id, lat, lng)
        })
        existing.set(pin.id, m)
      }
      // Dragging is disabled while placing a new pin to avoid click/drag conflicts.
      if (marker.dragging) {
        if (addMode) {
          marker.dragging.disable()
        } else {
          marker.dragging.enable()
        }
      }
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
