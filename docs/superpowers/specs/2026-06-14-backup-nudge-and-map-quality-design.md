# Design: Backup nudge (issue #28, descoped) + map image quality fix

**Date:** 2026-06-14
**Issue:** [#28](https://github.com/KantikPotatoe/lore-app/issues/28) — descoped to
"manual + nudge" (Tier 3 option from the roadmap discussion). Plus a bundled fix
for over-aggressive map image compression.

## Context & decisions

Issue #28 originally assumed the **File System Access API** for silent
auto-backup to a chosen folder. That API's directory/file pickers
(`showDirectoryPicker` / `showSaveFilePicker`) are **Chromium-only**; the app's
launcher opens it in **Firefox**, which does not support them (Firefox only has
the sandboxed OPFS, which lives inside the browser profile and therefore does not
protect against profile loss). Switching browsers would also strand the existing
per-browser IndexedDB data.

**Decision (user):** keep Firefox; **descope to "manual + nudge"** for v0.0.1.
Do not implement File System Access, timers, or scheduled writes. Real
auto-backup is deferred to a later version when distribution changes.

A second, unrelated papercut was bundled in: **map images look pixelated.** Root
cause is upload-time compression, not backup (see Part B).

## Current state (already built — do not rebuild)

`src/backup.ts` and the Home "Backup & safety" section already provide:
- `LAST_BACKUP_KEY` meta row + `downloadBackup()` (timestamped JSON download).
- `latestChangeTime()`, `hasUnbackedUpChanges()`, `timeAgo()`.
- `requestPersistentStorage()` / `isStoragePersisted()`.
- `BackupBanner.tsx` — dismissible warn bar with a "Back up now" button.
- `HomeRoute.tsx` "Backup & safety" section — freshness ("Last backup: X ago"),
  a persistence-status row with a "Make persistent" button, Back up / Restore
  buttons, and a tip on pointing Firefox downloads at a cloud-synced folder.

So the only genuinely missing nudge capability is a **concrete change count**.

---

## Part A — Stronger backup nudge

### A1. New helper: unbacked-up change count

Add to `src/backup.ts`:

```ts
/** How many pages/maps have changed since the last backup. */
export async function unbackedChangeCount(lastBackup: number | null): Promise<number> {
  const since = lastBackup ?? 0
  const pages = await db.pages.where('updatedAt').above(since).count()
  const maps = await db.maps.where('createdAt').above(since).count()
  return pages + maps
}
```

- Reuses the same timestamps `latestChangeTime()` already reads — **no schema
  change** (Dexie stays at v3).
- "Edits" is defined as **pages or maps changed since the last backup**. When
  `lastBackup` is null, `since = 0` so every existing page/map counts (matching
  `hasUnbackedUpChanges`'s "never backed up ⇒ everything" semantics).
- Both timestamps are already indexed, so `.where().above()` works with **no
  schema change** (Dexie stays at v3): `pages: 'id, title, category, updatedAt'`
  and `maps: 'id, name, createdAt'` (`src/db.ts:452`).

### A2. Banner copy (`src/components/BackupBanner.tsx`)

- Compute the count via `unbackedChangeCount(lastBackup ?? null)` with
  `useLiveQuery` (keyed on `lastBackup` and `latestChange` so it recomputes on
  edits and after a backup).
- Replace the static message with:
  `⚠ {n} change{s} since your last backup ({timeAgo(lastBackup)}).`
  (Pluralize "change"; show `timeAgo` so it reads naturally even at n = 1.)
- Keep the existing Back up now / dismiss buttons and session-dismiss behavior.

### A3. Home status row (`src/routes/HomeRoute.tsx`)

- The existing `needsBackup` warn row gains the same concrete count next to
  "Last backup: X ago", e.g. "**{n} unsaved change(s)** · Last backup: X ago".
- No change to the persistence row, buttons, or the cloud-folder tip.

### A4. Urgency escalation (optional, kept minimal)

- Add a stronger CSS class to the banner when changes exist **and** the backup is
  stale — threshold: `lastBackup === null` OR `Date.now() - lastBackup > 7 days`.
- Implementation is a class toggle in `BackupBanner.tsx` plus one CSS rule in
  `src/index.css` (e.g. `.backup-banner.is-urgent`). No new data or logic beyond
  the threshold comparison.

### Out of scope (explicitly deferred)

File System Access API, OPFS, auto-writing backup files, timers/scheduled
backups. The "automatic" path remains the existing cloud-synced-downloads-folder
tip in the Home section.

---

## Part B — Map image quality

### Root cause

`src/routes/MapRoute.tsx:31` compresses on **upload**:

```ts
const dataUrl = await compressImage(file, 4096)   // maxDim 4096, JPEG quality 0.85 (default)
```

The map is downscaled to 4096px on its longest side and re-encoded as JPEG 0.85
before storage. Zooming past that resolution in Leaflet shows pixelation; the
backup merely copies the already-degraded data URL.

### Change

```ts
const dataUrl = await compressImage(file, 8192, 0.92)
```

- `maxDim` 4096 → 8192 raises the resolution cap (primary fix for pixelation).
- quality 0.85 → 0.92 reduces JPEG blockiness.
- Infobox thumbnails (`src/components/Infobox.tsx`, `compressImage(file, 800)`)
  are **unchanged** — small is correct for sidebar images.
- `compressImage` already keeps JPEG and never upscales, so small source images
  are unaffected; large maps gain detail at the cost of bigger data URLs. Maps
  are few per world, so the DB/backup-size cost is acceptable.

### Caveat (carried to release notes / UI)

Existing maps were already lossy-compressed; the discarded pixels are
unrecoverable. **Re-upload** a map to benefit from the new settings. No migration
is attempted. Note this near the map upload control or in the v0.0.1 release
notes.

---

## Files touched

- `src/backup.ts` — add `unbackedChangeCount()`.
- `src/components/BackupBanner.tsx` — count-based copy + urgency class.
- `src/routes/HomeRoute.tsx` — count in the status row.
- `src/index.css` — `.backup-banner.is-urgent` rule.
- `src/routes/MapRoute.tsx` — `compressImage(file, 8192, 0.92)`.

## Verification (manual — no automated tests in this project)

1. Upload a map larger than 4096px; zoom in and confirm it is noticeably crisper
   than before.
2. Edit a page; confirm the banner and Home both show the correct change count.
3. Edit several pages; confirm the count increments accordingly.
4. Click Back up now; confirm the count resets to 0 and the banner clears.
5. With changes present and no/old backup, confirm the banner shows the urgent
   styling; after backing up, confirm it returns to normal.
```
