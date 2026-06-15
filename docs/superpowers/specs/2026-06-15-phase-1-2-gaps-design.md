# Phase 1/2 Gap Closure — Design Spec

**Date:** 2026-06-15
**Scope:** Four unimplemented features from the Phase 1/2 roadmap

---

## Background

The roadmap audit revealed four gaps remaining from Phase 1 and Phase 2. These are the only items blocking a complete v1 feature set (hierarchical folders were deliberately descoped — the category system is sufficient). The relationship graph (Phase 3) is already shipped.

The four gaps:
1. Full-text search (body content, not just metadata)
2. Hover previews on wiki links
3. HTML export
4. Auto-snapshots

---

## 1. Full-text search

### Problem
The sidebar search filters by title, summary, category, and tags. Body content — where most of the writing lives — is invisible to search.

### Solution
Replace the sidebar's inline filter with a **search modal** triggered by the existing search input or `Ctrl+K`.

**Index:** FlexSearch, built in memory on app start from all Dexie pages (body HTML stripped to plain text). Updated per-page on every save. No persistence — rebuilding from IndexedDB on load is fast enough for local data.

**Fields indexed (with weight):**
- Title — high
- Tags — medium
- Summary — medium
- Body (plain text, HTML stripped) — lower

**Result format:** Flat list — each entry shows page title, category chip, and a short text snippet with the matched phrase highlighted.

**Why a modal (not extending the sidebar filter):** Full-text results don't fit the category-grouped sidebar layout. A flat modal result list avoids mixing results into the wrong category group.

**Navigation:** Clicking a result navigates to the page and closes the modal. The sidebar category grouping is unchanged for browsing.

---

## 2. Hover previews on wiki links

### Problem
Hovering a `[[Page Title]]` link does nothing. Users must click through to see what a page is about.

### Solution
A floating card appears after a ~300ms hover delay on any wiki link, in both view and edit mode.

**Card contents:**
- Page title
- Category color chip
- Summary (if present)
- "Page not found" indicator for broken links (targets that don't exist)

**Positioning:** Above or below the link depending on available viewport space. Dismisses when the cursor leaves both the link and the card.

**Implementation:** A single shared `WikiLinkPopover` component at the app root (in `App.tsx`). The WikiLink TipTap extension and `WikiText.tsx` fire `onMouseEnter`/`onMouseLeave` events updating a shared `hoveredLink` state (title + anchor bounding rect). The popover reads that state, fetches via `findPageIdByTitle()` + Dexie lookup, and positions itself with `getBoundingClientRect()` + `position: fixed`.

No external positioning library — `getBoundingClientRect()` is sufficient for this case.

---

## 3. HTML export

### Problem
Export is JSON only. There is no human-readable, shareable format for a world.

### Solution
A **"Export as HTML"** button on the Home screen generates a self-contained static site and downloads it as a `.zip` file via `JSZip`.

**Bundle structure:**
```
index.html          — all pages listed by category, linked to page files
pages/<id>.html     — one file per page
style.css           — minimal stylesheet
```

**Per-page file contains:** title, category, infobox (rendered as HTML table), rich-text body, backlinks section.

**Wiki links:** `[[Title]]` links are rewritten to relative `href` links pointing to `pages/<id>.html`. Broken links (target doesn't exist) become a `<span>` rather than `<a>`, matching the app's `.is-broken` treatment.

**Images:** Inlined as data URLs — no external assets, the zip is fully self-contained and works offline.

**Out of scope:** Map pins and the map image. The Leaflet map doesn't translate cleanly to static HTML; the primary export value is wiki content.

---

## 4. Auto-snapshots

### Problem
Snapshots are manual downloads only. No history, no in-app restore, nothing automatic.

### Solution
Automatic snapshots stored in IndexedDB, with a restore flow on the Home screen.

**New Dexie table:** `snapshots` — each row stores a full `exportAll()` JSON payload, a timestamp, and an edit-count watermark. Added via a schema migration.

**Trigger logic** (checked after every page save and once on app start):
- Snapshot if **≥50 edits** since the last snapshot, OR
- **≥24 hours** since the last snapshot and at least 1 edit has been made

**Retention:** Keep the last 10 snapshots. On each new snapshot, delete the oldest if count exceeds 10.

**UI:** A "Snapshots" section on the Home screen lists stored snapshots (timestamp + edit count). Each row has a **Restore** button that:
1. Shows a `ConfirmDialog` with current-vs-snapshot counts
2. Calls `downloadPreImportBackup()` for a safety download
3. Calls `importAll()` to restore

**No manual "take snapshot now" button** — snapshots are fully automatic. The existing manual backup download is unchanged and still the recommended path for off-device copies.

---

## Implementation order

1. Auto-snapshots — self-contained, touches only `db.ts`, `backup.ts`, and `HomeRoute.tsx`
2. Full-text search — touches `db.ts` (index build/update), new modal component, sidebar trigger
3. Hover previews — touches `WikiLink.ts`, `WikiText.tsx`, new `WikiLinkPopover` component, `App.tsx`
4. HTML export — touches `HomeRoute.tsx`, new `htmlExport.ts` utility, adds `JSZip` dependency

Each is independently shippable.
