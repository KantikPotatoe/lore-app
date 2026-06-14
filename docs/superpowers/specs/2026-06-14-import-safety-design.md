# Design: Import safety — no silent wipe (issue #29)

**Date:** 2026-06-14
**Issue:** [#29](https://github.com/KantikPotatoe/lore-app/issues/29) — Tier 1 (Trust),
part of the v0.0.1 roadmap (`docs/superpowers/plans/2026-06-14-v0.0.1-roadmap.md`).

## Problem

`importAll()` **replaces** the entire database — no merge, no undo. Two failure
modes today:

1. **Vague confirmation.** `handleImport` (`src/routes/HomeRoute.tsx:128`) shows a
   bare `confirm('Restoring will REPLACE all current data…')` with no indication of
   how much is at stake or what's coming in.
2. **Silent wipe on a wrong file.** `importAll` (`src/db.ts:668`) does
   `JSON.parse(json)` then immediately `clear()`s every table. A file that is valid
   JSON but *not* a backup (e.g. `{}`, or some unrelated `.json`) clears everything
   and adds nothing back — current data is destroyed with no warning and no error.

## Goal

Importing always shows concrete counts and requires confirmation; an invalid file
can never wipe data; and a recovery backup of the pre-import state is written first.

## Decisions

- **Custom reusable modal, not native `confirm()`.** Native `confirm()`/`alert()`
  are host-provided dialogs whose behavior varies across packaging targets (Tauri
  historically blocks them; stripped webviews may disable them). A React modal is
  pure DOM/CSS and renders identically in a browser, Electron, or Tauri. Since the
  app may later be packaged as an exe, the modal removes a future porting landmine
  and becomes the **first reusable confirm-dialog pattern** the app's other native
  dialogs can migrate onto later. (That migration is out of scope here.)
- **Show all four counts** — pages, maps, pins, page-types (templates) — current vs.
  incoming, so the user sees exactly what they're trading.
- **No merge.** Replace-on-import semantics are unchanged; this issue only makes the
  replace safe.

---

## Part A — Reusable modal: `src/components/ConfirmDialog.tsx`

A generic, controlled confirmation dialog.

```tsx
interface ConfirmDialogProps {
  open: boolean
  title: string
  confirmLabel?: string   // default "Confirm"
  cancelLabel?: string    // default "Cancel"
  danger?: boolean        // red confirm button for destructive actions
  onConfirm: () => void
  onCancel: () => void
  children: React.ReactNode  // body content (the import flow renders a counts table)
}
```

Behavior:

- Returns `null` when `open` is false. When open, renders a dimmed full-screen
  overlay (`.modal-overlay`) containing a centered dark-theme dialog
  (`.modal-dialog`) with the title, `children` body, and a `.modal-actions` row of
  Cancel + Confirm buttons.
- **Esc** key cancels (calls `onCancel`). A keydown listener is attached via
  `useEffect` only while `open`, and removed on cleanup.
- **Click on the backdrop** (the overlay itself, not its children) cancels. Clicks
  inside `.modal-dialog` do not propagate to the overlay.
- The confirm button gets **autofocus** when the dialog opens.
- Full focus-trapping is intentionally **out of scope** (YAGNI for a two-button
  dialog); Esc + backdrop-click + autofocus cover the real ergonomics.
- `danger` adds a `.danger` class to the confirm button (red) for destructive
  actions like import.

CSS added to `src/index.css`: `.modal-overlay` (fixed, full-viewport, dimmed,
flex-centered, high `z-index`), `.modal-dialog` (dark card matching the app theme,
max-width, padding, rounded), `.modal-actions` (right-aligned button row), and a
`.danger` button variant (red background).

---

## Part B — Validation: `parseBackup()` in `src/db.ts`

The guard that makes a silent wipe impossible. The clear-and-replace must never run
on a file that isn't a backup.

```ts
export interface BackupCounts {
  pages: number
  maps: number
  pins: number
  templates: number
}

/** Parse + validate a backup file. Throws a friendly Error if it isn't one. */
export function parseBackup(json: string): { data: BackupData; counts: BackupCounts } {
  let data: any
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error("This file isn't valid JSON — it may be corrupted.")
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.pages)) {
    throw new Error("This doesn't look like a Lore Codex backup file. Nothing was changed.")
  }
  return {
    data,
    counts: {
      pages: data.pages.length,
      maps: Array.isArray(data.maps) ? data.maps.length : 0,
      pins: Array.isArray(data.pins) ? data.pins.length : 0,
      templates: Array.isArray(data.templates) ? data.templates.length : 0,
    },
  }
}
```

- **Validity rule:** parses as JSON, is a non-null object, and has an **array
  `pages`** field. `pages` is the only required field — older backups without
  `maps`/`pins`/`templates` still pass (matching the existing "older backups
  re-seed built-ins" tolerance).
- `BackupData` is the existing shape `exportAll()` produces
  (`{ version, exportedAt, pages, maps, pins, templates }`); define/reuse a type for
  it so `parseBackup`'s return is typed rather than `any`.

`importAll` is reworked to validate through the **same** function, so it stays safe
regardless of caller:

```ts
export async function importAll(json: string): Promise<void> {
  const { data } = parseBackup(json)   // throws before any clear() on an invalid file
  await db.transaction('rw', db.pages, db.maps, db.pins, db.templates, async () => {
    await Promise.all([db.pages.clear(), db.maps.clear(), db.pins.clear(), db.templates.clear()])
    if (data.pages) await db.pages.bulkAdd(data.pages)
    if (data.maps) await db.maps.bulkAdd(data.maps)
    if (data.pins) await db.pins.bulkAdd(data.pins)
    if (data.templates) await db.templates.bulkAdd(data.templates)
  })
  await seedTemplates() // older backups have no templates — ensure built-ins exist
}
```

The UI parses once for counts and `importAll` parses again internally; the double
parse is negligible and keeps `importAll` self-protecting (defense in depth).

---

## Part C — Recovery backup: `downloadPreImportBackup()` in `src/backup.ts`

Auto-export the current DB to a recovery file immediately before applying an import.

- Refactor the blob-creation/anchor-click body of the existing `downloadBackup()`
  into a private helper `triggerDownload(json: string, filename: string)`.
  `downloadBackup()` keeps calling it and continues to stamp `LAST_BACKUP_KEY`.
- New exported `downloadPreImportBackup(): Promise<void>`:
  - Builds the same JSON via `exportAll()` and downloads it as
    `lore-pre-import-<stamp>.json` (reusing `backupStamp()`).
  - **Does not** stamp `LAST_BACKUP_KEY` — it's a recovery artifact, not a user
    backup, and after the import the old data is gone, so stamping would mislead the
    backup nudge.
  - **Skips the download entirely if the current DB is empty** (no pages, maps,
    pins, or templates) — nothing to recover on a fresh first import. Determined by
    a cheap count check before exporting.

---

## Part D — Import flow rework: `src/routes/HomeRoute.tsx`

`handleImport` splits into validate-then-confirm. New local state:
`pendingImport: { json: string; current: BackupCounts; incoming: BackupCounts } | null`.

1. On file pick: read `file.text()`, then `parseBackup(text)` in a `try/catch`.
   - **On throw:** `alert(err.message)`, reset the file input, and stop. Nothing is
     cleared or downloaded.
2. On success: gather **current** counts from the live DB (`db.pages.count()` etc.,
   or reuse already-loaded live-query values) and the **incoming** counts from
   `parseBackup`'s result. Set `pendingImport` and open the modal.
3. Modal (`<ConfirmDialog open danger title="Replace your codex?" confirmLabel="Replace everything" …>`)
   body shows current vs. incoming for all four, e.g.:

   > **This replaces everything currently in your codex.**
   > **Current:** 42 pages · 3 maps · 18 pins · 6 page-types
   > **Incoming:** 17 pages · 1 map · 4 pins · 6 page-types
   > Your current data will be downloaded as a recovery file first.
   > **This cannot be undone.**

4. On **confirm**: `await downloadPreImportBackup()` → `await importAll(json)` →
   close modal, clear `pendingImport`, reset the file input, `alert('Backup restored.')`.
5. On **cancel**: clear `pendingImport`, close modal, reset the file input.

The existing "Restore from backup" button and hidden file input are unchanged; only
what happens after a file is chosen changes.

---

## Files touched

- **Create** `src/components/ConfirmDialog.tsx` — reusable modal.
- **Modify** `src/db.ts` — add `BackupCounts`, a `BackupData` type, `parseBackup()`;
  rework `importAll()` to validate via `parseBackup`.
- **Modify** `src/backup.ts` — extract `triggerDownload()`; add `downloadPreImportBackup()`.
- **Modify** `src/routes/HomeRoute.tsx` — validate-then-confirm flow + modal.
- **Modify** `src/index.css` — modal + `.danger` button styles.

## Out of scope

- Migrating the app's other native `confirm()`/`alert()` calls onto the new modal
  (future task; the modal is built reusable so it's ready when wanted).
- Merge-on-import, undo history, partial/selective import. Replace semantics stay.

## Verification (manual — no automated tests in this project)

1. Import a valid backup: confirm the modal shows correct current vs. incoming
   counts for all four categories; confirm applies and data matches the file.
2. Confirm a `lore-pre-import-<stamp>.json` is downloaded before the replace, and it
   restores the pre-import state if re-imported.
3. Cancel from the modal: nothing changes, no recovery file is written.
4. Pick a valid-JSON-but-not-a-backup file (e.g. `{}` or an unrelated `.json`):
   confirm an explanatory alert appears and **data is unchanged** (no wipe, no
   recovery download).
5. Pick a corrupted/non-JSON file: confirm the "not valid JSON" alert and unchanged
   data.
6. Import into an empty DB (fresh): confirm no empty recovery file is downloaded and
   the import still applies.
7. Esc and backdrop-click both cancel the modal; the confirm button is focused on
   open.
