import { describe, it, expect } from 'vitest'
import type { Calendar } from './db'
import {
  yearLength,
  dateToAbsolute,
  absoluteToDate,
  eraForYear,
  formatDate,
} from './calendar'

// A calendar with three uneven months (10 + 20 + 30 = 60-day year), a 7-day
// week, and two eras. anchor 0 means year 0 / month 0 / day 1 == absolute 0.
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

describe('yearLength', () => {
  it('sums all month lengths', () => {
    expect(yearLength(makeCalendar())).toBe(60)
  })

  it('is 0 for a calendar with no months', () => {
    expect(yearLength(makeCalendar({ months: [] }))).toBe(0)
  })
})

describe('dateToAbsolute', () => {
  it('maps year 0 / month 0 / day 1 to the anchor', () => {
    expect(dateToAbsolute(makeCalendar(), 0, 0, 1)).toBe(0)
    expect(dateToAbsolute(makeCalendar({ anchor: 1000 }), 0, 0, 1)).toBe(1000)
  })

  it('counts days within the first month (1-based day)', () => {
    expect(dateToAbsolute(makeCalendar(), 0, 0, 10)).toBe(9)
  })

  it('skips elapsed months when computing later months', () => {
    // month 1 starts after month 0's 10 days
    expect(dateToAbsolute(makeCalendar(), 0, 1, 1)).toBe(10)
    // month 2 starts after 10 + 20 days
    expect(dateToAbsolute(makeCalendar(), 0, 2, 1)).toBe(30)
  })

  it('advances by a full year length per year', () => {
    expect(dateToAbsolute(makeCalendar(), 1, 0, 1)).toBe(60)
    expect(dateToAbsolute(makeCalendar(), -1, 0, 1)).toBe(-60)
  })
})

describe('absoluteToDate', () => {
  it('inverts dateToAbsolute at the anchor', () => {
    expect(absoluteToDate(makeCalendar(), 0)).toMatchObject({ year: 0, month: 0, day: 1 })
  })

  it('handles the last day of a year', () => {
    // day 60 of year 0 is the 30th of month index 2, abs = 59
    expect(absoluteToDate(makeCalendar(), 59)).toMatchObject({ year: 0, month: 2, day: 30 })
    // the next day rolls into year 1
    expect(absoluteToDate(makeCalendar(), 60)).toMatchObject({ year: 1, month: 0, day: 1 })
  })

  it('handles negative years via floor division', () => {
    // one day before the anchor is the last day of year -1
    expect(absoluteToDate(makeCalendar(), -1)).toMatchObject({ year: -1, month: 2, day: 30 })
  })

  it('returns a safe default when the calendar has no months', () => {
    expect(absoluteToDate(makeCalendar({ months: [] }), 42)).toEqual({
      year: 0,
      month: 0,
      day: 1,
      weekdayIndex: 0,
    })
  })

  it('computes weekdayIndex, wrapping correctly for negatives', () => {
    expect(absoluteToDate(makeCalendar(), 0).weekdayIndex).toBe(0)
    expect(absoluteToDate(makeCalendar(), 8).weekdayIndex).toBe(1) // 8 % 7
    expect(absoluteToDate(makeCalendar(), -1).weekdayIndex).toBe(6) // wraps, never negative
  })

  it('reports weekdayIndex 0 when there are no weekdays', () => {
    expect(absoluteToDate(makeCalendar({ weekdays: [] }), 5).weekdayIndex).toBe(0)
  })
})

describe('round-trip: absoluteToDate ∘ dateToAbsolute is identity', () => {
  it('holds across a wide range including negatives and a nonzero anchor', () => {
    const cal = makeCalendar({ anchor: 37 })
    for (let abs = -300; abs <= 300; abs++) {
      const d = absoluteToDate(cal, abs)
      expect(dateToAbsolute(cal, d.year, d.month, d.day)).toBe(abs)
    }
  })
})

describe('eraForYear', () => {
  it('returns null when there are no eras', () => {
    expect(eraForYear(makeCalendar({ eras: [] }), 5)).toBeNull()
  })

  it('returns null for a year before the earliest era', () => {
    expect(eraForYear(makeCalendar(), -5)).toBeNull()
  })

  it('selects the greatest startYear ≤ year (inclusive boundary)', () => {
    expect(eraForYear(makeCalendar(), 0)?.name).toBe('First Age')
    expect(eraForYear(makeCalendar(), 99)?.name).toBe('First Age')
    expect(eraForYear(makeCalendar(), 100)?.name).toBe('Imperial Era')
    expect(eraForYear(makeCalendar(), 500)?.name).toBe('Imperial Era')
  })

  it('sorts unsorted era input before choosing', () => {
    const cal = makeCalendar({
      eras: [
        { id: 'e2', name: 'Imperial Era', startYear: 100 },
        { id: 'e1', name: 'First Age', startYear: 0 },
      ],
    })
    expect(eraForYear(cal, 150)?.name).toBe('Imperial Era')
    expect(eraForYear(cal, 50)?.name).toBe('First Age')
  })
})

describe('formatDate', () => {
  it('renders day, month name, year, and era by default', () => {
    expect(formatDate(makeCalendar(), 412, 1, 9)).toBe(
      '9th of Seedfall, Year 412 (Imperial Era)',
    )
  })

  it('omits the era when showEra is false', () => {
    expect(formatDate(makeCalendar(), 412, 1, 9, { showEra: false })).toBe(
      '9th of Seedfall, Year 412',
    )
  })

  it('renders year only when requested', () => {
    expect(formatDate(makeCalendar(), 412, 1, 9, { yearOnly: true })).toBe(
      'Year 412 (Imperial Era)',
    )
  })

  it('prepends the weekday when requested', () => {
    // abs for year 0, month 0, day 1 is 0 -> weekday index 0 -> 'Sol'
    expect(formatDate(makeCalendar(), 0, 0, 1, { showWeekday: true })).toBe(
      'Sol 1st of Frostmoon, Year 0 (First Age)',
    )
  })

  it('falls back to a numbered month name when month is out of range', () => {
    expect(formatDate(makeCalendar(), 5, 9, 1, { showEra: false })).toBe(
      '1st of Month 10, Year 5',
    )
  })

  it('produces correct ordinals including the 11–13 teens exception', () => {
    const fmt = (day: number) =>
      formatDate(makeCalendar(), 0, 0, day, { showEra: false }).split(' ')[0]
    expect(fmt(1)).toBe('1st')
    expect(fmt(2)).toBe('2nd')
    expect(fmt(3)).toBe('3rd')
    expect(fmt(4)).toBe('4th')
    expect(fmt(11)).toBe('11th')
    expect(fmt(12)).toBe('12th')
    expect(fmt(13)).toBe('13th')
    expect(fmt(21)).toBe('21st')
    expect(fmt(22)).toBe('22nd')
    expect(fmt(23)).toBe('23rd')
  })
})
