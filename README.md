# Lore Codex

A personal worldbuilding app to write, link, and map the lore of your fictional
worlds — inspired by World Anvil and LoreKeeper. Everything is stored **locally
in your browser** (no account, no server, works offline).

## Features

- **Multiple worlds** — keep separate, fully isolated worlds and switch between
  them from the world picker. Each world is its own local database, so nothing
  bleeds across; create, rename, set a banner, or delete worlds at any time.
- **Lore pages** — rich-text articles for characters, countries, places, factions,
  items, events, and more, organized by category.
- **Page types & templates** — every page has a type (a named, colour-coded
  category with starter infobox rows). Use the built-in types or define your own
  on the Templates screen; switching a page's type preserves the values you've
  already filled in.
- **Infoboxes** — a sidebar card per page with an image, caption, and typed fields
  (text, numbers, and `[[reference]]` links to other pages), plus separator
  headings to group them.
- **Wiki links** — type `[[Page Name]]` while editing to create a clickable link to
  another page. Clicking it navigates there (or asks before creating the page if it
  doesn't exist yet). Renaming a page automatically rewrites every reference to it so
  no links break; dead links are visually flagged.
- **Backlinks & table of contents** — each page shows which other pages link to it,
  plus an auto-generated table of contents built from the article's headings.
- **External links** — select text and use the link toolbar button to attach an
  external URL; opens in a new tab.
- **Inline images & tables** — insert images (stored as data URLs, no upload) and
  editable tables directly into article bodies for stat blocks and comparisons.
- **Per-page image gallery** — attach a grid of images to a page, view them in a
  lightbox, reorder them, and promote any one to the page's portrait.
- **Interactive maps** — upload a map image of your world and drop pins, each
  linkable to a lore page. Draw regions as polygons, nest maps inside one another,
  and use the find panel to jump between maps and pins.
- **Relationship graph** — a force-directed graph of every page and the wiki links
  between them; node size reflects how connected a page is, and the view surfaces
  hubs and orphans.
- **Timeline & calendars** — define custom calendars (months, eras, year lengths)
  and place events on a shared timeline, viewable as a list or a zoomable axis.
  Different calendars share one absolute-day axis so their events line up.
- **Full-text search** — click the sidebar search box to open a search modal that
  searches across page titles, summaries, tags, and body content. Results appear
  with highlighted snippets; navigate with the keyboard (↑↓ Enter) or click, close
  with Escape.
- **Wiki link hover previews** — hover a `[[wiki link]]` in view mode to see a
  floating card showing the linked page's category, title, and summary (or "Page
  not found" for broken links).
- **Auto-snapshots** — the app automatically saves up to 10 local snapshots
  (triggered after ~50 record changes or 24 hours of activity). Restore any
  snapshot from the Home screen using the same safe confirm-before-import flow as a
  manual backup restore.
- **Export as HTML** — download a self-contained ZIP of your entire wiki as a
  browsable static site: an index grouped by category, one page per article with
  infobox, images, and resolved wiki links, and a stylesheet.
- **Backup & safety** — export everything to a JSON file and re-import it anytime
  (Home screen). Home and the top banner track how many edits have happened since
  your last backup and highlight when one is overdue. Import validates the file,
  shows a count of what will be replaced, requires confirmation, and automatically
  writes a pre-import recovery backup before applying any changes. Older backups are
  migrated forward to the current schema on import.

## Running it

You need [Node.js](https://nodejs.org) installed. First time only:

```bash
npm install      # downloads dependencies
```

After that, **double-click `start-lore-codex.cmd`** to launch. It opens
Firefox at `http://localhost:5174` and starts the app. Tip: right-click the
file → *Pin to Start* (or send a desktop shortcut) so it launches like an app.

> **Always launch this way.** Your lore is stored in Firefox under the exact
> address `localhost:5174`. Opening a *different* browser, or a different port,
> shows a *different* (empty) database — your data isn't gone, it's just tied to
> the original address. The launcher and the pinned port (`vite.config.ts`)
> guarantee you always return to the same place.

Other commands:

```bash
npm run dev      # start the app manually (also on port 5174)
npm run build    # type-check and produce an optimized build in dist/
npm run preview  # preview the production build locally (port 5174)
npm run lint     # ESLint
npm run test:run # run the test suite once (Vitest)
```

## Where things live

```
src/
  db/                    Data layer (single source of truth), behind a barrel index.ts:
    types.ts             Data-model interfaces
    schema.ts            Dexie schema, version ladder, db singleton
    templates.ts         Page types: built-ins, seeding, template CRUD
    pages.ts             Page CRUD, rename link-rewriting, backlinks
    maps.ts              Maps / pins / regions CRUD
    images.ts            Per-page image gallery CRUD
    graph.ts             Relationship-graph builder
    calendar.ts          Timeline calendar / event CRUD
    snapshots.ts         Snapshot CRUD
    backup.ts            Export / import + versioned migrations + sanitization
  loreId.ts              Active-world id + per-world database naming
  lores.ts               World registry + create/rename/delete/switch
  calendar.ts            Pure date math (absolute-day axis, eras, formatting)
  search.ts              FlexSearch full-text index + incremental sync
  htmlExport.ts          HTML static-site export (JSZip)
  sanitize.ts            DOMPurify whitelist for imported / raw-rendered HTML
  html.ts                Shared HTML parsing helpers
  backup.ts              Download/import helpers + backup-overdue tracking
  snapshots.ts           Auto-snapshot trigger logic
  storageError.ts        IndexedDB quota detection + notice bus
  wikiLinkHover.ts       Event bus for wiki link hover state
  main.tsx               App entry + ErrorBoundary
  App.tsx                Hash routing, layout shell, global overlays + wiring
  routes/
    LoreSelectorRoute.tsx  World picker (no shell)
    HomeRoute.tsx          Dashboard + snapshots + backup
    PageRoute.tsx          View / edit a lore page
    CategoryRoute.tsx      Image grid for a category
    MapRoute.tsx           Maps, pins, regions
    GraphRoute.tsx         Relationship graph
    TimelineRoute.tsx      Timeline (list / axis)
    TemplatesRoute.tsx     Manage page-type templates
  components/
    Sidebar.tsx            Navigation, page list, search trigger
    LoreEditor.tsx         Rich-text editor (TipTap) with toolbar
    Infobox.tsx            Page sidebar card with typed fields
    Backlinks.tsx          "What links here" panel
    TableOfContents.tsx    Auto TOC from page headings
    ImageGallery.tsx       Per-page image grid
    Lightbox.tsx           Fullscreen image viewer
    MapView.tsx            Leaflet map rendering + pins + regions
    GraphView.tsx          Force-directed graph rendering
    TimelineVertical.tsx   Timeline list view
    TimelineHorizontal.tsx Timeline zoomable axis
    CalendarEditor.tsx     Calendar definition modal
    EventEditor.tsx        Timeline event modal
    SearchModal.tsx        Full-text search overlay with keyboard navigation
    WikiLinkPopover.tsx    Hover preview card for wiki links
    ErrorBoundary.tsx      Top-level crash recovery screen
  extensions/
    WikiLink.ts            The [[wiki link]] editor feature
  index.css                The full theme (colors are CSS variables at the top)
```

## Tech

React + TypeScript + Vite · TipTap (editor) · Leaflet + leaflet-draw (maps) ·
react-force-graph-2d (graph) · Dexie (storage) · FlexSearch (full-text search) ·
DOMPurify (sanitization) · JSZip (HTML export). Tested with Vitest.

## A note on backups

Because your lore is stored in this browser under `localhost:5174`, clearing site
data, switching browsers, or opening a different address shows an empty database.
Always launch with `start-lore-codex.cmd`, and **use Export backup regularly** —
keep the JSON files somewhere safe (or commit them to a private repo). Each world
is a separate database, so back up each world you care about.

The app tracks how many edits have occurred since your last backup and turns the
banner red when a backup is overdue. Import is safe: it validates the file, shows
you exactly how much you're replacing with what, downloads a recovery backup of the
current state first, and only then applies the import.
