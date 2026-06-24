# Per-Page Image Gallery — Design

**Status:** approved · **Issue:** [#19 Per-page image gallery](https://github.com/KantikPotatoe/lore-app/issues/19) · **Date:** 2026-06-24

## Summary

Let a page hold **multiple images** — reference sheets, alternate portraits, costume
variations, location views — shown as a thumbnail grid below the page body, with a
fullscreen lightbox. This is separate from the single infobox portrait, but a gallery
image can be promoted to that portrait.

## Storage reality (supersedes one acceptance criterion)

Issue #19 asks for images "stored in the project folder, not embedded in JSON as
base64." **This is not achievable in this app's architecture** and that criterion is
reinterpreted, not implemented literally:

- Lore Codex is browser-only; all data lives in IndexedDB via Dexie. There is no
  project folder.
- Firefox lacks the File System Access API (a documented constraint that already shaped
  issue #28's descope), so there is no way to write image files to disk.
- Every existing image — infobox portraits, inline body images, world maps — is stored
  as a **compressed data URL** produced by `compressImage()` (`src/imageUtils.ts`:
  resize to a max dimension + JPEG re-encode).

The gallery follows that same proven pattern: **compressed JPEG data URLs in IndexedDB**.
"Stored locally" is satisfied by IndexedDB. To avoid bloating the page row (and every
page-save / snapshot) with image bytes, images live in their **own table**, not on the
page.

## Data model

New Dexie table `images`:

```ts
/** One image in a page's gallery. Stored as a compressed JPEG data URL in its
 *  own table (not on LorePage) so editing page text never rewrites image bytes. */
export interface PageImage {
  id: string
  pageId: string      // owner page (indexed)
  dataUrl: string     // compressed JPEG data URL (via compressImage)
  caption: string     // optional; '' when none
  order: number       // 0-based position in the grid (indexed)
  createdAt: number
}
```

- Dexie **version 8**, store: `images: 'id, pageId, order'`.
- `LorePage` is **unchanged**. The gallery is read reactively per page with
  `useLiveQuery(() => db.images.where('pageId').equals(id).sortBy('order'), [id])`.

## New db module — `src/db/images.ts`

Pure CRUD, re-exported through the barrel (`src/db/index.ts` `export *`); new public
function names added to `src/db/barrel.test.ts`'s `EXPECTED_FUNCTIONS`.

- `addImage(pageId: string, dataUrl: string): Promise<string>` — appends at
  `order = (current count for pageId)`.
- `updateImageCaption(id: string, caption: string): Promise<void>`
- `deleteImage(id: string): Promise<void>`
- `reorderImages(pageId: string, orderedIds: string[]): Promise<void>` — reassigns
  `order` to `0..n-1` in one transaction.
- `setAsPortrait(page: LorePage, dataUrl: string): Promise<void>` — writes `dataUrl`
  into `page.infobox.image`. If the page has no infobox, create
  `defaultInfobox(page.category)` first, then set the image (mirrors the existing
  "＋ Add infobox" path in `PageRoute`).

**Cascade delete:** extend `deletePage` (in `src/db/pages.ts`) so its transaction also
runs `db.images.where('pageId').equals(id).delete()` — a deleted page leaves no orphan
images.

## UI

Rendered in `PageRoute`'s `.page-main`, **after** `<LoreEditor>` (full-width main
column, per the approved placement). Two components:

### `src/components/ImageGallery.tsx`
The `── Images ──` section for one page.

- **View mode:** responsive thumbnail grid; optional caption under each thumbnail. The
  whole section is **hidden when the page has no images** (no empty-state clutter in
  view mode). Clicking a thumbnail opens the lightbox at that index.
- **Edit mode** adds:
  - **Add** — a file-picker button (`multiple`) **and** a drag-and-drop dropzone over
    the section. Each dropped/picked file → `compressImage(file, 1600)` → `addImage`.
    (`maxDim = 1600` so reference sheets stay legible fullscreen; tunable.)
  - **Caption** — an inline text input under each thumbnail → `updateImageCaption`.
  - **Delete** — a per-thumbnail `×` → `deleteImage`.
  - **Set as portrait** — a per-thumbnail action → `setAsPortrait`.
  - **Reorder** — **native HTML5 drag-and-drop** between thumbnails (no new
    dependency), committing the new order via `reorderImages`. Order determines which
    image is "first."

Props (sketch): `pageId`, `page` (for `setAsPortrait`), `editable`, the live `images`
array, and an `onOpenLightbox(index)` callback.

### `src/components/Lightbox.tsx`
Self-contained fullscreen overlay.

- Shows one image at full size with its caption.
- **Prev/next** via on-screen arrows and ←/→ keys; wraps or clamps at the ends
  (clamp). **Esc** closes; clicking the backdrop closes.
- Works in both view and edit mode. No knowledge of Dexie — it takes the image list +
  active index + close/navigate callbacks, so it is reusable.

## Backup / data-safety wiring (`src/db/backup.ts`)

- Add `images` to `BackupData`, `BackupCounts`, `exportAll()`, and `importAll()`
  (clear + `bulkAdd`, inside the existing transaction's table list).
- Bump `CURRENT_SCHEMA_VERSION` `7 → 8`, and add a `MIGRATIONS[7]` step:
  `(d) => ({ ...d, images: asArray(d.images) })` — additive table, identical pattern to
  the regions (v6) and calendars/events (v5) steps. Old backups simply lack the table.
- **Import sanitization:** in the import path, keep only images whose `dataUrl` starts
  with `data:image/` (drop anything else smuggled into the field). Captions are plain
  text rendered as React text, already escaped — no HTML sanitization needed. (Images
  carry no HTML, so they don't go through `sanitizeHtml`; this is a targeted data-URL
  whitelist instead.)
- `src/backup.ts` change-tracking: include `db.images` so adding images counts toward
  the backup-overdue nudge (`BackupBanner` / Home). Snapshots already serialize
  `exportAll()` JSON, so gallery images ride along automatically once `exportAll`
  includes them.

## HTML export (`src/htmlExport.ts`)

Render each page's gallery as a `<figure>`-based thumbnail grid in the exported static
site, so `exportAsHtml()` doesn't silently drop images. Images embed as their data URLs
(consistent with how the export already inlines other images).

## Testing

- `src/db/images.test.ts` (fake-indexeddb): `addImage` ordering, `reorderImages` order
  integrity, `deleteImage`, cascade-delete via `deletePage`, and `setAsPortrait`
  creating an infobox when the page lacks one.
- `src/db/backup.test.ts`: images round-trip through export/import, the v8 version
  stamp, the `MIGRATIONS[7]` step, and the `data:image/` import filter dropping a
  non-image payload.
- `src/db/barrel.test.ts`: the new `images.ts` exports.
- `ImageGallery` / `Lightbox` rendering is **not** unit-tested — consistent with the
  codebase's convention of not unit-testing pure-visual React (e.g. `MapView`); verified
  via `npm run build` + manual smoke.

## Out of scope (YAGNI)

- Albums / folders / nested galleries.
- Per-image tags or linking an image to another page.
- External-URL images (data URLs only, like every other image in the app).
- In-app cropping / rotation / editing.
- Bulk operations beyond multi-file add.

## Acceptance criteria mapping (from #19)

| Criterion | Resolution |
|---|---|
| Images section, multiple images | `images` table + `ImageGallery` section |
| Add by file picker or drag-and-drop | Both, in edit mode |
| Thumbnail grid | `ImageGallery` view-mode grid |
| Lightbox with prev/next | `Lightbox.tsx` (arrows + keys + Esc) |
| Optional caption per image | `caption` field + inline editor |
| Stored locally, not base64 in JSON | **Reinterpreted:** data URLs in IndexedDB (own table); literal filesystem storage is impossible in-browser (see "Storage reality") |
| First image settable as infobox portrait | `setAsPortrait` action (any image; "first" via reorder) |
