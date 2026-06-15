# Lore Codex

A personal worldbuilding app to write, link, and map the lore of your fictional
worlds — inspired by World Anvil and LoreKeeper. Everything is stored **locally
in your browser** (no account, no server, works offline).

## Features

- **Lore pages** — rich-text articles for characters, countries, places, factions,
  items, events, and more, organized by category.
- **Wiki links** — type `[[Page Name]]` while editing to create a clickable link to
  another page. Clicking it navigates there (or asks before creating the page if it
  doesn't exist yet). Renaming a page automatically rewrites every reference to it so
  no links break; dead links are visually flagged.
- **External links** — select text and use the link toolbar button to attach an
  external URL; opens in a new tab.
- **Inline images** — insert images directly into article bodies via the toolbar;
  stored as data URLs (no upload).
- **Tables** — insert and edit tables in article bodies for stat blocks, timelines,
  and comparisons.
- **Interactive maps** — upload a map image of your world and drop pins. Each pin
  can be linked to a lore page.
- **Full-text search** — click the sidebar search box to open a search modal that searches across page titles, summaries, tags, and body content. Results appear with highlighted snippets; navigate with keyboard (↑↓ Enter) or click. Close with Escape.
- **Wiki link hover previews** — hover a `[[wiki link]]` in view mode to see a floating card showing the linked page's category, title, and summary (or "Page not found" for broken links).
- **Auto-snapshots** — the app automatically saves up to 10 local snapshots (triggered after 50 page edits or 24 hours of activity). Restore any snapshot from the Home screen using the same safe confirm-before-import flow as a manual backup restore.
- **Export as HTML** — download a self-contained ZIP of your entire wiki as a browsable static site: an index grouped by category, one page per article with infobox and resolved wiki links, and a stylesheet.
- **Backup & safety** — export everything to a JSON file and re-import it anytime
  (Home screen). Home and the top banner track how many edits have happened since
  your last backup and highlight when one is overdue. Import validates the file,
  shows a count of what will be replaced, requires confirmation, and automatically
  writes a pre-import recovery backup before applying any changes.

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
```

## Where things live

```
src/
  db.ts                  Data model + local database (Dexie/IndexedDB) + backup
  backup.ts              Download/import helpers + backup-overdue tracking
  snapshots.ts           Auto-snapshot trigger logic
  search.ts              FlexSearch full-text index + query helpers
  htmlExport.ts          HTML static-site export (JSZip)
  wikiLinkHover.ts       Event bus for wiki link hover state
  main.tsx               App entry + routing
  App.tsx                Layout shell + search/snapshot wiring
  components/
    Sidebar.tsx          Navigation, page list, search trigger
    LoreEditor.tsx       Rich-text editor (TipTap) with toolbar
    SearchModal.tsx      Full-text search overlay with keyboard navigation
    WikiLinkPopover.tsx  Hover preview card for wiki links
    MapView.tsx          Leaflet map rendering + pins
  extensions/
    WikiLink.ts          The [[wiki link]] editor feature
  routes/
    HomeRoute.tsx        Dashboard + snapshots + backup
    PageRoute.tsx        View / edit a lore page
    MapRoute.tsx         Upload maps, place pins
  index.css              The full theme (colors are CSS variables at the top)
```

## Tech

React + TypeScript + Vite · TipTap (editor) · Leaflet (maps) · Dexie (storage) · FlexSearch (full-text search) · JSZip (HTML export).

## A note on backups

Because your lore is stored in this browser under `localhost:5174`, clearing site
data, switching browsers, or opening a different address shows an empty database.
Always launch with `start-lore-codex.cmd`, and **use Export backup regularly** —
keep the JSON files somewhere safe (or commit them to a private repo).

The app tracks how many edits have occurred since your last backup and turns the
banner red when a backup is overdue. Import is safe: it validates the file, shows
you exactly how many pages/maps/pins you're replacing with what, downloads a
recovery backup of the current state first, and only then applies the import.
