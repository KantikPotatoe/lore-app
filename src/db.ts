import Dexie, { type Table } from 'dexie'

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------
// Everything you write is stored locally in your browser (IndexedDB) via Dexie.
// Nothing leaves your machine. Use the Export button to make backup files.

/** One row of an infobox: a labelled piece of information. */
export interface InfoboxField {
  id: string
  label: string
  value: string
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

// Categories with colors used across the UI. Add your own freely.
export const CATEGORIES = [
  { name: 'Character', color: '#e0a458' },
  { name: 'Country', color: '#7eb09b' },
  { name: 'Place', color: '#8aa4c7' },
  { name: 'Faction', color: '#c77e9c' },
  { name: 'Item', color: '#b59ad6' },
  { name: 'Event', color: '#d68a6f' },
  { name: 'Lore', color: '#a0a0a0' },
] as const

export function categoryColor(name: string): string {
  return CATEGORIES.find((c) => c.name === name)?.color ?? '#a0a0a0'
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
// Each template is just a list of starter field labels. Pick a different
// template and the fields change. You can still rename, add, or remove fields
// on any page — templates are only a convenient starting point.
export const INFOBOX_TEMPLATES: Record<string, string[]> = {
  Character: ['Epithet', 'Species', 'Gender', 'Age', 'Status', 'Affiliation', 'Occupation', 'Born', 'Died'],
  Country: ['Capital', 'Government', 'Ruler', 'Population', 'Languages', 'Currency', 'Formed'],
  Place: ['Type', 'Region', 'Population', 'Ruler', 'Founded', 'Notable for'],
  Faction: ['Type', 'Leader', 'Headquarters', 'Founded', 'Members', 'Allies', 'Enemies'],
  Item: ['Type', 'Owner', 'Creator', 'Origin', 'Material', 'Powers'],
  Event: ['Type', 'Date', 'Location', 'Participants', 'Outcome'],
  Lore: ['Type', 'Related to'],
}

export const INFOBOX_TEMPLATE_NAMES = Object.keys(INFOBOX_TEMPLATES)

function fieldsForTemplate(template: string): InfoboxField[] {
  return (INFOBOX_TEMPLATES[template] ?? []).map((label) => ({
    id: crypto.randomUUID(),
    label,
    value: '',
  }))
}

/** A fresh infobox seeded from the template matching the given category. */
export function defaultInfobox(category: string): Infobox {
  const template = INFOBOX_TEMPLATES[category] ? category : 'Lore'
  return { template, image: null, caption: '', fields: fieldsForTemplate(template) }
}

/** Switch an infobox to a new template, preserving any values the user already
 *  filled in for fields with matching labels, and keeping custom fields. */
export function applyTemplate(box: Infobox, template: string): Infobox {
  const byLabel = new Map(box.fields.map((f) => [f.label.toLowerCase(), f]))
  const templateLabels = INFOBOX_TEMPLATES[template] ?? []
  const next: InfoboxField[] = templateLabels.map((label) => {
    const existing = byLabel.get(label.toLowerCase())
    return { id: existing?.id ?? crypto.randomUUID(), label, value: existing?.value ?? '' }
  })
  // Keep any custom fields the user added that aren't part of the new template.
  const templateSet = new Set(templateLabels.map((l) => l.toLowerCase()))
  for (const f of box.fields) {
    if (!templateSet.has(f.label.toLowerCase())) next.push(f)
  }
  return { ...box, template, fields: next }
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
  }
}

export const db = new LoreDB()

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
    infobox: partial.infobox ?? defaultInfobox(category),
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
  const [pages, maps, pins] = await Promise.all([
    db.pages.toArray(),
    db.maps.toArray(),
    db.pins.toArray(),
  ])
  return JSON.stringify({ version: 1, exportedAt: now(), pages, maps, pins }, null, 2)
}

export async function importAll(json: string): Promise<void> {
  const data = JSON.parse(json)
  await db.transaction('rw', db.pages, db.maps, db.pins, async () => {
    await Promise.all([db.pages.clear(), db.maps.clear(), db.pins.clear()])
    if (data.pages) await db.pages.bulkAdd(data.pages)
    if (data.maps) await db.maps.bulkAdd(data.maps)
    if (data.pins) await db.pins.bulkAdd(data.pins)
  })
}
