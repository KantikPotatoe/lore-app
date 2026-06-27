import { describe, it, expect, beforeEach } from 'vitest'
import { db, seedDefaultCalendar } from '../db'

// seedDefaultCalendar seeds one "Standard Calendar" on first run. It guards on a
// count check, but React StrictMode invokes the startup effect twice in dev, so
// it can run concurrently — the count guard must not race into two calendars.

describe('seedDefaultCalendar', () => {
  beforeEach(async () => {
    await db.calendars.clear()
  })

  it('adds a default calendar on a fresh DB', async () => {
    await seedDefaultCalendar()
    expect(await db.calendars.count()).toBe(1)
  })

  it('does nothing when a calendar already exists', async () => {
    await seedDefaultCalendar()
    await seedDefaultCalendar()
    expect(await db.calendars.count()).toBe(1)
  })

  it('is safe under concurrent invocation (no duplicate calendar)', async () => {
    await Promise.all([seedDefaultCalendar(), seedDefaultCalendar()])
    expect(await db.calendars.count()).toBe(1)
  })
})
