import { db, now } from './schema'
import { seedTemplates } from './templates'
import { seedDefaultCalendar } from './calendar'
import type {
  Calendar,
  InfoboxTemplate,
  LorePage,
  MapPin,
  TimelineEvent,
  WorldMap,
} from './types'

// ---------------------------------------------------------------------------
// Backup / restore — your safety net
// ---------------------------------------------------------------------------

/** The shape produced by exportAll() and accepted by importAll(). */
export interface BackupData {
  exportedAt?: number
  pages: LorePage[]
  maps?: WorldMap[]
  pins?: MapPin[]
  templates?: InfoboxTemplate[]
  calendars?: Calendar[]
  events?: TimelineEvent[]
}

/** Counts of each record kind in a backup, for the import confirmation. */
export interface BackupCounts {
  pages: number
  maps: number
  pins: number
  templates: number
  calendars: number
  events: number
}

/**
 * Parse and validate a backup file. Throws a friendly Error if the text isn't a
 * Lore Codex backup — this is what prevents a wrong file from wiping the DB, since
 * importAll() calls it before any clear(). Only `pages` (an array) is required, so
 * older backups without maps/pins/templates still load.
 */
export function parseBackup(json: string): { data: BackupData; counts: BackupCounts } {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error("This file isn't valid JSON — it may be corrupted.")
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as BackupData).pages)) {
    throw new Error("This doesn't look like a Lore Codex backup file. Nothing was changed.")
  }
  const d = data as BackupData
  return {
    data: d,
    counts: {
      pages: d.pages.length,
      maps: Array.isArray(d.maps) ? d.maps.length : 0,
      pins: Array.isArray(d.pins) ? d.pins.length : 0,
      templates: Array.isArray(d.templates) ? d.templates.length : 0,
      calendars: Array.isArray(d.calendars) ? d.calendars.length : 0,
      events: Array.isArray(d.events) ? d.events.length : 0,
    },
  }
}

export async function exportAll(): Promise<string> {
  const [pages, maps, pins, templates, calendars, events] = await Promise.all([
    db.pages.toArray(),
    db.maps.toArray(),
    db.pins.toArray(),
    db.templates.toArray(),
    db.calendars.toArray(),
    db.events.toArray(),
  ])
  return JSON.stringify({ exportedAt: now(), pages, maps, pins, templates, calendars, events })
}

export async function importAll(json: string): Promise<void> {
  const { data } = parseBackup(json) // throws before any clear() on an invalid file
  await db.transaction('rw', [db.pages, db.maps, db.pins, db.templates, db.calendars, db.events], async () => {
    await Promise.all([
      db.pages.clear(), db.maps.clear(), db.pins.clear(),
      db.templates.clear(), db.calendars.clear(), db.events.clear(),
    ])
    await db.pages.bulkAdd(data.pages)
    if (data.maps) await db.maps.bulkAdd(data.maps)
    if (data.pins) await db.pins.bulkAdd(data.pins)
    if (data.templates) await db.templates.bulkAdd(data.templates)
    if (data.calendars) await db.calendars.bulkAdd(data.calendars)
    if (data.events) await db.events.bulkAdd(data.events)
  })
  // Older backups have no templates — make sure the built-ins exist.
  await seedTemplates()
  await seedDefaultCalendar()
}
