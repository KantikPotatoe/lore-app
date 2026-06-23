# CLAUDE.md

Guidance for Claude Code working in this repo.

## Models

- **Opus** — planning/design only.
- **Sonnet** — default for coding/edits.
- **Haiku** — only when explicitly deemed necessary (cheap, mechanical work).

## Commands

```bash
npm run dev        # Vite dev server (hot reload)
npm run build      # tsc -b + vite build → dist/
npm run lint       # ESLint
npm run preview    # serve built dist/
npm test           # Vitest (watch)
npm run test:run   # Vitest (CI, one-shot)
```

- **Port is pinned to 5174** (`strictPort` in `vite.config.ts`; `start-lore-codex.cmd` opens Firefox there). IndexedDB is keyed to origin, so a drifting port shows an empty DB and looks like lost data. Change it in **both** places or neither.
- TS is `strict`. CI (`.github/workflows/ci.yml`) runs lint + build + test on PRs/pushes to `main`. Run all three before claiming done.
- Tests: Vitest + happy-dom + fake-indexeddb. **DOMPurify tests need jsdom** — add `// @vitest-environment jsdom` (happy-dom's parser lets `<script>` survive). `*.test.{ts,tsx}`.

## Architecture

**Lore Codex** — a local-first worldbuilding wiki, entirely in-browser. All data in IndexedDB via Dexie; nothing leaves the machine. `useLiveQuery` (dexie-react-hooks) for reactive reads throughout.

### Data layer — `src/db/`

Single source of truth: types, Dexie schema, all CRUD, templates, backlinks, graph, export/import. Start here for data work. Split into modules behind a **barrel `index.ts` that re-exports everything** — always import from `'../db'`/`'./db'`, and **re-export any new public API from `index.ts`** (`barrel.test.ts` fails if a re-export is dropped).

| Module | Holds |
|---|---|
| `types.ts` | data-model interfaces (no runtime code) |
| `schema.ts` | `LoreDB` class + version ladder + `db` singleton, `getMeta`/`setMeta`, category/status defs, `uid()`/`now()` |
| `templates.ts` | page types: built-ins, seeding, infobox/template CRUD |
| `pages.ts` | page CRUD, `renamePage` link-rewriting, backlinks |
| `maps.ts` | maps/pins CRUD + `pinType` |
| `graph.ts` | `buildGraphData` |
| `calendar.ts` | timeline calendar/event CRUD (distinct from pure `src/calendar.ts`) |
| `backup.ts` | `exportAll`/`importAll`/`parseBackup` + versioning + import sanitization |
| `snapshots.ts` | snapshot CRUD |

**Per-lore DB:** `db = new LoreDB(dbNameFor(currentLoreId()))` is bound at module load, so the active world is fixed for the page's lifetime. `switchLore()` and deleting the active world `window.location.reload()` to rebind it.

**Key types:** `LorePage` (rich-text HTML `content`, `summary`, `tags`, `status`, optional `Infobox`) · `Infobox`/`InfoboxField` (sidebar card; `kind:'separator'` = heading; `fieldType:'text'|'ref'|'number'`, `'ref'` stores `[[Title]]` tokens bound to `refType`) · `InfoboxTemplate`/`TemplateItem` (a **page type**: named coloured category + starter rows) · `WorldMap` · `MapPin` · `Calendar`/`CalendarMonth`/`CalendarEra` · `TimelineEvent` (in-world date + cached `startAbsolute`/`endAbsolute`) · `Snapshot` · `MetaEntry` (Dexie schema **v5**) · `Lore` (in `src/lores.ts`, separate `lore-registry` DB).

**Notable helpers (in `src/db/`):** `BUILTIN_TEMPLATES`, `DEFAULT_CATEGORY`, `TYPE_COLORS`, `STATUSES` + `pageStatus()`/`statusColor()`. Page types are DB-backed: `seedTemplates()` (on start) reconciles built-ins (adds missing, removes dropped built-ins, backfills colours; leaves custom types alone); CRUD `getTemplates`/`createTemplate`/`updateTemplate`/`deleteTemplate`/`resetTemplate`; `applyTemplate()` swaps rows preserving values. `categoryColor()` reads a `liveQuery`-synced cache. `getBacklinks()`/`linkedTitles()` scan body `<a data-wikilink>` + infobox `[[…]]` (via `src/html.ts`). `renamePage(id, title)` atomically rewrites all references, throws on title clash. `findPageIdByTitle()` is **resolve-only** (no auto-create — callers confirm before creating). Calendar/event mutations recompute cached absolute days and cascade-delete on calendar removal.

### Routing — `src/App.tsx` (hash routing)

`/` is special-cased: full-screen `LoreSelectorRoute`, no shell. Every other path renders in the `<Sidebar>` + `<main>` shell with `<BackupBanner>` + `<StorageErrorBanner>`. `App.tsx` mounts global overlays (`SearchModal`, `WikiLinkPopover`), drives the incremental search index (`liveQuery` on `db.pages` → `syncIndex()`), and on start runs `installStorageErrorListener`, `bootstrapDefaultLore`, `requestPersistentStorage`, `seedTemplates`, `seedDefaultCalendar`, `maybeTakeSnapshot`.

| Path | Component | Purpose |
|---|---|---|
| `/` | `LoreSelectorRoute` | world picker (create/rename/banner/delete/switch), no shell |
| `/home` | `HomeRoute` | editable overview: hero/about, stats, recent, snapshots, backup |
| `/page/:id` | `PageRoute` | view/edit: header, editor, infobox, backlinks |
| `/browse/:category` | `CategoryRoute` | image grid for a category |
| `/map` | `MapRoute` | Leaflet map with pins |
| `/graph` | `GraphRoute` | force-directed relationship graph |
| `/timeline` | `TimelineRoute` | timeline (list or axis view) |
| `/templates` | `TemplatesRoute` | manage page-type templates |

Sidebar groups pages by category (headers link to `/browse/:category`); its search box is read-only and opens `SearchModal` on focus.

### Multiple worlds — `src/loreId.ts` + `src/lores.ts`

Each world is its own IndexedDB. `loreId.ts`: `currentLoreId()` (from `localStorage`, default `'default'`), `dbNameFor(id)` (`'lore-app'` / `'lore-app-<id>'`). `lores.ts` owns the `lore-registry` DB + world CRUD (`createLore`/`renameLore`/`setLoreBanner`/`deleteLore`/`switchLore`); `bootstrapDefaultLore()` registers `'default'` on first run.

### Rich text — `src/components/LoreEditor.tsx` + `src/extensions/WikiLink.ts`

Tiptap with `StarterKit` (Link → external `ext-link`, new tab), `WikiLink` (`[[Page Title]]` inline node, `data-wikilink`/`data-title`), `Image` (data-URL inline), `TableKit` (resizable). View mode: clicking a wiki link resolves via `findPageIdByTitle()`, **confirms before creating** a missing stub (broken targets get `.is-broken`). Edit mode: Ctrl/Cmd-click follows links. Hover → `wikiLinkHover.ts` bus (suppressed in edit mode).

### Timeline & calendars — `src/calendar.ts` + `TimelineRoute`

`calendar.ts` is **pure date math** (no React/Dexie): `dateToAbsolute()`/`absoluteToDate()` map to a shared absolute-day integer so different calendars share one axis (no leap rules; `yearLength` = sum of months); plus `eraForYear()`, `formatDate()`. Events cache `startAbsolute`/`endAbsolute`, recomputed on event/calendar change (`updateCalendar()` rewrites all its events in one tx). `TimelineRoute` → `TimelineVertical` (list) / `TimelineHorizontal` (zoom/pan axis); `CalendarEditor`/`EventEditor` modals.

### Relationship graph — `GraphView.tsx` + `GraphRoute`

`buildGraphData(pages)` → nodes+links: each page a node (lone pages = isolated dots, intentional), resolved wiki link = edge, self-links dropped, A↔B collapses to one undirected edge, `degree` drives size. **Runs on demand in `GraphRoute`'s `useMemo`** (not per-save). Filtering clones nodes/links (the force sim mutates them); derives `hubs`/`orphans`.

### Page right sidebar — `Infobox.tsx`, `TableOfContents.tsx`, `Backlinks.tsx`

Sticky `.page-aside` with: **TOC** (scans `h2`/`h3` post-render, slugifies ids, shown only if >3 headings, `IntersectionObserver` active-section) · **Infobox** (image/caption/fields; `applyTemplate()` preserves values; empty separators hidden in view; `[[links]]` via `WikiText.tsx`; typed-field editors branch only in edit mode — `RefField.tsx` for `ref`, numeric input for `number`) · **Backlinks**.

### Search — `src/search.ts` + `SearchModal.tsx`

FlexSearch `Index` (tokenize `'forward'`, res 5), synced on every `db.pages` change. **Incremental:** `buildIndex()` does the first full build, then `syncIndex(pages)` applies only deltas — unchanged pages (matched by `updatedAt`) skip the costly `stripHtml` parse; new=add, changed=update, gone=remove (~100ms→~0.4ms at 500 pages). `searchPages(query)` → ≤20 results with a snippet; `highlightSnippet()` marks the first query word. `SearchModal` is a full-screen overlay (keyboard nav).

### Sanitization & resilience

- **HTML sanitization (`src/sanitize.ts`):** `sanitizeHtml()` runs DOMPurify with an explicit whitelist of the tags/attrs Tiptap emits (blocks/marks, `data-wikilink` + `ext-link` anchors, `data:` URL images, tables). Applied **on import** (`importAll()` scrubs page `content` + event `description` — the boundary where untrusted backups enter) **and** at the one raw render sink (`TimelineVertical`'s `dangerouslySetInnerHTML`). Page bodies render through Tiptap (rebuilt from schema, inherently safe); plain-text fields are React-escaped.
- **Crash recovery (`src/components/ErrorBoundary.tsx`):** wraps the tree in `main.tsx` (outside the router). Fallback is a recovery screen whose first action is "Download a backup", plus reload + technical details.
- **Quota surfacing (`src/storageError.ts`):** React-free bus + `isQuotaError()` (cross-browser); `installStorageErrorListener()` hooks `window` `unhandledrejection` (where fire-and-forget Dexie writes land) and raises a one-time notice via `StorageErrorBanner`.

### Backup & data safety — `src/db/backup.ts` + `src/backup.ts`

`exportAll()`/`importAll()` serialise the whole DB to/from JSON. **Import replaces all data** (no merge); guarded by `parseBackup()` (validates + returns `counts` *before* any `clear()`); older backups re-seed built-ins after import. Home import shows counts, writes `downloadPreImportBackup()` first, then imports.

**Versioned exports:** payload stamps `schemaVersion` (`CURRENT_SCHEMA_VERSION`, mirrors Dexie store version) + `appVersion`. `parseBackup()` runs `migrateBackup()` (a `MIGRATIONS` ladder) up to current shape; no version ⇒ legacy v1. **When the exported shape changes, bump `CURRENT_SCHEMA_VERSION` and add a `MIGRATIONS` step.** `importAll()` coerces tables to arrays defensively.

`src/backup.ts` (storage helpers): `downloadBackup`, `downloadPreImportBackup`, `requestPersistentStorage`, and the change-tracking that drives `BackupBanner`/Home overdue state (covers pages, maps, events). **Backups stay download-based** (Firefox lacks the File System Access API).

### Other

- **Auto-snapshots (`src/snapshots.ts`):** `maybeTakeSnapshot()` snapshots when ≥50 records changed or ≥24h passed with ≥1 change; keeps 10 most recent. Called on start + after each edit session.
- **HTML export (`src/htmlExport.ts`):** `exportAsHtml()` builds a JSZip site (`index.html` + `pages/<id>.html` + `style.css`); wiki links rewritten to file paths.
- **Shared HTML (`src/html.ts`):** `parseHtml()`, `stripHtml()`, `wikiLinkTitles()` — use these instead of re-parsing per call site.
- **Wiki hover (`src/wikiLinkHover.ts` + `WikiLinkPopover.tsx`):** debounced module bus; popover fetches the hovered page and renders a floating card.
