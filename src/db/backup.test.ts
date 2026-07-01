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
    db.templates.clear(), db.calendars.clear(), db.events.clear(), db.images.clear(),
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

  it('rejects a backup stamped with a newer schemaVersion than this app understands', () => {
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, pages: [] })
    // Importing a shape this app doesn't understand could silently drop or corrupt
    // data — refuse before any clear() rather than proceed against an unknown shape.
    expect(() => parseBackup(json)).toThrow(/newer version/)
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

  it('round-trips pin and region portals (childMapId)', async () => {
    await db.maps.add({ id: 'm1', name: 'Continent', image: '', width: 1, height: 1, createdAt: 1 })
    await db.maps.add({ id: 'm2', name: 'City', image: '', width: 1, height: 1, createdAt: 2 })
    await db.pins.add({ id: 'pin1', mapId: 'm1', lat: 1, lng: 1, label: 'Capital', pageId: null, childMapId: 'm2' })
    await db.regions.add({
      id: 'r1', mapId: 'm1', points: [[0, 0], [0, 5], [5, 0]], label: 'Reach',
      pageId: null, childMapId: 'm2',
    })

    const json = await exportAll()
    await clearAll()
    await importAll(json)

    expect(await db.pins.get('pin1')).toMatchObject({ id: 'pin1', childMapId: 'm2' })
    expect(await db.regions.get('r1')).toMatchObject({ id: 'r1', childMapId: 'm2' })
  })

  it('imports a legacy (unversioned) backup and re-seeds the built-ins it lacks', async () => {
    // A pre-versioning backup: just a pages array, no schemaVersion / templates / calendars.
    await importAll(JSON.stringify({ pages: [samplePage('legacy')] }))

    expect(await db.pages.get('legacy')).toBeDefined()
    // Missing templates + calendar are re-seeded by importAll's seed* calls.
    expect(await db.templates.count()).toBeGreaterThan(0)
    expect(await db.calendars.count()).toBeGreaterThan(0)
  })

  it('round-trips gallery images', async () => {
    await db.images.add({ id: 'img1', pageId: 'p1', dataUrl: 'data:image/png;base64,AAA', caption: 'cape', order: 0, createdAt: 1 })

    const json = await exportAll()
    await db.images.clear()
    await importAll(json)

    expect(await db.images.get('img1')).toMatchObject({ id: 'img1', pageId: 'p1', caption: 'cape', order: 0 })
  })

  it('round-trips a custom template with sections intact', async () => {
    await db.templates.add({
      id: 'tmpl-sections-test',
      name: 'SectionsTemplate',
      color: '#123456',
      items: [],
      sections: ['Alpha', 'Beta'],
      builtin: false,
    })

    const json = await exportAll()
    await clearAll()
    await importAll(json)

    const restored = await db.templates.get('tmpl-sections-test')
    expect(restored).toMatchObject({ id: 'tmpl-sections-test', sections: ['Alpha', 'Beta'] })
  })

  it('drops imported images whose dataUrl is not a data:image URL', async () => {
    const json = JSON.stringify({
      schemaVersion: 8,
      pages: [],
      images: [
        { id: 'ok', pageId: 'p1', dataUrl: 'data:image/jpeg;base64,GOOD', caption: '', order: 0, createdAt: 1 },
        { id: 'evil', pageId: 'p1', dataUrl: 'javascript:alert(1)', caption: '', order: 1, createdAt: 2 },
      ],
    })
    await importAll(json)
    expect(await db.images.get('ok')).toBeDefined()
    expect(await db.images.get('evil')).toBeUndefined()
  })

  it('drops imported SVG data-URL images (they can embed scripts)', async () => {
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      pages: [],
      images: [
        { id: 'raster', pageId: 'p1', dataUrl: 'data:image/png;base64,AAA', caption: '', order: 0, createdAt: 1 },
        { id: 'svg', pageId: 'p1', dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', caption: '', order: 1, createdAt: 2 },
      ],
    })
    await importAll(json)
    expect(await db.images.get('raster')).toBeDefined()
    expect(await db.images.get('svg')).toBeUndefined()
  })
})

describe('schema version', () => {
  it('is at 9 for the retired WIP status', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(9)
  })

  it('stamps an older backup up to current with no data loss', () => {
    const out = migrateBackup({ schemaVersion: 6, pages: [], regions: [] })
    expect(out.schemaVersion).toBe(9)
    expect(out.regions).toEqual([])
  })
})

describe('images migration', () => {
  it('MIGRATIONS step normalizes a missing images table to an empty array', () => {
    const out = migrateBackup({ schemaVersion: 7, pages: [] })
    expect(out.images).toEqual([])
  })
})

describe('WIP status migration', () => {
  it('remaps pages tagged WIP to Draft and leaves other statuses alone', () => {
    const out = migrateBackup({
      schemaVersion: 8,
      pages: [
        { id: 'a', status: 'WIP' },
        { id: 'b', status: 'Draft' },
        { id: 'c', status: 'Complete' },
        { id: 'd' },
      ],
    } as never)
    expect((out.pages as Array<{ id: string; status?: string }>).map((p) => p.status)).toEqual([
      'Draft',
      'Draft',
      'Complete',
      undefined,
    ])
  })
})
