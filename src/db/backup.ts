import { db, now } from './schema'
import { seedTemplates } from './templates'
import { seedDefaultCalendar } from './calendar'
import { sanitizeHtml } from '../sanitize'
import pkg from '../../package.json'
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

/**
 * The schema version current exports are stamped with. It mirrors the Dexie
 * store version in schema.ts: bump both together whenever the *exported* shape
 * changes, and add a MIGRATIONS step (below) for the new version so older
 * backups keep importing.
 */
export const CURRENT_SCHEMA_VERSION = 5

/** The shape produced by exportAll() and accepted by importAll().
 *  `schemaVersion`/`appVersion` were added in schema v5's tooling; legacy
 *  (pre-versioning) backups lack them and are handled by migrateBackup(). */
export interface BackupData {
  schemaVersion?: number
  appVersion?: string
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

/** A defensive "treat anything that isn't an array as empty" helper, so a
 *  malformed or older backup never crashes a bulkAdd / count. */
function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

// ---------------------------------------------------------------------------
// Forward-compatible import — a small migration ladder
// ---------------------------------------------------------------------------
// Each step upgrades a backup from the version it is keyed by to the next one,
// normalising the payload to the shape that version of the app exported. Steps
// run in order, so importAll() can rely on the current shape regardless of how
// old a backup is. Pre-versioning exports carried no `schemaVersion`; they are
// treated as the oldest (1) and were always forward-compatible — each schema
// bump only ever *added* tables — so the ladder simply fills those tables in.
const MIGRATIONS: Record<number, (d: BackupData) => BackupData> = {
  // v3 added the editable infobox templates table (and its export field).
  2: (d) => ({ ...d, templates: asArray(d.templates) }),
  // v5 added the timeline calendars + events tables.
  4: (d) => ({ ...d, calendars: asArray(d.calendars), events: asArray(d.events) }),
}

/**
 * Bring a parsed backup up to CURRENT_SCHEMA_VERSION by running every migration
 * step from its stored version onward, then stamp it with the current version.
 * A backup with no `schemaVersion` is treated as version 1 (legacy).
 */
export function migrateBackup(data: BackupData): BackupData {
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 1
  let migrated = data
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version]
    if (step) migrated = step(migrated)
    version++
  }
  return { ...migrated, schemaVersion: CURRENT_SCHEMA_VERSION }
}

/**
 * Parse and validate a backup file, then migrate it to the current schema. Throws
 * a friendly Error if the text isn't a Lore Codex backup — this is what prevents a
 * wrong file from wiping the DB, since importAll() calls it before any clear().
 * Only `pages` (an array) is required, so older backups without maps/pins/templates
 * still load. The returned `data` is already migrated to CURRENT_SCHEMA_VERSION and
 * `schemaVersion` reports the version the file was read as upgraded to.
 */
export function parseBackup(
  json: string,
): { data: BackupData; counts: BackupCounts; schemaVersion: number } {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error("This file isn't valid JSON — it may be corrupted.")
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as BackupData).pages)) {
    throw new Error("This doesn't look like a Lore Codex backup file. Nothing was changed.")
  }
  const data = migrateBackup(raw as BackupData)
  return {
    data,
    schemaVersion: data.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    counts: {
      pages: data.pages.length,
      maps: asArray(data.maps).length,
      pins: asArray(data.pins).length,
      templates: asArray(data.templates).length,
      calendars: asArray(data.calendars).length,
      events: asArray(data.events).length,
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
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: pkg.version,
    exportedAt: now(),
    pages,
    maps,
    pins,
    templates,
    calendars,
    events,
  })
}

/**
 * Strip any scripting from the rich-text HTML a backup carries, so importing an
 * untrusted (e.g. shared) backup can't inject XSS. This is the import-time half of
 * roadmap item #8: sanitizing here — the single boundary where outside data enters
 * the DB — means every render path downstream gets clean HTML, regardless of how it
 * later renders it (the page body goes through Tiptap, but a timeline-event
 * description is dropped straight into the DOM via dangerouslySetInnerHTML). Only the
 * two HTML-bearing fields are touched; `summary`, infobox values, etc. are plain text
 * rendered as React text, which React already escapes. See src/sanitize.ts.
 */
function sanitizeBackup(data: BackupData): BackupData {
  return {
    ...data,
    pages: asArray(data.pages).map((p) => ({ ...p, content: sanitizeHtml(p.content) })),
    events: asArray(data.events).map((e) => ({ ...e, description: sanitizeHtml(e.description) })),
  }
}

export async function importAll(json: string): Promise<void> {
  const { data: parsed } = parseBackup(json) // throws before any clear(); migrated to the current shape
  const data = sanitizeBackup(parsed) // strip XSS from untrusted HTML before it touches the DB
  await db.transaction('rw', [db.pages, db.maps, db.pins, db.templates, db.calendars, db.events], async () => {
    await Promise.all([
      db.pages.clear(), db.maps.clear(), db.pins.clear(),
      db.templates.clear(), db.calendars.clear(), db.events.clear(),
    ])
    await db.pages.bulkAdd(asArray(data.pages))
    await db.maps.bulkAdd(asArray(data.maps))
    await db.pins.bulkAdd(asArray(data.pins))
    await db.templates.bulkAdd(asArray(data.templates))
    await db.calendars.bulkAdd(asArray(data.calendars))
    await db.events.bulkAdd(asArray(data.events))
  })
  // Older backups have no templates / calendars — make sure the built-ins exist.
  await seedTemplates()
  await seedDefaultCalendar()
}
