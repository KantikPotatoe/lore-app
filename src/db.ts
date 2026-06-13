import Dexie, { liveQuery, type Table } from 'dexie'

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------
// Everything you write is stored locally in your browser (IndexedDB) via Dexie.
// Nothing leaves your machine. Use the Export button to make backup files.

/** One row of an infobox.
 *  Normally a labelled piece of information (label + value). When `kind` is
 *  'separator' the row is instead a full-width section heading: `label` holds
 *  the heading text and `value` is unused. */
export interface InfoboxField {
  id: string
  label: string
  value: string
  kind?: 'separator'
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

// A page's "type" (Character, Country, Place…) is just a template — see
// BUILTIN_TEMPLATES below. Each template carries a colour, used for badges,
// dots and accents across the UI. These built-in colours double as fallbacks.
export const CATEGORIES = [
  { name: 'Character', color: '#e0a458' },
  { name: 'Country', color: '#7eb09b' },
  { name: 'Place', color: '#8aa4c7' },
  { name: 'Faction', color: '#c77e9c' },
  { name: 'Item', color: '#b59ad6' },
  { name: 'Event', color: '#d68a6f' },
  { name: 'Lore', color: '#a0a0a0' },
] as const

/** A palette of pleasant accent colours offered when picking a type's colour. */
export const TYPE_COLORS = [
  '#e0a458', '#7eb09b', '#8aa4c7', '#c77e9c', '#b59ad6', '#d68a6f',
  '#d6c46f', '#6fc7b8', '#9c8af0', '#cf6f6f', '#7fa86f', '#a0a0a0',
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

/** One row in a template: a field, or a separator (`separator: true`). */
export interface TemplateItem {
  label: string
  separator?: boolean
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
const hue = (name: string): string => CATEGORIES.find((c) => c.name === name)?.color ?? '#a0a0a0'

// The starter types. Each has a colour and a set of infobox rows; a few ship
// with separators already in place to show how they group related fields.
export const BUILTIN_TEMPLATES: InfoboxTemplate[] = [
  {
    id: 'builtin-character', name: 'Character', color: hue('Character'), builtin: true, items: [
      f('Epithet'), f('Species'), f('Gender'), f('Age'),
      sep('Allegiance'), f('Status'), f('Affiliation'), f('Occupation'),
      sep('Life'), f('Born'), f('Died'),
    ],
  },
  {
    id: 'builtin-country', name: 'Country', color: hue('Country'), builtin: true, items: [
      f('Capital'), f('Government'), f('Ruler'),
      sep('People'), f('Population'), f('Languages'),
      sep('Economy'), f('Currency'), f('Formed'),
    ],
  },
  {
    id: 'builtin-place', name: 'Place', color: hue('Place'), builtin: true, items: [
      f('Type'), f('Region'), f('Population'), f('Ruler'), f('Founded'), f('Notable for'),
    ],
  },
  {
    id: 'builtin-faction', name: 'Faction', color: hue('Faction'), builtin: true, items: [
      f('Type'), f('Leader'), f('Headquarters'), f('Founded'), f('Members'),
      sep('Relations'), f('Allies'), f('Enemies'),
    ],
  },
  {
    id: 'builtin-item', name: 'Item', color: hue('Item'), builtin: true, items: [
      f('Type'), f('Owner'), f('Creator'), f('Origin'), f('Material'), f('Powers'),
    ],
  },
  {
    id: 'builtin-event', name: 'Event', color: hue('Event'), builtin: true, items: [
      f('Type'), f('Date'), f('Location'), f('Participants'), f('Outcome'),
    ],
  },
  {
    id: 'builtin-lore', name: 'Lore', color: hue('Lore'), builtin: true, items: [
      f('Type'), f('Related to'),
    ],
  },
]

/** Turn template rows into fresh infobox fields (new ids each time). */
function itemsToFields(items: TemplateItem[]): InfoboxField[] {
  return items.map((it) =>
    it.separator
      ? { id: crypto.randomUUID(), label: it.label, value: '', kind: 'separator' as const }
      : { id: crypto.randomUUID(), label: it.label, value: '' },
  )
}

/** Add any built-in templates that aren't in the database yet, and backfill a
 *  colour on any older template that predates the coloured-types feature. Never
 *  overwrites a colour you've chosen. Call once on app start. */
export async function seedTemplates(): Promise<void> {
  const current = await db.templates.toArray()
  const existing = new Set(current.map((t) => t.id))
  const missing = BUILTIN_TEMPLATES.filter((t) => !existing.has(t.id))
  if (missing.length) await db.templates.bulkAdd(missing)

  const builtinById = new Map(BUILTIN_TEMPLATES.map((t) => [t.id, t.color]))
  const needColor = current.filter((t) => !t.color)
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
 *  (falling back to "Lore"). */
export async function defaultInfobox(category: string): Promise<Infobox> {
  const all = await getTemplates()
  const tpl = all.find((t) => t.name === category) ?? all.find((t) => t.name === 'Lore') ?? all[0]
  return {
    template: tpl?.name ?? category,
    image: null,
    caption: '',
    fields: tpl ? itemsToFields(tpl.items) : [],
  }
}

/** Switch an infobox to a template, preserving values the user already filled
 *  in for fields with matching labels, and keeping their custom fields. */
export function applyTemplate(box: Infobox, tpl: InfoboxTemplate): Infobox {
  const byLabel = new Map(
    box.fields.filter((fld) => fld.kind !== 'separator').map((fld) => [fld.label.toLowerCase(), fld]),
  )
  const next: InfoboxField[] = tpl.items.map((it) => {
    if (it.separator) return { id: crypto.randomUUID(), label: it.label, value: '', kind: 'separator' as const }
    const existing = byLabel.get(it.label.toLowerCase())
    return { id: existing?.id ?? crypto.randomUUID(), label: it.label, value: existing?.value ?? '' }
  })
  // Keep any custom fields the user added that aren't part of the new template.
  const templateSet = new Set(tpl.items.filter((it) => !it.separator).map((it) => it.label.toLowerCase()))
  for (const fld of box.fields) {
    if (fld.kind === 'separator') continue // old template separators are dropped
    if (!templateSet.has(fld.label.toLowerCase())) next.push(fld)
  }
  return { ...box, template: tpl.name, fields: next }
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

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** A small key/value row for app settings like "when did we last back up". */
export interface MetaEntry {
  key: string
  value: unknown
}

export class LoreDB extends Dexie {
  pages!: Table<LorePage, string>
  maps!: Table<WorldMap, string>
  pins!: Table<MapPin, string>
  meta!: Table<MetaEntry, string>
  templates!: Table<InfoboxTemplate, string>

  constructor() {
    super('lore-app')
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
  }
}

export const db = new LoreDB()

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
  const category = partial.category || 'Lore'
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

/** Find a page by its title (case-insensitive); create it if missing. */
export async function getOrCreatePageByTitle(title: string): Promise<string> {
  const trimmed = title.trim()
  const all = await db.pages.toArray()
  const match = all.find((p) => p.title.toLowerCase() === trimmed.toLowerCase())
  if (match) return match.id
  // A page conjured from a link starts life as a stub.
  return createPage({ title: trimmed, status: 'Stub' })
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

export async function addMap(name: string, image: string, width: number, height: number): Promise<string> {
  const id = uid()
  await db.maps.add({ id, name, image, width, height, createdAt: now() })
  return id
}

export async function addPin(mapId: string, lat: number, lng: number): Promise<string> {
  const id = uid()
  await db.pins.add({ id, mapId, lat, lng, label: 'New pin', pageId: null })
  return id
}

// ---------------------------------------------------------------------------
// Backup / restore — your safety net
// ---------------------------------------------------------------------------

export async function exportAll(): Promise<string> {
  const [pages, maps, pins, templates] = await Promise.all([
    db.pages.toArray(),
    db.maps.toArray(),
    db.pins.toArray(),
    db.templates.toArray(),
  ])
  return JSON.stringify({ version: 2, exportedAt: now(), pages, maps, pins, templates }, null, 2)
}

export async function importAll(json: string): Promise<void> {
  const data = JSON.parse(json)
  await db.transaction('rw', db.pages, db.maps, db.pins, db.templates, async () => {
    await Promise.all([db.pages.clear(), db.maps.clear(), db.pins.clear(), db.templates.clear()])
    if (data.pages) await db.pages.bulkAdd(data.pages)
    if (data.maps) await db.maps.bulkAdd(data.maps)
    if (data.pins) await db.pins.bulkAdd(data.pins)
    if (data.templates) await db.templates.bulkAdd(data.templates)
  })
  // Older backups have no templates — make sure the built-ins exist.
  await seedTemplates()
}
