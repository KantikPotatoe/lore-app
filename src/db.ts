import Dexie, { liveQuery, type Table } from 'dexie'
import { dbNameFor, currentLoreId } from './loreId'
import { dateToAbsolute } from './calendar'

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------
// Everything you write is stored locally in your browser (IndexedDB) via Dexie.
// Nothing leaves your machine. Use the Export button to make backup files.

/** The kind of an infobox field. Absent ⇒ 'text' (so older data stays valid). */
export type FieldType = 'text' | 'ref' | 'number'

/** One row of an infobox.
 *  Normally a labelled piece of information (label + value). When `kind` is
 *  'separator' the row is instead a full-width section heading: `label` holds
 *  the heading text and `value` is unused.
 *  `fieldType` makes a field typed: 'ref' fields store one or more `[[Title]]`
 *  tokens in `value` and are bound to `refType` (a page-type name); 'number'
 *  fields store a numeric string in `value`. */
export interface InfoboxField {
  id: string
  label: string
  value: string
  kind?: 'separator'
  fieldType?: FieldType
  refType?: string
}

/** The wiki-style sidebar box on a page: a picture plus labelled fields.
 *  Which fields appear is seeded from a template (see INFOBOX_TEMPLATES). */
export interface Infobox {
  template: string // which template the fields came from
  image: string | null // data URL of the picture, or null
  caption: string // optional caption under the image
  fields: InfoboxField[]
}

/** A single lore page: a character, country, place, item, event, etc. */
export interface LorePage {
  id: string
  title: string
  category: string // e.g. "Character", "Country" — see CATEGORIES below
  content: string // rich-text HTML produced by the editor
  summary: string // short one-line description, shown in lists
  status?: string // development status — see STATUSES (older pages may lack it)
  tags: string[]
  infobox?: Infobox // optional wiki infobox (older pages may not have one)
  createdAt: number
  updatedAt: number
}

/** An uploaded world map image. */
export interface WorldMap {
  id: string
  name: string
  image: string // data URL of the uploaded image
  width: number // natural pixel size, used to lay out the map
  height: number
  createdAt: number
}

/** A pin dropped on a map, optionally linked to a lore page. */
export interface MapPin {
  id: string
  mapId: string
  lat: number // Leaflet coordinates (see MapView for details)
  lng: number
  label: string
  pageId: string | null // linked lore page, or null
}

/** One month in a custom calendar. */
export interface CalendarMonth {
  name: string
  days: number
}

/** A named era within a calendar (e.g. "First Age", "Imperial Era"). */
export interface CalendarEra {
  id: string
  name: string
  startYear: number   // the continuous calendar year at which this era begins
  color?: string      // optional accent for era background bands
}

/** A custom in-world calendar: months, weekdays, eras, and a shared-axis anchor. */
export interface Calendar {
  id: string
  name: string
  /** Absolute day on which this calendar's year 0, month 0, day 1 sits. Defaults to 0. */
  anchor: number
  months: CalendarMonth[]
  weekdays: string[]
  eras: CalendarEra[]
  createdAt: number
}

/** One event on a timeline: a dated occurrence optionally spanning a range. */
export interface TimelineEvent {
  id: string
  calendarId: string
  title: string
  /** Rich-text HTML from LoreEditor. */
  description: string
  /** Free-form category label (e.g. "Battle", "Birth", "Founding"). */
  category: string
  /** Optional hex color for the event accent. Falls back to --accent. */
  color?: string
  /** Linked lore page stored id, like MapPin.pageId. Null if unlinked. */
  pageId: string | null
  startYear: number
  /** 0-based month index into the calendar's months array. */
  startMonth: number
  /** 1-based day within the month. */
  startDay: number
  endYear?: number
  endMonth?: number
  endDay?: number
  /** Cached absolute-day for sorting and horizontal positioning. Computed on every write. */
  startAbsolute: number
  endAbsolute?: number
  createdAt: number
  updatedAt: number
}

// A page's "type" (Character, Country, Deity…) is just a template — see
// BUILTIN_TEMPLATES below. Each template carries a colour, used for badges,
// dots and accents across the UI. These built-in colours double as fallbacks.
export const CATEGORIES = [
  { name: 'Character', color: '#e0a458' },
  { name: 'Country', color: '#7eb09b' },
  { name: 'Deity', color: '#d9c069' },
  { name: 'Geography', color: '#8fae6f' },
  { name: 'Item', color: '#b59ad6' },
  { name: 'Organization', color: '#c77e9c' },
  { name: 'Religion', color: '#c2a25a' },
  { name: 'Species', color: '#6fb6a3' },
  { name: 'Settlement', color: '#8aa4c7' },
  { name: 'Condition', color: '#cf8f5a' },
  { name: 'Conflict', color: '#cf6f6f' },
  { name: 'Document', color: '#b0a486' },
  { name: 'Culture', color: '#d68a6f' },
  { name: 'Language', color: '#9aa0cf' },
  { name: 'Material', color: '#a98e6a' },
  { name: 'Myth', color: '#b58ad0' },
  { name: 'Technology', color: '#6f9cc7' },
  { name: 'Tradition', color: '#d3a85f' },
  { name: 'Spell', color: '#9c8af0' },
] as const

/** The type a brand-new page starts as (you can change it on the page). */
export const DEFAULT_CATEGORY = 'Character'

/** A palette of pleasant accent colours offered when picking a type's colour. */
export const TYPE_COLORS = [
  '#e0a458', '#d9c069', '#d3a85f', '#c2a25a', '#cf8f5a', '#d68a6f',
  '#cf6f6f', '#c77e9c', '#b58ad0', '#b59ad6', '#9c8af0', '#9aa0cf',
  '#6f9cc7', '#8aa4c7', '#6fb6a3', '#7eb09b', '#8fae6f', '#a98e6a',
  '#b0a486', '#a0a0a0',
] as const

// A synchronous cache of "type name → colour" so categoryColor() stays cheap to
// call during rendering. Seeded from the built-ins, then kept in sync with the
// templates table (see the liveQuery subscription after the db is created).
let categoryColors: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.name.toLowerCase(), c.color as string]),
)

export function categoryColor(name: string): string {
  return categoryColors[name.toLowerCase()] ?? '#a0a0a0'
}

// Development status of a page, shown as a badge so you can see at a glance how
// finished each page is. Ordered from least to most developed.
export const STATUSES = [
  { name: 'Stub', color: '#8a8175' },
  { name: 'Draft', color: '#c98f5a' },
  { name: 'WIP', color: '#5a9bc9' },
  { name: 'Complete', color: '#5aa86b' },
] as const

export const DEFAULT_STATUS = 'Draft'

export function statusColor(name: string): string {
  return STATUSES.find((s) => s.name === name)?.color ?? '#8a8175'
}

/** A page's status, falling back to the default for older pages without one. */
export function pageStatus(page: Pick<LorePage, 'status'>): string {
  return page.status ?? DEFAULT_STATUS
}

// ---------------------------------------------------------------------------
// Infobox templates
// ---------------------------------------------------------------------------
// A template is a named, ordered list of starter rows. Each row is either a
// field (a label you fill in) or a separator (a section heading). Pick a
// different template and the rows change. You can still rename, add, remove, or
// reorder rows on any page — templates are only a convenient starting point.
//
// Templates live in the database (the `templates` table) so they can be edited
// and new ones added from the Templates screen. The built-ins below are seeded
// on first run and re-seeded only if missing (your edits are never overwritten).

/** One row in a template: a field, or a separator (`separator: true`).
 *  A field may declare a `fieldType`; 'ref' fields also carry a `refType`
 *  (the name of the page-type whose pages the field links to). */
export interface TemplateItem {
  label: string
  separator?: boolean
  fieldType?: FieldType
  refType?: string
}

/** A page type: a coloured category plus the starter rows for its infobox. */
export interface InfoboxTemplate {
  id: string
  name: string
  color: string // accent colour for this type's badges/dots
  items: TemplateItem[]
  builtin: boolean // true for the shipped starter templates
}

const sep = (label: string): TemplateItem => ({ label, separator: true })
const f = (label: string): TemplateItem => ({ label })
const ref = (label: string, refType: string): TemplateItem => ({ label, fieldType: 'ref', refType })
const num = (label: string): TemplateItem => ({ label, fieldType: 'number' })
const hue = (name: string): string => CATEGORIES.find((c) => c.name === name)?.color ?? '#a0a0a0'

// The starter types. Each has a colour and a set of infobox rows; several ship
// with separators already in place to show how they group related fields.
export const BUILTIN_TEMPLATES: InfoboxTemplate[] = [
  {
    id: 'builtin-character', name: 'Character', color: hue('Character'), builtin: true, items: [
      f('Epithet'), ref('Species', 'Species'), f('Gender'), num('Age'),
      sep('Allegiance'), f('Status'), ref('Affiliation', 'Organization'), f('Occupation'),
      sep('Life'), f('Born'), f('Died'),
    ],
  },
  {
    id: 'builtin-country', name: 'Country', color: hue('Country'), builtin: true, items: [
      ref('Capital', 'Settlement'), f('Government'), ref('Ruler', 'Character'),
      sep('People'), num('Population'), ref('Languages', 'Language'),
      sep('Economy'), f('Currency'), f('Formed'),
    ],
  },
  {
    id: 'builtin-deity', name: 'Deity', color: hue('Deity'), builtin: true, items: [
      f('Domain'), ref('Pantheon', 'Religion'), f('Symbol'), f('Gender'), f('Alignment'),
      sep('Worship'), f('Followers'), f('Holy day'), f('Temples'),
    ],
  },
  {
    id: 'builtin-geography', name: 'Geography', color: hue('Geography'), builtin: true, items: [
      f('Type'), f('Region'), f('Climate'), f('Area'),
      sep('Features'), f('Terrain'), f('Flora & fauna'), f('Notable for'),
    ],
  },
  {
    id: 'builtin-item', name: 'Item', color: hue('Item'), builtin: true, items: [
      f('Type'), ref('Owner', 'Character'), ref('Creator', 'Character'), f('Origin'), ref('Material', 'Material'), f('Powers'),
    ],
  },
  {
    id: 'builtin-organization', name: 'Organization', color: hue('Organization'), builtin: true, items: [
      f('Type'), ref('Leader', 'Character'), f('Headquarters'), f('Founded'), num('Members'),
      sep('Relations'), ref('Allies', 'Organization'), ref('Rivals', 'Organization'),
    ],
  },
  {
    id: 'builtin-religion', name: 'Religion', color: hue('Religion'), builtin: true, items: [
      f('Type'), ref('Deities', 'Deity'), ref('Founder', 'Character'), f('Founded'),
      sep('Practice'), f('Followers'), f('Holy text'), f('Rituals'),
    ],
  },
  {
    id: 'builtin-species', name: 'Species', color: hue('Species'), builtin: true, items: [
      f('Classification'), f('Habitat'), f('Diet'), num('Lifespan'),
      sep('Traits'), f('Intelligence'), f('Size'), f('Distinctive features'),
    ],
  },
  {
    id: 'builtin-settlement', name: 'Settlement', color: hue('Settlement'), builtin: true, items: [
      f('Type'), ref('Region', 'Geography'), num('Population'), f('Government'), ref('Ruler', 'Character'), f('Founded'), f('Notable for'),
    ],
  },
  {
    id: 'builtin-condition', name: 'Condition', color: hue('Condition'), builtin: true, items: [
      f('Type'), f('Cause'), f('Symptoms'), f('Transmission'), f('Cure'), f('Notable cases'),
    ],
  },
  {
    id: 'builtin-conflict', name: 'Conflict', color: hue('Conflict'), builtin: true, items: [
      f('Type'), f('Date'), f('Location'),
      sep('Sides'), ref('Belligerents', 'Organization'), ref('Commanders', 'Character'),
      sep('Result'), f('Outcome'), f('Casualties'),
    ],
  },
  {
    id: 'builtin-document', name: 'Document', color: hue('Document'), builtin: true, items: [
      f('Type'), ref('Author', 'Character'), f('Date written'), ref('Language', 'Language'), f('Location'), f('Contents'),
    ],
  },
  {
    id: 'builtin-culture', name: 'Culture', color: hue('Culture'), builtin: true, items: [
      f('Region'), f('People'), ref('Language', 'Language'), ref('Religion', 'Religion'),
      sep('Ways'), f('Values'), f('Customs'), f('Arts'),
    ],
  },
  {
    id: 'builtin-language', name: 'Language', color: hue('Language'), builtin: true, items: [
      f('Family'), f('Spoken by'), f('Region'), f('Writing system'), f('Status'),
    ],
  },
  {
    id: 'builtin-material', name: 'Material', color: hue('Material'), builtin: true, items: [
      f('Type'), f('Source'), f('Properties'), f('Rarity'), f('Uses'),
    ],
  },
  {
    id: 'builtin-myth', name: 'Myth', color: hue('Myth'), builtin: true, items: [
      f('Type'), f('Origin culture'), f('Figures'), f('Themes'), f('Related to'),
    ],
  },
  {
    id: 'builtin-technology', name: 'Technology', color: hue('Technology'), builtin: true, items: [
      f('Type'), ref('Inventor', 'Character'), f('Invented'), f('Function'), f('Materials'), f('Users'),
    ],
  },
  {
    id: 'builtin-tradition', name: 'Tradition', color: hue('Tradition'), builtin: true, items: [
      f('Type'), ref('Culture', 'Culture'), f('Occasion'), f('Participants'), f('Origin'),
    ],
  },
  {
    id: 'builtin-spell', name: 'Spell', color: hue('Spell'), builtin: true, items: [
      f('School'), ref('Caster', 'Character'), f('Effect'),
      sep('Casting'), f('Components'), f('Range'), f('Duration'),
    ],
  },
]

/** Turn template rows into fresh infobox fields (new ids each time). */
function itemsToFields(items: TemplateItem[]): InfoboxField[] {
  return items.map((it) =>
    it.separator
      ? { id: crypto.randomUUID(), label: it.label, value: '', kind: 'separator' as const }
      : { id: crypto.randomUUID(), label: it.label, value: '', fieldType: it.fieldType ?? 'text', refType: it.refType },
  )
}

/** Reconcile the templates table with the shipped built-ins: add any that are
 *  missing, drop built-ins we no longer ship, and backfill a colour on older
 *  rows. Never touches a template you created or a colour/rows you edited on a
 *  still-shipped built-in. Call once on app start. */
export async function seedTemplates(): Promise<void> {
  const current = await db.templates.toArray()
  const existing = new Set(current.map((t) => t.id))
  const shippedIds = new Set(BUILTIN_TEMPLATES.map((t) => t.id))

  const missing = BUILTIN_TEMPLATES.filter((t) => !existing.has(t.id))
  if (missing.length) await db.templates.bulkAdd(missing)

  // Remove built-ins that are no longer part of the shipped set (your own
  // custom types, builtin === false, are always left alone).
  const obsolete = current.filter((t) => t.builtin && !shippedIds.has(t.id))
  await Promise.all(obsolete.map((t) => db.templates.delete(t.id)))

  const builtinById = new Map(BUILTIN_TEMPLATES.map((t) => [t.id, t.color]))
  const needColor = current.filter((t) => !t.color && !obsolete.includes(t))
  await Promise.all(
    needColor.map((t) => db.templates.update(t.id, { color: builtinById.get(t.id) ?? '#a0a0a0' })),
  )
}

/** All templates, alphabetical by name. Falls back to the built-ins if the
 *  database hasn't been seeded yet. */
export async function getTemplates(): Promise<InfoboxTemplate[]> {
  const all = await db.templates.toArray()
  const list = all.length ? all : BUILTIN_TEMPLATES
  return [...list].sort((a, b) => a.name.localeCompare(b.name))
}

/** A fresh infobox seeded from the template whose name matches the category
 *  (falling back to the default type, then the first available). */
export async function defaultInfobox(category: string): Promise<Infobox> {
  const all = await getTemplates()
  const tpl = all.find((t) => t.name === category) ?? all.find((t) => t.name === DEFAULT_CATEGORY) ?? all[0]
  return {
    template: tpl?.name ?? category,
    image: null,
    caption: '',
    fields: tpl ? itemsToFields(tpl.items) : [],
  }
}

/** Switch an infobox to a template: its rows become exactly the template's
 *  rows (replacing whatever was there before), but any value the user already
 *  filled in for a field with a matching label is carried over. The image and
 *  caption are kept. */
export function applyTemplate(box: Infobox, tpl: InfoboxTemplate): Infobox {
  const byLabel = new Map(
    box.fields.filter((fld) => fld.kind !== 'separator').map((fld) => [fld.label.toLowerCase(), fld]),
  )
  const fields: InfoboxField[] = tpl.items.map((it) => {
    if (it.separator) return { id: crypto.randomUUID(), label: it.label, value: '', kind: 'separator' as const }
    const existing = byLabel.get(it.label.toLowerCase())
    return {
      id: existing?.id ?? crypto.randomUUID(),
      label: it.label,
      value: existing?.value ?? '',
      fieldType: it.fieldType ?? 'text',
      refType: it.refType,
    }
  })
  return { ...box, template: tpl.name, fields }
}

/** Parse a ref field's value ("[[A]] [[B]]") into an ordered list of titles. */
export function parseRefTitles(value: string): string[] {
  const out: string[] = []
  for (const m of value.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const t = m[1].trim()
    if (t) out.push(t)
  }
  return out
}

/** Serialise a list of titles back into a ref field value ("[[A]] [[B]]"). */
export function serializeRefTitles(titles: string[]): string {
  return titles.map((t) => t.trim()).filter(Boolean).map((t) => `[[${t}]]`).join(' ')
}

// -- template CRUD (used by the Templates screen) ---------------------------

export async function createTemplate(name: string, color: string = '#a0a0a0'): Promise<string> {
  const id = crypto.randomUUID()
  await db.templates.add({ id, name: name.trim() || 'New template', color, items: [], builtin: false })
  return id
}

export async function updateTemplate(id: string, changes: Partial<InfoboxTemplate>): Promise<void> {
  await db.templates.update(id, changes)
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.templates.delete(id)
}

/** Restore a built-in template's rows to their shipped defaults. */
export async function resetTemplate(id: string): Promise<void> {
  const original = BUILTIN_TEMPLATES.find((t) => t.id === id)
  if (original) await db.templates.put({ ...original })
}

/** Pages whose infobox was built from the template of this name. */
export async function pagesUsingTemplate(name: string): Promise<LorePage[]> {
  const pages = await db.pages.toArray()
  return pages.filter((p) => p.infobox?.template === name)
}

/** Re-apply a template's current rows to every page using it, preserving any
 *  values already entered. Returns how many pages were updated. */
export async function applyTemplateToPages(tpl: InfoboxTemplate): Promise<number> {
  const targets = await pagesUsingTemplate(tpl.name)
  await Promise.all(
    targets.map((p) => db.pages.update(p.id, { infobox: applyTemplate(p.infobox!, tpl), updatedAt: now() })),
  )
  return targets.length
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** A small key/value row for app settings like "when did we last back up". */
export interface MetaEntry {
  key: string
  value: unknown
}

export interface Snapshot {
  id?: number
  timestamp: number
  editCount: number   // distinct pages changed since the previous snapshot
  data: string        // raw exportAll() JSON
}

export class LoreDB extends Dexie {
  pages!: Table<LorePage, string>
  maps!: Table<WorldMap, string>
  pins!: Table<MapPin, string>
  meta!: Table<MetaEntry, string>
  templates!: Table<InfoboxTemplate, string>
  snapshots!: Table<Snapshot, number>
  calendars!: Table<Calendar, string>
  events!: Table<TimelineEvent, string>

  constructor(name: string = 'lore-app') {
    super(name)
    this.version(1).stores({
      // Indexes: only fields we search/sort by need listing here.
      pages: 'id, title, category, updatedAt',
      maps: 'id, name, createdAt',
      pins: 'id, mapId, pageId',
    })
    // v2 adds a meta table (app settings); existing data is preserved.
    this.version(2).stores({
      pages: 'id, title, category, updatedAt',
      maps: 'id, name, createdAt',
      pins: 'id, mapId, pageId',
      meta: '&key',
    })
    // v3 adds editable infobox templates; existing data is preserved.
    this.version(3).stores({
      pages: 'id, title, category, updatedAt',
      maps: 'id, name, createdAt',
      pins: 'id, mapId, pageId',
      meta: '&key',
      templates: 'id, name',
    })
    // v4 adds auto-snapshots stored locally; existing data is preserved.
    this.version(4).stores({
      pages: 'id, title, category, updatedAt',
      maps: 'id, name, createdAt',
      pins: 'id, mapId, pageId',
      meta: '&key',
      templates: 'id, name',
      snapshots: '++id, timestamp',
    })
    // v5 adds in-world timeline calendars and events; existing data is preserved.
    this.version(5).stores({
      pages: 'id, title, category, updatedAt',
      maps: 'id, name, createdAt',
      pins: 'id, mapId, pageId',
      meta: '&key',
      templates: 'id, name',
      snapshots: '++id, timestamp',
      calendars: 'id, name, createdAt',
      events: 'id, calendarId, startAbsolute, pageId',
    })
  }
}

export const db = new LoreDB(dbNameFor(currentLoreId()))

// Keep the synchronous colour cache in sync with the templates table, so every
// page type (built-in or one you add) shows its colour everywhere instantly.
liveQuery(() => db.templates.toArray()).subscribe((tpls) => {
  const next: Record<string, string> = Object.fromEntries(
    CATEGORIES.map((c) => [c.name.toLowerCase(), c.color as string]),
  )
  for (const t of tpls) if (t.color) next[t.name.toLowerCase()] = t.color
  categoryColors = next
})

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uid = () => crypto.randomUUID()
const now = () => Date.now()

export async function createPage(partial: Partial<LorePage> = {}): Promise<string> {
  const id = uid()
  const category = partial.category || DEFAULT_CATEGORY
  const page: LorePage = {
    id,
    title: partial.title?.trim() || 'Untitled',
    category,
    content: partial.content || '',
    summary: partial.summary || '',
    status: partial.status || DEFAULT_STATUS,
    tags: partial.tags || [],
    infobox: partial.infobox ?? (await defaultInfobox(category)),
    createdAt: now(),
    updatedAt: now(),
  }
  await db.pages.add(page)
  return id
}

export async function updatePage(id: string, changes: Partial<LorePage>): Promise<void> {
  await db.pages.update(id, { ...changes, updatedAt: now() })
}

export async function deletePage(id: string): Promise<void> {
  await db.pages.delete(id)
  // Unlink any pins that pointed at this page.
  const linked = await db.pins.where('pageId').equals(id).toArray()
  await Promise.all(linked.map((p) => db.pins.update(p.id, { pageId: null })))
}

/** Find an existing page's id by title (case-insensitive), or null. No creation —
 *  clicking a link to a missing page is handled (with confirmation) by the caller. */
export async function findPageIdByTitle(title: string): Promise<string | null> {
  const trimmed = title.trim().toLowerCase()
  const all = await db.pages.toArray()
  return all.find((p) => p.title.trim().toLowerCase() === trimmed)?.id ?? null
}

/** Rewrite every reference to `oldTitle` into `newTitle` within one page's body
 *  and infobox. Matches titles case-insensitively. Returns only the changed fields,
 *  or null if this page referenced nothing (so untouched pages aren't re-written). */
function rewriteLinksInPage(
  page: LorePage,
  oldTitle: string,
  newTitle: string,
): Partial<LorePage> | null {
  const oldLc = oldTitle.trim().toLowerCase()
  const out: Partial<LorePage> = {}
  let changed = false

  // Body: <a data-wikilink data-title="Old">Old</a> — rewrite attribute + text.
  if (page.content && page.content.includes('data-wikilink')) {
    const doc = new DOMParser().parseFromString(page.content, 'text/html')
    let bodyChanged = false
    doc.querySelectorAll('a[data-wikilink]').forEach((a) => {
      if (a.getAttribute('data-title')?.trim().toLowerCase() === oldLc) {
        a.setAttribute('data-title', newTitle)
        a.textContent = newTitle
        bodyChanged = true
      }
    })
    if (bodyChanged) {
      out.content = doc.body.innerHTML
      changed = true
    }
  }

  // Infobox: field values keep raw [[Name]] tokens (covers plain AND ref fields).
  if (page.infobox) {
    let boxChanged = false
    const fields = page.infobox.fields.map((f) => {
      const v = f.value.replace(/\[\[([^\]]+)\]\]/g, (m, inner) =>
        inner.trim().toLowerCase() === oldLc ? `[[${newTitle}]]` : m,
      )
      if (v !== f.value) boxChanged = true
      return v === f.value ? f : { ...f, value: v }
    })
    if (boxChanged) {
      out.infobox = { ...page.infobox, fields }
      changed = true
    }
  }

  return changed ? out : null
}

/** Rename a page and rewrite every reference to it across all other pages, so no
 *  [[links]] break. Throws if another page already holds the new title (which would
 *  make links ambiguous). No-ops on an empty or unchanged title. */
export async function renamePage(id: string, newTitle: string): Promise<void> {
  const trimmed = newTitle.trim()
  const page = await db.pages.get(id)
  if (!page) return
  const oldTitle = page.title
  if (!trimmed || trimmed === oldTitle) return

  const all = await db.pages.toArray()
  const clash = all.find(
    (p) => p.id !== id && p.title.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  if (clash) throw new Error(`A page titled "${clash.title}" already exists.`)

  await db.transaction('rw', db.pages, async () => {
    await db.pages.update(id, { title: trimmed, updatedAt: now() })
    for (const p of all) {
      if (p.id === id) continue
      const rewritten = rewriteLinksInPage(p, oldTitle, trimmed)
      if (rewritten) await db.pages.update(p.id, { ...rewritten, updatedAt: now() })
    }
  })
}

// ---------------------------------------------------------------------------
// Backlinks — "which other pages link to this one"
// ---------------------------------------------------------------------------

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

/** Every page title (lowercased) that a page links to, gathered from its
 *  rich-text body and its infobox field values. */
export function linkedTitles(page: LorePage): Set<string> {
  const titles = new Set<string>()
  // Body: editor wiki links render as <a data-wikilink data-title="...">.
  if (page.content) {
    const doc = new DOMParser().parseFromString(page.content, 'text/html')
    doc.querySelectorAll('a[data-wikilink]').forEach((a) => {
      const t = a.getAttribute('data-title')?.trim().toLowerCase()
      if (t) titles.add(t)
    })
  }
  // Infobox field values keep the raw [[Name]] syntax.
  if (page.infobox) {
    for (const field of page.infobox.fields) {
      for (const m of field.value.matchAll(WIKILINK_RE)) {
        const t = m[1].trim().toLowerCase()
        if (t) titles.add(t)
      }
    }
  }
  return titles
}

/** All pages that link to the page with the given id. */
export async function getBacklinks(pageId: string): Promise<LorePage[]> {
  const target = await db.pages.get(pageId)
  const targetTitle = target?.title.trim().toLowerCase()
  if (!targetTitle) return []
  const all = await db.pages.toArray()
  return all
    .filter((p) => p.id !== pageId && linkedTitles(p).has(targetTitle))
    .sort((a, b) => a.title.localeCompare(b.title))
}

// ---------------------------------------------------------------------------
// Relationship graph — nodes (pages) and edges (resolved links between them)
// ---------------------------------------------------------------------------

/** One page as a graph node. `degree` is the number of distinct pages it is
 *  connected to (in either direction) and drives the node's drawn size. */
export interface GraphNode {
  id: string
  title: string
  category: string
  tags: string[]
  degree: number
}

/** One edge between two existing pages. `source`/`target` keep the original
 *  link direction so directional arrows can be drawn when enabled. */
export interface GraphLink {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

/** Build the relationship graph from the full page list.
 *
 *  Every page becomes a node (pages with no links show as lone dots, which is
 *  intentional — it surfaces isolated pages). Each page's linked titles are
 *  resolved against a title→id map; a link counts only when the target page
 *  exists. Self-links are dropped and A↔B collapses to a single edge regardless
 *  of direction. `degree` counts distinct neighbours. */
export function buildGraphData(pages: LorePage[]): GraphData {
  const idByTitle = new Map<string, string>()
  for (const p of pages) idByTitle.set(p.title.trim().toLowerCase(), p.id)

  const neighbours = new Map<string, Set<string>>()
  for (const p of pages) neighbours.set(p.id, new Set())

  const seen = new Set<string>() // de-dupe key "a|b" with a < b
  const links: GraphLink[] = []

  for (const page of pages) {
    for (const title of linkedTitles(page)) {
      const targetId = idByTitle.get(title)
      if (!targetId || targetId === page.id) continue // missing page or self-link
      const key = page.id < targetId ? `${page.id}|${targetId}` : `${targetId}|${page.id}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ source: page.id, target: targetId })
      neighbours.get(page.id)!.add(targetId)
      neighbours.get(targetId)!.add(page.id)
    }
  }

  const nodes: GraphNode[] = pages.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    tags: p.tags,
    degree: neighbours.get(p.id)!.size,
  }))

  return { nodes, links }
}

export async function addMap(name: string, image: string, width: number, height: number): Promise<string> {
  const id = uid()
  await db.maps.add({ id, name, image, width, height, createdAt: now() })
  return id
}

export async function deleteMap(mapId: string): Promise<void> {
  await db.transaction('rw', db.maps, db.pins, async () => {
    await db.maps.delete(mapId)
    await db.pins.where('mapId').equals(mapId).delete()
  })
}

export async function addPin(mapId: string, lat: number, lng: number): Promise<string> {
  const id = uid()
  await db.pins.add({ id, mapId, lat, lng, label: 'New pin', pageId: null })
  return id
}

// ---------------------------------------------------------------------------
// Timeline calendars — CRUD
// ---------------------------------------------------------------------------

const DEFAULT_CALENDAR_MONTHS: CalendarMonth[] = [
  { name: 'January', days: 31 }, { name: 'February', days: 28 },
  { name: 'March', days: 31 },   { name: 'April', days: 30 },
  { name: 'May', days: 31 },     { name: 'June', days: 30 },
  { name: 'July', days: 31 },    { name: 'August', days: 31 },
  { name: 'September', days: 30 },{ name: 'October', days: 31 },
  { name: 'November', days: 30 }, { name: 'December', days: 31 },
]

/**
 * Seed a single "Standard Calendar" on first app start if no calendars exist yet.
 * Safe to call repeatedly (checks count first). Modeled on seedTemplates().
 */
export async function seedDefaultCalendar(): Promise<void> {
  const count = await db.calendars.count()
  if (count > 0) return
  await db.calendars.add({
    id: uid(),
    name: 'Standard Calendar',
    anchor: 0,
    months: DEFAULT_CALENDAR_MONTHS,
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    eras: [{ id: uid(), name: 'Common Era', startYear: 0 }],
    createdAt: now(),
  })
}

/** Create a new calendar with default months and weekdays. Returns its id. */
export async function createCalendar(name: string): Promise<string> {
  const id = uid()
  await db.calendars.add({
    id,
    name: name.trim() || 'New Calendar',
    anchor: 0,
    months: DEFAULT_CALENDAR_MONTHS.map((m) => ({ ...m })),
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    eras: [],
    createdAt: now(),
  })
  return id
}

/**
 * Update a calendar. If months or anchor change, recomputes startAbsolute / endAbsolute
 * for all events belonging to that calendar so sort order stays correct.
 */
export async function updateCalendar(id: string, changes: Partial<Calendar>): Promise<void> {
  await db.calendars.update(id, changes)
  if ('months' in changes || 'anchor' in changes) {
    const cal = await db.calendars.get(id)
    if (!cal) return
    const events = await db.events.where('calendarId').equals(id).toArray()
    await Promise.all(
      events.map((e) => {
        const startAbsolute = dateToAbsolute(cal, e.startYear, e.startMonth, e.startDay)
        const endAbsolute =
          e.endYear != null
            ? dateToAbsolute(cal, e.endYear, e.endMonth ?? 0, e.endDay ?? 1)
            : undefined
        return db.events.update(e.id, { startAbsolute, endAbsolute })
      }),
    )
  }
}

/**
 * Delete a calendar and cascade-delete all its events.
 * Mirrors the deleteMap pattern (transaction).
 */
export async function deleteCalendar(calendarId: string): Promise<void> {
  await db.transaction('rw', db.calendars, db.events, async () => {
    await db.calendars.delete(calendarId)
    await db.events.where('calendarId').equals(calendarId).delete()
  })
}

// ---------------------------------------------------------------------------
// Timeline events — CRUD
// ---------------------------------------------------------------------------

type NewEventData = Omit<TimelineEvent, 'id' | 'startAbsolute' | 'endAbsolute' | 'createdAt' | 'updatedAt'>

/** Add a timeline event. Computes startAbsolute / endAbsolute automatically. */
export async function addEvent(data: NewEventData): Promise<string> {
  const cal = await db.calendars.get(data.calendarId)
  if (!cal) throw new Error('Calendar not found')
  const startAbsolute = dateToAbsolute(cal, data.startYear, data.startMonth, data.startDay)
  const endAbsolute =
    data.endYear != null
      ? dateToAbsolute(cal, data.endYear, data.endMonth ?? 0, data.endDay ?? 1)
      : undefined
  const id = uid()
  await db.events.add({
    ...data,
    id,
    startAbsolute,
    endAbsolute,
    createdAt: now(),
    updatedAt: now(),
  })
  return id
}

/** Update a timeline event. Always recomputes startAbsolute / endAbsolute. */
export async function updateEvent(
  id: string,
  changes: Partial<Omit<TimelineEvent, 'id' | 'createdAt'>>,
): Promise<void> {
  const existing = await db.events.get(id)
  if (!existing) return
  const merged = { ...existing, ...changes }
  const cal = await db.calendars.get(merged.calendarId)
  if (!cal) throw new Error('Calendar not found')
  const startAbsolute = dateToAbsolute(cal, merged.startYear, merged.startMonth, merged.startDay)
  const endAbsolute =
    merged.endYear != null
      ? dateToAbsolute(cal, merged.endYear, merged.endMonth ?? 0, merged.endDay ?? 1)
      : undefined
  await db.events.update(id, { ...changes, startAbsolute, endAbsolute, updatedAt: now() })
}

/** Delete a timeline event. */
export async function deleteEvent(id: string): Promise<void> {
  await db.events.delete(id)
}

// ---------------------------------------------------------------------------
// Backup / restore — your safety net
// ---------------------------------------------------------------------------

/** The shape produced by exportAll() and accepted by importAll(). */
export interface BackupData {
  version?: number
  exportedAt?: number
  pages: LorePage[]
  maps?: WorldMap[]
  pins?: MapPin[]
  templates?: InfoboxTemplate[]
}

/** Counts of each record kind in a backup, for the import confirmation. */
export interface BackupCounts {
  pages: number
  maps: number
  pins: number
  templates: number
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
    },
  }
}

export async function exportAll(): Promise<string> {
  const [pages, maps, pins, templates] = await Promise.all([
    db.pages.toArray(),
    db.maps.toArray(),
    db.pins.toArray(),
    db.templates.toArray(),
  ])
  return JSON.stringify({ version: 2, exportedAt: now(), pages, maps, pins, templates })
}

export async function importAll(json: string): Promise<void> {
  const { data } = parseBackup(json) // throws before any clear() on an invalid file
  await db.transaction('rw', db.pages, db.maps, db.pins, db.templates, async () => {
    await Promise.all([db.pages.clear(), db.maps.clear(), db.pins.clear(), db.templates.clear()])
    await db.pages.bulkAdd(data.pages)
    if (data.maps) await db.maps.bulkAdd(data.maps)
    if (data.pins) await db.pins.bulkAdd(data.pins)
    if (data.templates) await db.templates.bulkAdd(data.templates)
  })
  // Older backups have no templates — make sure the built-ins exist.
  await seedTemplates()
}

// ---------------------------------------------------------------------------
// Snapshots — automatic local version history
// ---------------------------------------------------------------------------

export async function saveSnapshot(data: string, editCount: number): Promise<void> {
  await db.transaction('rw', db.snapshots, async () => {
    await db.snapshots.add({ timestamp: Date.now(), editCount, data })
    const count = await db.snapshots.count()
    if (count > 10) {
      const oldest = await db.snapshots.orderBy('timestamp').first()
      if (oldest?.id != null) await db.snapshots.delete(oldest.id)
    }
  })
}

export async function getSnapshots(): Promise<Snapshot[]> {
  return db.snapshots.orderBy('timestamp').reverse().toArray()
}

export async function deleteSnapshot(id: number): Promise<void> {
  await db.snapshots.delete(id)
}
