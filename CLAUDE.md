# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server (Vite, hot reload)
npm run build    # type-check then bundle to dist/
npm run lint     # ESLint
npm run preview  # serve the built dist/ locally
```

There are no automated tests in this project.

## Architecture

**Lore Codex** is a local-first worldbuilding wiki that runs entirely in the browser. All data is stored in IndexedDB via Dexie — nothing is sent to a server.

### Data layer — `src/db.ts`

The single source of truth: TypeScript interfaces, the Dexie schema, all CRUD helpers, infobox templates, category/status definitions, backlink computation, and export/import. When touching data concerns, start here.

Key types:
- `LorePage` — a wiki article with rich-text `content` (HTML), `summary`, `tags`, a `status`, and an optional `Infobox`
- `Infobox` / `InfoboxField` — the wiki-style sidebar card; fields are seeded from a template but fully customisable per page. A field with `kind: 'separator'` is a full-width section heading (its `label` is the heading; `value` is unused)
- `InfoboxTemplate` / `TemplateItem` — a **page type**: a named, coloured category (`color`) plus an ordered list of starter infobox rows (fields or separators). Stored in the `templates` table and editable from the Templates screen. A page's `category` is the name of a template; choosing a type also seeds its infobox
- `WorldMap` — an uploaded image stored as a data URL
- `MapPin` — a lat/lng point on a map, optionally linked to a `LorePage`
- `MetaEntry` — key/value app settings (e.g. last-backup time); Dexie schema is at **v3**

Defined here (add new ones here): `BUILTIN_TEMPLATES` (the ~19 shipped page types — name, colour, and starter rows, several with separators already placed), `DEFAULT_CATEGORY` (the type a new page starts as), `TYPE_COLORS` (palette for the colour picker), `STATUSES` (Stub/Draft/WIP/Complete) with `pageStatus()`/`statusColor()`. `CATEGORIES` is now just the built-in colour fallback. Page types are DB-backed: `seedTemplates()` (called on app start) reconciles the table with the shipped built-ins — adds missing ones, **removes built-ins no longer shipped** (your custom types are left alone), and backfills colours without overwriting edits; `getTemplates()`/`createTemplate()`/`updateTemplate()`/`deleteTemplate()`/`resetTemplate()` are the CRUD helpers, and `applyTemplate()` swaps a page's infobox rows while preserving entered values. `categoryColor()` reads a synchronous cache kept in sync with the `templates` table via a `liveQuery` subscription, so a type's colour updates everywhere instantly. `getBacklinks()`/`linkedTitles()` compute reverse links by scanning each page's body `<a data-wikilink>` anchors and infobox `[[…]]` values.

`useLiveQuery` from `dexie-react-hooks` is used throughout for reactive reads; IndexedDB changes auto-re-render components.

### Routing — `src/App.tsx`

Three routes inside a persistent `<Sidebar>` + `<main>` shell:

| Path | Component | Purpose |
|---|---|---|
| `/` | `HomeRoute` | Dashboard: recent pages, stats, backup & safety |
| `/page/:id` | `PageRoute` | Page view/edit: header (title/category/status), editor, infobox, backlinks |
| `/map` | `MapRoute` | Leaflet map with pins |
| `/templates` | `TemplatesRoute` | Manage infobox templates: add/rename/delete, edit & reorder field/separator rows |

`<BackupBanner>` (in the shell) reminds you when there are un-backed-up changes. The sidebar lists pages by category with a status pip on each.

### Rich text editor — `src/components/LoreEditor.tsx` + `src/extensions/WikiLink.ts`

`LoreEditor` wraps Tiptap (`StarterKit` + custom `WikiLink` extension). The `WikiLink` node converts `[[Page Title]]` typed in the editor into an inline link. In view mode, clicking a wiki link calls `getOrCreatePageByTitle()` and navigates to that page (creating it if it doesn't exist). In edit mode, Ctrl/Cmd-click follows the link.

### Map view — `src/components/MapView.tsx`

Uses Leaflet with a custom CRS so the uploaded image fills the map bounds. Pins are stored in `db.pins` and can be linked to a lore page.

### Infobox & backlinks — `src/components/Infobox.tsx`, `Backlinks.tsx`

The infobox is rendered in `PageRoute`'s right-hand aside: an image (data URL), caption, and a mix of label/value fields and full-width separator headings. The template picker / page-type select (`applyTemplate` in `db.ts`) **replaces** the infobox rows with the chosen template's rows — carrying over values for matching labels, but not keeping leftover rows from the old template — and links to `/templates` for editing the templates themselves. Editing a template does **not** auto-rewrite existing pages; the Templates screen offers an explicit "Apply to existing pages" button (`applyTemplateToPages`, value-preserving) for that. Separators with no filled field beneath them are hidden in view mode (`dropEmptySeparators`). Field values support `[[links]]`, rendered via `WikiText.tsx` (the shared helper that turns `[[Name]]` in a plain string into clickable links). Below it, `Backlinks` lists every page that links here.

### Backup & data safety — `src/backup.ts`

`exportAll()` / `importAll()` in `db.ts` serialise the whole DB (pages, maps, pins, and templates) to/from JSON (import **replaces** all data — no merge; older backups without templates re-seed the built-ins). `backup.ts` wraps this with: a timestamped `downloadBackup()` that records the time in the `meta` table, `requestPersistentStorage()` (called on app start) to avoid eviction, and `hasUnbackedUpChanges()` powering the banner and Home status. Data is browser-local, so off-device backups matter.

## Git Usage

Follow Gitflow structures for workflow with git.
