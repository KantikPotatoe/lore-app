import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { WorldMap, MapPin } from '../db'
import { showPageHover, scheduleWikiHoverClose } from '../wikiLinkHover'

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

  // Latest pins / add-mode for the delegated hover handlers (attached once below).
  const pinsRef = useRef(pins)
  const addModeRef = useRef(addMode)
  // True between a pin's dragstart and dragend, to suppress hover previews.
  const draggingRef = useRef(false)
  useEffect(() => {
    pinsRef.current = pins
    addModeRef.current = addMode
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
      const icon = makeIcon(pin, style, selected)
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
        m.on('dragstart', () => {
          draggingRef.current = true
          scheduleWikiHoverClose()
        })
        m.on('dragend', () => {
          draggingRef.current = false
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
