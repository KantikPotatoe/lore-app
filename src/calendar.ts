// src/calendar.ts
// Pure date conversion functions — no React, no Dexie, no side effects.
// Works because there are no leap rules: yearLength(cal) is a constant.

import type { Calendar, CalendarEra } from './db'

/** Total days in one year of this calendar (sum of all month lengths). */
export function yearLength(cal: Calendar): number {
  return cal.months.reduce((sum, m) => sum + m.days, 0)
}

/** Days elapsed before month index `m` within a single year (0-based). */
function daysBeforeMonth(cal: Calendar, m: number): number {
  return cal.months.slice(0, m).reduce((sum, mo) => sum + mo.days, 0)
}

/**
 * Convert a calendar date to a shared absolute-day integer.
 * month is 0-based (index into cal.months); day is 1-based.
 */
export function dateToAbsolute(
  cal: Calendar,
  year: number,
  month: number,
  day: number,
): number {
  return cal.anchor + year * yearLength(cal) + daysBeforeMonth(cal, month) + (day - 1)
}

/**
 * Convert a shared absolute-day integer back to a calendar date.
 * Returns month (0-based), day (1-based), and weekdayIndex.
 * Handles negative years correctly via Math.floor division.
 */
export function absoluteToDate(
  cal: Calendar,
  abs: number,
): { year: number; month: number; day: number; weekdayIndex: number } {
  const yl = yearLength(cal)
  if (yl === 0) return { year: 0, month: 0, day: 1, weekdayIndex: 0 }
  let rem = abs - cal.anchor
  const year = Math.floor(rem / yl)
  rem -= year * yl // rem is now in [0, yl) even for negative years
  let month = 0
  let day = 1
  for (let i = 0; i < cal.months.length; i++) {
    if (rem < cal.months[i].days) {
      month = i
      day = rem + 1
      break
    }
    rem -= cal.months[i].days
  }
  const weekdayIndex =
    cal.weekdays.length > 0
      ? ((abs % cal.weekdays.length) + cal.weekdays.length) % cal.weekdays.length
      : 0
  return { year, month, day, weekdayIndex }
}

/**
 * The era whose startYear is the greatest value ≤ year, or null if none qualifies.
 * Eras need not be sorted in the stored array; this function sorts them.
 */
export function eraForYear(cal: Calendar, year: number): CalendarEra | null {
  if (!cal.eras.length) return null
  const sorted = [...cal.eras].sort((a, b) => a.startYear - b.startYear)
  let result: CalendarEra | null = null
  for (const era of sorted) {
    if (year >= era.startYear) result = era
  }
  return result
}

export interface FormatDateOpts {
  /** Include weekday name before the date. Default false. */
  showWeekday?: boolean
  /** Append the era name in parentheses. Default true (omit only if false). */
  showEra?: boolean
  /** Render only the year, no month or day. Default false. */
  yearOnly?: boolean
}

/**
 * Render a human-readable date string.
 * Example: "9th of Seedfall, Year 412 (Imperial Era)"
 */
export function formatDate(
  cal: Calendar,
  year: number,
  month: number,
  day: number,
  opts: FormatDateOpts = {},
): string {
  const parts: string[] = []
  if (opts.showWeekday && cal.weekdays.length > 0) {
    const abs = dateToAbsolute(cal, year, month, day)
    const wi = ((abs % cal.weekdays.length) + cal.weekdays.length) % cal.weekdays.length
    parts.push(cal.weekdays[wi])
  }
  if (opts.yearOnly) {
    parts.push(`Year ${year}`)
  } else {
    const monthName = cal.months[month]?.name ?? `Month ${month + 1}`
    parts.push(`${ordinal(day)} of ${monthName}, Year ${year}`)
  }
  if (opts.showEra !== false) {
    const era = eraForYear(cal, year)
    if (era) parts.push(`(${era.name})`)
  }
  return parts.join(' ')
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}
