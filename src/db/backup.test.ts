import { describe, it, expect, beforeEach } from 'vitest'
import {
  db,
  migrateBackup,
  parseBackup,
  exportAll,
  importAll,
  CURRENT_SCHEMA_VERSION,
  type BackupData,
  type Calendar,
  type LorePage,
  type TimelineEvent,
} from '../db'
import pkg from '../../package.json'

// #5 of the futureproofing roadmap: exports now carry a `schemaVersion` so a
// backup is never ambiguous to import as the schema evolves. These tests pin the
// three jobs that protect the data: stamping the version on export, running the
// migration ladder on import, and round-tripping both versioned and legacy
// (unversioned) backups.

async function clearAll(): Promise<void> {
  await Promise.all([
    db.pages.clear(), db.maps.clear(), db.pins.clear(), db.regions.clear(),
    db.templates.clear(), db.calendars.clear(), db.events.clear(),
  ])
}

beforeEach(clearAll)

const samplePage = (id: string): LorePage => ({
  id,
  title: `Page ${id}`,
  category: 'Character',
  content: '',
  summary: '',
  status: 'Draft',
  tags: [],
  createdAt: 1,
  updatedAt: 1,
})

const sampleCalendar = (id: string): Calendar => ({
  id,
  name: 'Cal',
  anchor: 0,
  months: [{ name: 'M1', days: 30 }],
  weekdays: ['D1'],
  eras: [],
  createdAt: 1,
})

const sampleEvent = (id: string, calendarId: string): TimelineEvent => ({
  id,
  calendarId,
  title: 'Event',
  description: '',
  category: 'Battle',
  pageId: null,
  startYear: 1,
  startMonth: 0,
  startDay: 1,
  startAbsolute: 0,
  createdAt: 1,
  updatedAt: 1,
})

describe('migrateBackup — version ladder', () => {
  it('treats a backup with no schemaVersion as legacy and fills every table added later', () => {
    const out = migrateBackup({ pages: [] })
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(out.templates).toEqual([]) // added at v3
    expect(out.calendars).toEqual([]) // added at v5
    expect(out.events).toEqual([])
    expect(out.regions).toEqual([]) // added at v6
  })

  it('upgrades a v2 backup (pre-templates) up through every later step', () => {
    const out = migrateBackup({ schemaVersion: 2, pages: [] })
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(out.templates).toEqual([])
    expect(out.calendars).toEqual([])
    expect(out.events).toEqual([])
    expect(out.regions).toEqual([]) // backfilled at v6
  })

  it('upgrades a v4 backup (pre-timeline) and preserves its existing tables', () => {
    const templates = [{ id: 't1', name: 'T', color: '#fff', items: [], builtin: false }]
    const out = migrateBackup({ schemaVersion: 4, pages: [], templates })
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(out.templates).toBe(templates) // not clobbered
    expect(out.calendars).toEqual([]) // backfilled
    expect(out.events).toEqual([])
  })

  it("leaves a current (v6) backup’s data intact and re-stamps the version", () => {
    const cal = sampleCalendar('c1')
    const out = migrateBackup({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      pages: [samplePage('p1')],
      calendars: [cal],
      events: [],
    })
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(out.pages).toHaveLength(1)
    expect(out.calendars).toEqual([cal])
  })

  it('does not mutate its input', () => {
    const input: BackupData = { pages: [] }
    const out = migrateBackup(input)
    expect(input.schemaVersion).toBeUndefined()
    expect(out).not.toBe(input)
  })
})

describe('parseBackup — version reporting', () => {
  it('reports the current version for a legacy (unversioned) backup it migrated', () => {
    const { schemaVersion, data } = parseBackup(JSON.stringify({ pages: [] }))
    expect(schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('reports the current version for an already-current backup', () => {
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, pages: [] })
    expect(parseBackup(json).schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})

describe('exportAll — version stamping', () => {
  it('stamps schemaVersion, appVersion, and exportedAt onto the payload', async () => {
    const parsed = JSON.parse(await exportAll())
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(parsed.appVersion).toBe(pkg.version)
    expect(typeof parsed.exportedAt).toBe('number')
    expect(Array.isArray(parsed.pages)).toBe(true)
  })
})

describe('importAll — round-trips', () => {
  it('round-trips a current export (pages, calendars, events survive)', async () => {
    await db.pages.add(samplePage('p1'))
    await db.calendars.add(sampleCalendar('c1'))
    await db.events.add(sampleEvent('e1', 'c1'))

    const json = await exportAll()
    await clearAll()
    await importAll(json)

    expect(await db.pages.get('p1')).toMatchObject({ id: 'p1', title: 'Page p1' })
    expect(await db.calendars.get('c1')).toMatchObject({ id: 'c1' })
    expect(await db.events.get('e1')).toMatchObject({ id: 'e1', calendarId: 'c1' })
  })

  it('round-trips regions', async () => {
    await db.maps.add({ id: 'm1', name: 'M', image: '', width: 1, height: 1, createdAt: 1 })
    await db.regions.add({
      id: 'r1', mapId: 'm1', points: [[0, 0], [0, 5], [5, 0]], label: 'Forest',
      pageId: null, color: '#8fae6f',
    })

    const json = await exportAll()
    await clearAll()
    await importAll(json)

    expect(await db.regions.get('r1')).toMatchObject({ id: 'r1', label: 'Forest', color: '#8fae6f' })
  })

  it('imports a legacy (unversioned) backup and re-seeds the built-ins it lacks', async () => {
    // A pre-versioning backup: just a pages array, no schemaVersion / templates / calendars.
    await importAll(JSON.stringify({ pages: [samplePage('legacy')] }))

    expect(await db.pages.get('legacy')).toBeDefined()
    // Missing templates + calendar are re-seeded by importAll's seed* calls.
    expect(await db.templates.count()).toBeGreaterThan(0)
    expect(await db.calendars.count()).toBeGreaterThan(0)
  })
})
