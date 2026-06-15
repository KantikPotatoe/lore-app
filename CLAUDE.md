# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server (Vite, hot reload)
npm run build    # type-check then bundle to dist/
npm run lint     # ESLint
npm run preview  # serve the built dist/ locally
```

The dev/preview server is **pinned to port 5174** (`strictPort` in `vite.config.ts`)
and launched via `start-lore-codex.cmd`, which always opens Firefox at
`http://localhost:5174`. This is deliberate: IndexedDB is keyed to the origin, so a
drifting port would present an empty database and make saved lore look lost. Do not
change the port in one place without changing it in the other.

There are no automated tests in this project.

## Architecture

**Lore Codex** is a local-first worldbuilding wiki that runs entirely in the browser. All data is stored in IndexedDB via Dexie — nothing is sent to a server.

### Data layer — `src/db.ts`

The single source of truth: TypeScript interfaces, the Dexie schema, all CRUD helpers, infobox templates, category/status definitions, backlink computation, and export/import. When touching data concerns, start here.

Key types:
- `LorePage` — a wiki article with rich-text `content` (HTML), `summary`, `tags`, a `status`, and an optional `Infobox`
- `Infobox` / `InfoboxField` — the wiki-style sidebar card; fields are seeded from a template but fully customisable per page. A field with `kind: 'separator'` is a full-width section heading (its `label` is the heading; `value` is unused). A field can also be **typed** via `fieldType: 'text' | 'ref' | 'number'` (absent ⇒ `'text'`): a `'ref'` field links to pages of the type named in `refType` and stores them as `[[Title]]` tokens in `value` (so backlinks/graph need no special handling) — the edit UI uses `RefField.tsx` to search/create pages of that type; a `'number'` field stores a numeric string
- `InfoboxTemplate` / `TemplateItem` — a **page type**: a named, coloured category (`color`) plus an ordered list of starter infobox rows (fields or separators). A `TemplateItem` carries the same optional `fieldType`/`refType`, so a type declares each field's kind (set per row on the Templates screen). Stored in the `templates` table and editable from the Templates screen. A page's `category` is the name of a template; choosing a type also seeds its infobox
- `WorldMap` — an uploaded image stored as a data URL
- `MapPin` — a lat/lng point on a map, optionally linked to a `LorePage`
- `MetaEntry` — key/value app settings (e.g. last-backup time); Dexie schema is at **v3**

Defined here (add new ones here): `BUILTIN_TEMPLATES` (the ~19 shipped page types — name, colour, and starter rows, several with separators already placed), `DEFAULT_CATEGORY` (the type a new page starts as), `TYPE_COLORS` (palette for the colour picker), `STATUSES` (Stub/Draft/WIP/Complete) with `pageStatus()`/`statusColor()`. `CATEGORIES` is now just the built-in colour fallback. Page types are DB-backed: `seedTemplates()` (called on app start) reconciles the table with the shipped built-ins — adds missing ones, **removes built-ins no longer shipped** (your custom types are left alone), and backfills colours without overwriting edits; `getTemplates()`/`createTemplate()`/`updateTemplate()`/`deleteTemplate()`/`resetTemplate()` are the CRUD helpers, and `applyTemplate()` swaps a page's infobox rows while preserving entered values. `categoryColor()` reads a synchronous cache kept in sync with the `templates` table via a `liveQuery` subscription, so a type's colour updates everywhere instantly. `getBacklinks()`/`linkedTitles()` compute reverse links by scanning each page's body `<a data-wikilink>` anchors and infobox `[[…]]` values. `renamePage(id, newTitle)` renames a page **and** atomically rewrites every reference to the old title across all other pages (body anchors + infobox `[[…]]` tokens), throwing if the new title clashes with an existing page. `findPageIdByTitle(title)` is resolve-only (no auto-creation); callers that want to create a missing page must confirm explicitly.

`useLiveQuery` from `dexie-react-hooks` is used throughout for reactive reads; IndexedDB changes auto-re-render components.

### Routing — `src/App.tsx`

All routes live inside a persistent `<Sidebar>` + `<main>` shell with a `<BackupBanner>`.

| Path | Component | Purpose |
|---|---|---|
| `/` | `HomeRoute` | Customisable overview: editable hero/about, wiki stats (by type & status), recent pages, backup & safety |
| `/page/:id` | `PageRoute` | Page view/edit: header (title/category/status), editor, infobox, backlinks |
| `/browse/:category` | `CategoryRoute` | Image grid of all pages in a category; clicking the category header in the sidebar navigates here |
| `/map` | `MapRoute` | Leaflet map with pins |
| `/templates` | `TemplatesRoute` | Manage infobox templates: add/rename/delete, edit & reorder field/separator rows |

The sidebar lists pages grouped by category; category headers are `<Link>`s to `/browse/:category`.

### Rich text editor — `src/components/LoreEditor.tsx` + `src/extensions/WikiLink.ts`

`LoreEditor` wraps Tiptap with these extensions: `StarterKit` (with Link configured for external URLs — opens in new tab, `ext-link` styling, kept distinct from `WikiLink`), `WikiLink` (custom extension for `[[Page Title]]` wiki links), `Image` (inline body images stored as data URLs), and `TableKit` (tables with resizable columns).

The `WikiLink` node converts `[[Page Title]]` text into an inline link. In view mode, clicking a wiki link resolves via `findPageIdByTitle()` and navigates to the page — if the page doesn't exist it **confirms before creating a stub** (no silent auto-creation); missing targets render with `.is-broken` styling. In edit mode, Ctrl/Cmd-click follows the link. External `href` links also require Ctrl/Cmd-click in edit mode and open in a new tab in view mode.

### Map view — `src/components/MapView.tsx`

Uses Leaflet with a custom CRS so the uploaded image fills the map bounds. Pins are stored in `db.pins` and can be linked to a lore page.

### Page right sidebar — `src/components/Infobox.tsx`, `TableOfContents.tsx`, `Backlinks.tsx`

The `.page-aside` is a sticky scrollable column (`position: sticky; max-height: calc(100vh - 32px); overflow-y: auto`) containing three stacked elements:

1. **TableOfContents** — scans `h2`/`h3` tags in `.page-main` after render (`setTimeout(0)`), injects slugified `id` attributes, and renders a Contents nav. Only shown when there are more than 3 headings. Active section tracked via `IntersectionObserver`; clicking entries smooth-scrolls. Re-scans whenever `pageId` changes.
2. **Infobox** — wiki-style sidebar card: image (data URL), caption, and label/value fields seeded from a template but fully customisable. `applyTemplate()` in `db.ts` swaps rows while preserving entered values. Separators with no filled field beneath are hidden in view mode (`dropEmptySeparators`). Field values support `[[links]]` via `WikiText.tsx`. Typed fields branch only in edit mode: a `ref` field uses the `RefField.tsx` picker (chips + type-filtered search + inline "create page of this type") and a `number` field uses a numeric input; view mode is unchanged since ref values are `[[Title]]` tokens already rendered by `WikiText`.
3. **Backlinks** — lists every page that links here, computed by scanning `<a data-wikilink>` anchors and infobox `[[…]]` values.

### Home overview — `src/routes/HomeRoute.tsx`

The landing page is a customisable wiki overview. A `HomeConfig` (title, tagline, about, and per-section visibility toggles) is stored as a single `meta` row (`home-config`); a "Customize" toggle edits it inline. To avoid rapid edits to different fields clobbering each other through the async live query, the config is loaded once into local `draft` state that acts as the source of truth and is persisted on change. The overview computes counts by type (coloured chips) and by status (segmented bar) from all pages, plus a recent-pages grid.

### Backup & data safety — `src/backup.ts`

`exportAll()` / `importAll()` in `db.ts` serialise the whole DB (pages, maps, pins, and templates) to/from JSON. Import **replaces** all data — no merge; older backups without templates re-seed the built-ins — but is guarded by `parseBackup()` (validates structure and returns `counts` before any `clear()` so an invalid file never corrupts the DB). The Home import flow shows a `ConfirmDialog` with exact current-vs-incoming counts, calls `downloadPreImportBackup()` to write a timestamped recovery file first, then calls `importAll()`.

`backup.ts` provides: `downloadBackup()` (timestamped export, records time in `meta`), `downloadPreImportBackup()` (recovery snapshot before import), `requestPersistentStorage()` (called on app start to avoid browser eviction), `unbackedChangeCount()` / `hasUnbackedUpChanges()` / `isBackupOverdue()` — these drive the edit count display and overdue (red) treatment in `BackupBanner` and Home. Backups remain **download-based** (Firefox lacks the File System Access API for auto-folder writes). Data is browser-local, so off-device backups matter.
