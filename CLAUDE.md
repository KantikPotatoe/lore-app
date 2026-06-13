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

The single source of truth for everything: TypeScript interfaces, the Dexie schema, all CRUD helpers, infobox templates, category definitions, and backup (export/import) functions. When touching data concerns, start here.

Key types:
- `LorePage` — a wiki article (character, place, event, etc.) with rich-text `content` (HTML), `tags`, a `summary`, and an optional `Infobox`
- `Infobox` / `InfoboxField` — the wiki-style sidebar card; fields are seeded from `INFOBOX_TEMPLATES` but are fully customisable per page
- `WorldMap` — an uploaded image stored as a data URL
- `MapPin` — a lat/lng point on a map, optionally linked to a `LorePage`

`CATEGORIES` (with accent colors) and `INFOBOX_TEMPLATES` (starter field labels per category) are both defined in `db.ts` — add new ones there.

`useLiveQuery` from `dexie-react-hooks` is used throughout the UI for reactive reads; changes to IndexedDB automatically re-render components.

### Routing — `src/App.tsx`

Three routes inside a persistent `<Sidebar>` + `<main>` shell:

| Path | Component | Purpose |
|---|---|---|
| `/` | `HomeRoute` | Dashboard: recent pages, stats, export/import |
| `/page/:id` | `PageRoute` | Full page view/edit with infobox |
| `/map` | `MapRoute` | Leaflet map with pins |

### Rich text editor — `src/components/LoreEditor.tsx` + `src/extensions/WikiLink.ts`

`LoreEditor` wraps Tiptap (`StarterKit` + custom `WikiLink` extension). The `WikiLink` node converts `[[Page Title]]` typed in the editor into an inline link. In view mode, clicking a wiki link calls `getOrCreatePageByTitle()` and navigates to that page (creating it if it doesn't exist). In edit mode, Ctrl/Cmd-click follows the link.

### Map view — `src/components/MapView.tsx`

Uses Leaflet with a custom CRS so the uploaded image fills the map bounds. Pins are stored in `db.pins` and can be linked to a lore page.

### Infobox — `src/components/Infobox.tsx`

Rendered in the right-hand aside of `PageRoute`. Supports an image (stored as a data URL), a caption, and a list of label/value fields. The template picker (`applyTemplate` in `db.ts`) swaps field presets while preserving any values already entered.

### Backup

`exportAll()` / `importAll()` in `db.ts` serialise the entire database to/from a JSON file. Import replaces all existing data — there is no merge.
