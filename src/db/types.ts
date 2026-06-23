// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------
// Everything you write is stored locally in your browser (IndexedDB) via Dexie.
// Nothing leaves your machine. Use the Export button to make backup files.
//
// This module is pure type declarations — no runtime code — so any layer can
// import it without pulling in Dexie or the db singleton.

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
 *  Which fields appear is seeded from a template (see BUILTIN_TEMPLATES). */
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
  /** Optional single emoji shown in the card header and axis block. */
  icon?: string
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
  icon?: string // optional emoji shown on map pins for this type
  items: TemplateItem[]
  builtin: boolean // true for the shipped starter templates
}

/** A small key/value row for app settings like "when did we last back up". */
export interface MetaEntry {
  key: string
  value: unknown
}

/** A point-in-time export kept as automatic local version history. */
export interface Snapshot {
  id?: number
  timestamp: number
  editCount: number   // distinct pages changed since the previous snapshot
  data: string        // raw exportAll() JSON
}
