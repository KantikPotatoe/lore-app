import { describe, it, expect } from 'vitest'
import type { Calendar, TimelineEvent } from '../db'
import { fitView } from './timelineHorizontalUtils'

function makeCalendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: 'cal-1',
    name: 'Test Reckoning',
    anchor: 0,
    months: [
      { name: 'Frostmoon', days: 10 },
      { name: 'Seedfall', days: 20 },
      { name: 'Highsun', days: 30 },
    ],
    weekdays: ['Sol', 'Lun', 'Ter', 'Mer', 'Jov', 'Ven', 'Sat'],
    eras: [
      { id: 'e1', name: 'First Age', startYear: 0 },
      { id: 'e2', name: 'Imperial Era', startYear: 100 },
    ],
    createdAt: 0,
    ...overrides,
  }
}

function makeEvent(startAbsolute: number, endAbsolute?: number): TimelineEvent {
  return {
    id: `ev-${startAbsolute}`,
    calendarId: 'cal-1',
    title: 'Event',
    description: '',
    category: '',
    pageId: null,
    startYear: 0, startMonth: 0, startDay: 1,
    startAbsolute,
    endAbsolute,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('fitView', () => {
  it('returns a safe default for no events', () => {
    expect(fitView([], 800, makeCalendar())).toEqual({ scale: 0.001, offsetAbs: 0 })
  })

  it('frames all events within the available width', () => {
    const events = [makeEvent(100), makeEvent(500, 700)]
    const width = 880 // usable = 880 - 80 = 800
    const { scale, offsetAbs } = fitView(events, width, makeCalendar())
    expect(scale).toBeGreaterThan(0)
    for (const e of events) {
      const startX = (e.startAbsolute - offsetAbs) * scale
      const endX = ((e.endAbsolute ?? e.startAbsolute) - offsetAbs) * scale
      expect(startX).toBeGreaterThanOrEqual(0)
      expect(endX).toBeLessThanOrEqual(width)
    }
  })

  it('handles a single event without a zero or infinite scale', () => {
    const { scale, offsetAbs } = fitView([makeEvent(1000)], 880, makeCalendar())
    expect(scale).toBeGreaterThan(0)
    expect(Number.isFinite(scale)).toBe(true)
    expect(Number.isFinite(offsetAbs)).toBe(true)
  })
})
