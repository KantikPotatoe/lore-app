import { useEffect, useRef, useState } from 'react'
import { dateToAbsolute, yearLength, eraForYear } from '../calendar'
import type { Calendar, TimelineEvent, LorePage, CalendarEra } from '../db'

interface Props {
  events: TimelineEvent[]
  calendars: Calendar[]
  displayCalendar: Calendar | null
  allPages: LorePage[]
  onEdit: (event: TimelineEvent) => void
}

const LANE_H = 30
const HEADER_H = 48
const LANE_GAP = 4

function textColor(hex: string | undefined): string {
  if (!hex) return 'rgba(0,0,0,0.75)'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return r * 0.299 + g * 0.587 + b * 0.114 < 128
    ? 'rgba(255,255,255,0.85)'
    : 'rgba(0,0,0,0.75)'
}

export default function TimelineHorizontal({
  events, calendars, displayCalendar, allPages, onEdit,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.001)
  const [offsetAbs, setOffsetAbs] = useState(0)
  const [ready, setReady] = useState(false)

  const displayCal = displayCalendar ?? calendars[0]

  useEffect(() => {
    if (!events.length || !containerRef.current || ready) return
    const minAbs = Math.min(...events.map((e) => e.startAbsolute))
    const maxAbs = Math.max(...events.map((e) => e.endAbsolute ?? e.startAbsolute))
    const range = Math.max(maxAbs - minAbs, displayCal ? yearLength(displayCal) * 10 : 3650)
    const w = Math.max(containerRef.current.clientWidth - 80, 200)
    setScale(w / range)
    setOffsetAbs(minAbs - range * 0.05)
    setReady(true)
  }, [events.length, ready, displayCal])

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.2 : 0.833
    const rect = containerRef.current?.getBoundingClientRect()
    const cursorX = rect ? e.clientX - rect.left : 0
    const cursorAbs = offsetAbs + cursorX / scale
    setScale((s) => {
      const ns = Math.max(1e-6, Math.min(1, s * factor))
      setOffsetAbs(cursorAbs - cursorX / ns)
      return ns
    })
  }

  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null)
  function handlePointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('.horiz-event')) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startOffset: offsetAbs }
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    setOffsetAbs(dragRef.current.startOffset - dx / scale)
  }
  function handlePointerUp() { dragRef.current = null }

  const laid: { event: TimelineEvent; lane: number; x: number; w: number }[] = []
  const laneEnds: number[] = []
  for (const event of events) {
    const x = (event.startAbsolute - offsetAbs) * scale
    const endAbs = event.endAbsolute ?? event.startAbsolute
    const w = Math.max(8, (endAbs - event.startAbsolute) * scale)
    let lane = laneEnds.findIndex((end) => end <= x - 2)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0) }
    laneEnds[lane] = x + w
    laid.push({ event, lane, x, w })
  }
  const numLanes = Math.max(1, laneEnds.length)
  const totalH = HEADER_H + numLanes * (LANE_H + LANE_GAP)

  type EraRect = { era: CalendarEra; x: number; w: number }
  const eraBands: EraRect[] = []
  if (displayCal?.eras.length) {
    const sorted = [...displayCal.eras].sort((a, b) => a.startYear - b.startYear)
    const yl = yearLength(displayCal)
    sorted.forEach((era, i) => {
      const startAbs = dateToAbsolute(displayCal, era.startYear, 0, 1)
      const endAbs = sorted[i + 1]
        ? dateToAbsolute(displayCal, sorted[i + 1].startYear, 0, 1)
        : startAbs + yl * 999
      const bx = (startAbs - offsetAbs) * scale
      const bw = (endAbs - startAbs) * scale
      if (bx + bw > 0) eraBands.push({ era, x: bx, w: bw })
    })
  }

  const eraStartYears = new Set(displayCal?.eras.map((e) => e.startYear) ?? [])

  const tickYears: { abs: number; label: string; major: boolean }[] = []
  if (displayCal && scale > 0) {
    const yl = yearLength(displayCal)
    if (yl > 0) {
      const pxPerYear = yl * scale
      const step = pxPerYear < 10 ? Math.ceil(10 / pxPerYear) * 10 : 1
      const viewWidth = containerRef.current?.clientWidth ?? 800
      const startYear = Math.floor((offsetAbs - displayCal.anchor) / yl) - 1
      const endYear = Math.ceil((offsetAbs + viewWidth / scale - displayCal.anchor) / yl) + 1
      for (let yr = Math.ceil(startYear / step) * step; yr <= endYear; yr += step) {
        const abs = dateToAbsolute(displayCal, yr, 0, 1)
        const x = (abs - offsetAbs) * scale
        if (x >= 0 && x <= viewWidth) {
          const eraName = eraForYear(displayCal, yr)?.name
          tickYears.push({
            abs,
            label: `Year ${yr}${eraName ? ` (${eraName})` : ''}`,
            major: eraStartYears.has(yr),
          })
        }
      }
    }
  }

  const pageById = new Map(allPages.map((p) => [p.id, p]))

  return (
    <div
      ref={containerRef}
      className="tl-horiz"
      style={{ height: totalH }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {eraBands.map(({ era, x, w }) => (
        <div
          key={era.id}
          className="horiz-era-band"
          style={{
            left: x, width: w, height: totalH,
            background: era.color
              ? `linear-gradient(to right, ${era.color}06, ${era.color}14, ${era.color}06)`
              : 'transparent',
          }}
        >
          <span className="horiz-era-label">{era.name}</span>
        </div>
      ))}

      {Array.from({ length: numLanes }, (_, i) => (
        <div
          key={`lane-${i}`}
          className={i % 2 === 1 ? 'horiz-lane-strip horiz-lane-strip-alt' : 'horiz-lane-strip'}
          style={{ top: HEADER_H + i * (LANE_H + LANE_GAP), height: LANE_H + LANE_GAP }}
        />
      ))}

      <div className="horiz-header" style={{ height: HEADER_H }}>
        {tickYears.map(({ abs, label, major }) => (
          <div
            key={abs}
            className={major ? 'horiz-tick horiz-tick-major' : 'horiz-tick'}
            style={{ left: (abs - offsetAbs) * scale }}
          >
            <span className={major ? 'horiz-tick-label horiz-tick-label-major' : 'horiz-tick-label'}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {laid.map(({ event, lane, x, w }) => {
        const accent = event.color ?? '#c9a24b'
        const top = HEADER_H + lane * (LANE_H + LANE_GAP)
        const linkedPage = event.pageId ? pageById.get(event.pageId) : undefined
        const glow = event.color
          ? `0 0 14px ${event.color}${parseInt(event.color.slice(1, 3), 16) * 0.299 + parseInt(event.color.slice(3, 5), 16) * 0.587 + parseInt(event.color.slice(5, 7), 16) * 0.114 < 128 ? '55' : '33'}`
          : 'none'
        return (
          <div
            key={event.id}
            className="horiz-event"
            style={{
              left: x, top, width: w, height: LANE_H,
              background: accent, position: 'absolute',
              color: textColor(event.color),
              boxShadow: glow,
            }}
            title={linkedPage ? `${event.title} → ${linkedPage.title}` : event.title}
            onClick={() => onEdit(event)}
          >
            {w > 40 && event.icon && (
              <span className="horiz-event-icon">{event.icon}</span>
            )}
            {w > 50 && (
              <span className="horiz-event-label">{event.title}</span>
            )}
          </div>
        )
      })}

      <div className="horiz-hint">Scroll to zoom · drag to pan</div>
    </div>
  )
}
