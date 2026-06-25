# Per-lore Settings / Data page — design

**Date:** 2026-06-25
**Status:** Approved for planning

## Problem

Configuration and data-management controls are scattered. The active world's
data-safety surface — auto-snapshots and backup — lives as ~100 lines (roughly
half) of `HomeRoute`, mixed in with the overview dashboard. Several policies that
a worldbuilder might reasonably want to tune are hardcoded with no UI:

- Snapshot frequency: `PAGES_THRESHOLD = 50`, `TIME_THRESHOLD_MS = 24h` (`src/snapshots.ts`)
- Snapshot retention: keep newest 10 (`src/db/snapshots.ts`, `saveSnapshot`)
- Backup-overdue cadence: `BACKUP_OVERDUE_MS = 1 week` (`src/backup.ts`)

There is no single place that answers "where do I manage this world?"

## Non-goals (explicitly deferred)

- **No global / app-wide settings page.** Investigation confirmed almost nothing
  is truly app-wide: even sidebar-collapse and recents are keyed per-lore
  (`lore:<id>:…`); the only global state is `currentLoreId`. A global page has
  nothing real to hold today. Its natural trigger is the introduction of light
  mode (the app is currently dark-only, all colors hand-tuned in `:root`). Revisit
  then.
- **No theme system / light mode** in this work.
- **No world-identity editing on Settings.** World name, tagline, about, and
  banner stay in Home's inline Customize mode, where they're edited in context.
  Duplicating them would recreate the scattering problem this page solves.

## Approach

Add a per-lore `/settings` route that becomes the canonical home for the active
world's data management, **moving** (not duplicating) the existing snapshot and
backup sections out of Home. Slim Home back to a pure overview dashboard. Turn
the three hardcoded policies into real controls backed by per-lore `meta` rows,
each read with a fallback to its current default so existing behavior is
unchanged until the user touches a control.

### Why move rather than duplicate

Two surfaces doing the same thing creates a "which one do I use?" ambiguity and
double maintenance. The app already nudges about backups globally via
`BackupBanner`, so Home loses no functional value by handing data ops to Settings.

## Architecture

### New route

- `src/routes/SettingsRoute.tsx`, mounted at `/settings` in `App.tsx`'s shell
  routes (the `<Sidebar>` + `<main>` branch, alongside `/templates`).
- Sidebar nav: a gear entry (⚙) near the bottom, consistent with existing nav
  links (`/map`, `/graph`, `/timeline`, `/templates`).

### Settings policy storage — `src/settings.ts` (new)

A small module owning the per-lore policy reads/writes, so `snapshots.ts`,
`backup.ts`, and the route share one source of truth rather than each poking
`getMeta`/`setMeta` with ad-hoc keys.

```ts
export interface LoreSettings {
  snapshotChangeThreshold: number  // default 50
  snapshotTimeHours: number        // default 24
  snapshotRetention: number        // default 10
  backupOverdueDays: number        // default 7
}

export const DEFAULT_SETTINGS: LoreSettings = {
  snapshotChangeThreshold: 50,
  snapshotTimeHours: 24,
  snapshotRetention: 10,
  backupOverdueDays: 7,
}

const SETTINGS_KEY = 'lore-settings'

export async function getSettings(): Promise<LoreSettings>      // meta row merged onto DEFAULT_SETTINGS
export async function updateSettings(patch: Partial<LoreSettings>): Promise<void>
```

- Stored as one `meta` row (`'lore-settings'`), per-lore, mirroring `HomeConfig`'s
  pattern in `HomeRoute`.
- `getSettings()` merges the stored partial over `DEFAULT_SETTINGS`, so a missing
  row (every existing world) yields today's exact behavior.
- Values are clamped/validated on write (see Error handling).

### Wiring the policies

- **`src/snapshots.ts` — `maybeTakeSnapshot()`**: read `getSettings()`; use
  `snapshotChangeThreshold` and `snapshotTimeHours` for the trigger; pass
  `snapshotRetention` to `saveSnapshot`.
- **`src/db/snapshots.ts` — `saveSnapshot(data, editCount, keep = 10)`**: add a
  `keep` parameter (default 10 preserves current callers/tests); prune to `keep`
  newest instead of hardcoded 10.
- **`src/backup.ts` — `isBackupOverdue(lastBackup, overdueDays = 7)`**: accept the
  cadence. Callers that have settings (the banner/Home overdue logic) pass it;
  default preserves behavior. The route reads `getSettings()` to surface/edit it.

### SettingsRoute sections

1. **Auto-snapshots**
   - Existing snapshot list + Restore (lifted verbatim from `HomeRoute`,
     including the `ConfirmDialog` replace-codex flow it shares with import).
   - New controls: change-count threshold (number), time threshold in hours
     (number), retention count (number). Live-saved via `updateSettings`.
2. **Backup & data**
   - Existing backup status rows, "Back up now", "Restore from backup",
     "Export as HTML", storage-persistence row + "Make persistent", and the
     synced-folder backup tip — lifted verbatim from `HomeRoute`.
   - New control: backup-overdue cadence in days.
3. **Danger zone**
   - "Delete this world" → `ConfirmDialog` (danger) → `deleteLore(currentLoreId())`,
     which already downloads nothing but reloads to the lore selector. Copy warns
     this is irreversible and suggests backing up first.

### Home after the change — `src/routes/HomeRoute.tsx`

- Remove the **Auto-snapshots** `<section>` and the **Backup & safety**
  `<section>`, plus the now-unused state/handlers/imports they pulled in
  (`busy`, `exporting`, `pendingImport`, `persisted`, snapshot/backup helpers,
  `exportAsHtml`, `ConfirmDialog` if unused elsewhere on the page, etc.).
- Keep hero/Customize (identity + banner + visibility toggles), About, Overview,
  Recently edited.
- The import/restore `ConfirmDialog` and its handlers move with the sections to
  Settings.

## Data flow

`SettingsRoute` reads `getSettings()` via `useLiveQuery` (or a one-shot load into
local draft state, matching `HomeRoute`'s `HomeConfig` pattern to avoid races on
rapid edits) and writes through `updateSettings`. Snapshot/backup operations call
the same `db`/`backup.ts`/`snapshots.ts` helpers as before. `maybeTakeSnapshot`
(called on start and after edit sessions in `App.tsx`) now reads settings each run
— cheap, one `meta.get`.

## Error handling

- **Invalid policy values**: `updateSettings` clamps to sane bounds before
  persisting — thresholds and retention coerced to integers ≥ 1; retention also
  capped (e.g. ≤ 100) to avoid unbounded snapshot growth; `backupOverdueDays` ≥ 1.
  Non-numeric input falls back to the existing stored value.
- **Missing settings row**: `getSettings()` returns `DEFAULT_SETTINGS` — no
  migration needed; existing worlds behave exactly as today.
- **Delete world**: guarded by danger `ConfirmDialog`; reuses the proven
  `deleteLore` reload path. No new failure modes.
- **Import/restore**: unchanged — still writes `downloadPreImportBackup()` first,
  still gated by `parseBackup` counts in the confirm dialog.

## Testing

- `src/settings.test.ts`: `getSettings` returns defaults when no row; merges a
  partial row over defaults; `updateSettings` round-trips and clamps invalid
  values (0, negative, non-integer, over-cap).
- `src/db/snapshots.test.ts` (existing): add a case that `saveSnapshot(data, n, keep)`
  prunes to `keep`; confirm default `keep = 10` keeps existing tests green.
- `src/snapshots.ts` behavior: with a custom threshold in settings,
  `maybeTakeSnapshot` triggers/declines accordingly (extend existing snapshot
  tests or add alongside).
- `backup.ts`: `isBackupOverdue` honors a custom `overdueDays`; default arg keeps
  current tests green.
- Lint + build + `test:run` all pass (CI gate per CLAUDE.md).

## Out-of-scope follow-ups (noted, not built)

- Global app settings page (trigger: light mode).
- Per-snapshot delete UI / manual "snapshot now" button (the `deleteSnapshot`
  CRUD already exists; not surfaced here to keep scope tight).
