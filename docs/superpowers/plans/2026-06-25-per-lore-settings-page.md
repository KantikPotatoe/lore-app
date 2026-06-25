# Per-lore Settings / Data Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-lore `/settings` route that becomes the canonical home for the active world's snapshots, backup/data, and a danger zone — moving those sections out of Home and exposing three currently-hardcoded policies as controls.

**Architecture:** A new `src/settings.ts` module stores per-lore policy in one `meta` row, read with fallback to current defaults so behavior is unchanged until touched. `snapshots.ts`/`backup.ts` read it; a new `SettingsRoute` surfaces the moved sections plus the new controls and a delete-world danger zone; `HomeRoute` is slimmed to an overview dashboard.

**Tech Stack:** React + TypeScript (strict), Dexie + dexie-react-hooks (`useLiveQuery`), Vitest + happy-dom + fake-indexeddb, hash routing (react-router-dom).

## Global Constraints

- TS `strict` — no `any`, no unused symbols (build fails otherwise).
- Run `npm run lint && npm run build && npm run test:run` before claiming done (CI gate).
- Tests are `*.test.{ts,tsx}` with Vitest + happy-dom + fake-indexeddb.
- Per-lore policy lives in the `meta` table via `getMeta`/`setMeta` (already exported from `../db`).
- New defaults MUST equal today's hardcoded values: snapshot change-threshold `50`, snapshot time `24` hours, snapshot retention `10`, backup-overdue `7` days. A world with no settings row must behave exactly as before.
- Import from the `../db` barrel; do not deep-import `db/` modules.

---

### Task 1: `settings.ts` policy module

**Files:**
- Create: `src/settings.ts`
- Test: `src/settings.test.ts`

**Interfaces:**
- Consumes: `getMeta`, `setMeta` from `../db`.
- Produces:
  - `interface LoreSettings { snapshotChangeThreshold: number; snapshotTimeHours: number; snapshotRetention: number; backupOverdueDays: number }`
  - `const DEFAULT_SETTINGS: LoreSettings` = `{ snapshotChangeThreshold: 50, snapshotTimeHours: 24, snapshotRetention: 10, backupOverdueDays: 7 }`
  - `getSettings(): Promise<LoreSettings>` — stored partial merged over defaults
  - `updateSettings(patch: Partial<LoreSettings>): Promise<void>` — clamps each field to an integer in `[1, 100]` (retention/threshold/days), drops non-finite values, persists merged result
  - `const SETTINGS_KEY = 'lore-settings'`

- [ ] **Step 1: Write the failing test**

```ts
// src/settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { getSettings, updateSettings, DEFAULT_SETTINGS, SETTINGS_KEY } from './settings'

describe('settings', () => {
  beforeEach(async () => {
    await db.meta.clear()
  })

  it('returns defaults when no row exists', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('merges a stored partial over defaults', async () => {
    await db.meta.put({ key: SETTINGS_KEY, value: { snapshotRetention: 25 } })
    const s = await getSettings()
    expect(s.snapshotRetention).toBe(25)
    expect(s.snapshotChangeThreshold).toBe(50) // untouched default
  })

  it('round-trips an update', async () => {
    await updateSettings({ snapshotChangeThreshold: 10 })
    expect((await getSettings()).snapshotChangeThreshold).toBe(10)
  })

  it('clamps invalid values', async () => {
    await updateSettings({ snapshotRetention: 0, snapshotChangeThreshold: -5, backupOverdueDays: 999 })
    const s = await getSettings()
    expect(s.snapshotRetention).toBe(1)         // floored to 1
    expect(s.snapshotChangeThreshold).toBe(1)   // floored to 1
    expect(s.backupOverdueDays).toBe(100)       // capped at 100
  })

  it('ignores non-finite values, keeping the prior value', async () => {
    await updateSettings({ snapshotTimeHours: 12 })
    await updateSettings({ snapshotTimeHours: Number.NaN })
    expect((await getSettings()).snapshotTimeHours).toBe(12)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/settings.test.ts`
Expected: FAIL — cannot find module `./settings`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/settings.ts
import { getMeta, setMeta } from './db'

/** Per-lore, user-tunable policy. Stored as one `meta` row; missing fields fall
 *  back to DEFAULT_SETTINGS so an absent row reproduces today's behavior. */
export interface LoreSettings {
  snapshotChangeThreshold: number
  snapshotTimeHours: number
  snapshotRetention: number
  backupOverdueDays: number
}

export const DEFAULT_SETTINGS: LoreSettings = {
  snapshotChangeThreshold: 50,
  snapshotTimeHours: 24,
  snapshotRetention: 10,
  backupOverdueDays: 7,
}

export const SETTINGS_KEY = 'lore-settings'

const MIN = 1
const MAX = 100

/** Coerce to an integer within [MIN, MAX]; return null for non-finite input so
 *  the caller can keep the prior value. */
function clamp(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.min(MAX, Math.max(MIN, Math.round(n)))
}

export async function getSettings(): Promise<LoreSettings> {
  const stored = (await getMeta<Partial<LoreSettings>>(SETTINGS_KEY)) ?? {}
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function updateSettings(patch: Partial<LoreSettings>): Promise<void> {
  const current = await getSettings()
  const next: LoreSettings = { ...current }
  for (const key of Object.keys(patch) as (keyof LoreSettings)[]) {
    const clamped = clamp(patch[key])
    if (clamped !== null) next[key] = clamped
  }
  await setMeta(SETTINGS_KEY, next)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/settings.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/settings.test.ts
git commit -m "feat(settings): per-lore policy module with clamped persistence"
```

---

### Task 2: Configurable snapshot retention in `saveSnapshot`

**Files:**
- Modify: `src/db/snapshots.ts:8-17`
- Test: `src/db/snapshots.test.ts` (create)

**Interfaces:**
- Produces: `saveSnapshot(data: string, editCount: number, keep?: number): Promise<void>` — `keep` defaults to `10`, prunes to the `keep` newest snapshots.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/snapshots.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './schema'
import { saveSnapshot, getSnapshots } from './snapshots'

describe('saveSnapshot retention', () => {
  beforeEach(async () => {
    await db.snapshots.clear()
  })

  it('defaults to keeping the 10 newest', async () => {
    for (let i = 0; i < 12; i++) await saveSnapshot(`data-${i}`, 1)
    expect((await getSnapshots()).length).toBe(10)
  })

  it('honors a custom keep count', async () => {
    for (let i = 0; i < 6; i++) await saveSnapshot(`data-${i}`, 1, 3)
    expect((await getSnapshots()).length).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/db/snapshots.test.ts`
Expected: FAIL — second test keeps 6 (or 10), not 3, because `keep` isn't applied.

- [ ] **Step 3: Write minimal implementation**

Replace `src/db/snapshots.ts:8-17` with:

```ts
export async function saveSnapshot(data: string, editCount: number, keep = 10): Promise<void> {
  await db.transaction('rw', db.snapshots, async () => {
    await db.snapshots.add({ timestamp: Date.now(), editCount, data })
    let count = await db.snapshots.count()
    while (count > keep) {
      const oldest = await db.snapshots.orderBy('timestamp').first()
      if (oldest?.id == null) break
      await db.snapshots.delete(oldest.id)
      count--
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/db/snapshots.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/snapshots.ts src/db/snapshots.test.ts
git commit -m "feat(snapshots): configurable retention via keep param"
```

---

### Task 3: `maybeTakeSnapshot` reads policy from settings

**Files:**
- Modify: `src/snapshots.ts:1-31`
- Test: `src/snapshots.test.ts` (create)

**Interfaces:**
- Consumes: `getSettings` from `./settings`; `saveSnapshot(data, count, keep)` from Task 2.
- Produces: unchanged signature `maybeTakeSnapshot(): Promise<void>`; trigger now uses `snapshotChangeThreshold`, `snapshotTimeHours`, and passes `snapshotRetention` to `saveSnapshot`.

- [ ] **Step 1: Write the failing test**

```ts
// src/snapshots.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { maybeTakeSnapshot } from './snapshots'
import { updateSettings } from './settings'

async function addPage() {
  await db.pages.add({
    id: crypto.randomUUID(),
    title: 'P', category: 'General', content: '', summary: '',
    tags: [], createdAt: Date.now(), updatedAt: Date.now(),
  } as never)
}

describe('maybeTakeSnapshot', () => {
  beforeEach(async () => {
    await db.pages.clear()
    await db.events.clear()
    await db.snapshots.clear()
    await db.meta.clear()
  })

  it('does not snapshot below the change threshold (default 50)', async () => {
    await addPage()
    await maybeTakeSnapshot()
    expect(await db.snapshots.count()).toBe(0)
  })

  it('snapshots once the configured change threshold is met', async () => {
    await updateSettings({ snapshotChangeThreshold: 1 })
    await addPage()
    await maybeTakeSnapshot()
    expect(await db.snapshots.count()).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/snapshots.test.ts`
Expected: FAIL — second test gets 0 snapshots because the threshold is still hardcoded to 50.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `src/snapshots.ts` with:

```ts
import { db, exportAll, getMeta, setMeta, saveSnapshot } from './db'
import { getSettings } from './settings'

const SNAPSHOT_TIME_KEY = 'snapshot-last-time'

/**
 * Take a snapshot if the number of changed records (pages + timeline events)
 * since the last snapshot meets the configured change threshold, OR if the
 * configured time has passed and at least one record changed. Thresholds and
 * retention come from per-lore settings (defaults reproduce the old 50 / 24h /
 * keep-10 behavior). Safe to call after every save and on app start.
 */
export async function maybeTakeSnapshot(): Promise<void> {
  const { snapshotChangeThreshold, snapshotTimeHours, snapshotRetention } = await getSettings()
  const lastTime = (await getMeta<number>(SNAPSHOT_TIME_KEY)) ?? 0
  const now = Date.now()
  const [pagesChanged, events] = await Promise.all([
    db.pages.where('updatedAt').above(lastTime).count(),
    db.events.toArray(),
  ])
  const eventsChanged = events.filter((e) => e.updatedAt > lastTime).length
  const changed = pagesChanged + eventsChanged

  if (changed === 0) return

  const timePassed = now - lastTime >= snapshotTimeHours * 60 * 60 * 1000
  if (changed < snapshotChangeThreshold && !timePassed) return

  const data = await exportAll()
  await saveSnapshot(data, changed, snapshotRetention)
  await setMeta(SNAPSHOT_TIME_KEY, now)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/snapshots.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/snapshots.ts src/snapshots.test.ts
git commit -m "feat(snapshots): drive maybeTakeSnapshot from per-lore settings"
```

---

### Task 4: Configurable backup-overdue cadence

**Files:**
- Modify: `src/backup.ts:109-115`
- Modify: `src/components/BackupBanner.tsx:1-28`
- Test: `src/backup.test.ts` (create)

**Interfaces:**
- Produces: `isBackupOverdue(lastBackup: number | null, overdueDays?: number): boolean` — `overdueDays` defaults to `7`.
- Consumes (in BackupBanner): `getSettings` from `../settings`.

- [ ] **Step 1: Write the failing test**

```ts
// src/backup.test.ts
import { describe, it, expect } from 'vitest'
import { isBackupOverdue } from './backup'

const DAY = 24 * 60 * 60 * 1000

describe('isBackupOverdue', () => {
  it('is overdue when never backed up', () => {
    expect(isBackupOverdue(null)).toBe(true)
  })

  it('uses a 7-day default', () => {
    expect(isBackupOverdue(Date.now() - 8 * DAY)).toBe(true)
    expect(isBackupOverdue(Date.now() - 3 * DAY)).toBe(false)
  })

  it('honors a custom cadence', () => {
    expect(isBackupOverdue(Date.now() - 2 * DAY, 1)).toBe(true)
    expect(isBackupOverdue(Date.now() - 2 * DAY, 5)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/backup.test.ts`
Expected: FAIL — the third test fails because `isBackupOverdue` ignores its second argument.

- [ ] **Step 3: Write minimal implementation**

Replace `src/backup.ts:109-115` with:

```ts
const DAY_MS = 24 * 60 * 60 * 1000

/** True if a backup is overdue: never taken, or older than `overdueDays` (default 7). */
export function isBackupOverdue(lastBackup: number | null, overdueDays = 7): boolean {
  if (lastBackup === null) return true
  return Date.now() - lastBackup > overdueDays * DAY_MS
}
```

Then in `src/components/BackupBanner.tsx`, add the settings import and read the cadence. Change the import block (lines 1-12) to also import settings, and replace line 28's overdue call:

```tsx
// add near the other imports
import { getSettings } from '../settings'
```

```tsx
// inside the component, alongside the other live queries:
const overdueDays = useLiveQuery(async () => (await getSettings()).backupOverdueDays, []) ?? 7
```

```tsx
// replace line 28
const urgent = isBackupOverdue(lastBackup ?? null, overdueDays)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/backup.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify build (BackupBanner type-checks)**

Run: `npm run build`
Expected: succeeds with no TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/backup.ts src/components/BackupBanner.tsx src/backup.test.ts
git commit -m "feat(backup): configurable overdue cadence from settings"
```

---

### Task 5: `SettingsRoute` with snapshots, backup/data, and danger zone

Creates the page and wires it into routing + nav. The snapshot and backup
sections are lifted from `HomeRoute` (verbatim markup + handlers) and joined with
the new policy controls and a delete-world danger zone. Home keeps its copies
until Task 6 removes them (brief, intentional overlap so each task is
independently reviewable).

**Files:**
- Create: `src/routes/SettingsRoute.tsx`
- Modify: `src/App.tsx` (import + `<Route>`)
- Modify: `src/components/Sidebar.tsx:89-95` (nav link)
- Test: `src/routes/SettingsRoute.test.tsx`

**Interfaces:**
- Consumes: `getSettings`, `updateSettings` (Task 1); `getSnapshots`, `parseBackup`, `importAll`, `db`, `BackupCounts` from `../db`; `downloadBackup`, `downloadPreImportBackup`, `latestChangeTime`, `hasUnbackedUpChanges`, `unbackedChangeCount`, `isStoragePersisted`, `requestPersistentStorage`, `timeAgo`, `LAST_BACKUP_KEY` from `../backup`; `exportAsHtml` from `../htmlExport`; `deleteLore`, `currentLoreId` from `../lores`; `ConfirmDialog`.
- Produces: default-exported `SettingsRoute` component at path `/settings`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/routes/SettingsRoute.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db'
import SettingsRoute from './SettingsRoute'

describe('SettingsRoute', () => {
  beforeEach(async () => {
    await db.meta.clear()
    await db.snapshots.clear()
  })

  it('renders the three sections and the snapshot policy control', async () => {
    render(<MemoryRouter><SettingsRoute /></MemoryRouter>)
    expect(await screen.findByText('Auto-snapshots')).toBeTruthy()
    expect(screen.getByText('Backup & data')).toBeTruthy()
    expect(screen.getByText('Danger zone')).toBeTruthy()
    // snapshot retention input seeded from defaults (10)
    expect(await screen.findByLabelText(/keep newest/i)).toBeTruthy()
  })
})
```

> Note: `@testing-library/react` is already used by `EmptyState.test.tsx` / `ErrorBoundary.test.tsx`. Mirror their setup. If `findByLabelText` needs jsdom, these are plain React renders under happy-dom and don't parse `<script>`, so no environment pragma is needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/routes/SettingsRoute.test.tsx`
Expected: FAIL — cannot find module `./SettingsRoute`.

- [ ] **Step 3: Write the implementation**

Create `src/routes/SettingsRoute.tsx`. This composes:
1. **Auto-snapshots** — the snapshot list + Restore from `HomeRoute.tsx:404-435` (the `<section>` body), plus three number inputs bound to settings.
2. **Backup & data** — the backup status + actions + tip from `HomeRoute.tsx:437-503`, plus a backup-cadence number input.
3. **Danger zone** — delete-this-world button → danger `ConfirmDialog` → `deleteLore`.

```tsx
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  importAll,
  parseBackup,
  getSnapshots,
  type BackupCounts,
} from '../db'
import {
  LAST_BACKUP_KEY,
  downloadBackup,
  downloadPreImportBackup,
  latestChangeTime,
  hasUnbackedUpChanges,
  unbackedChangeCount,
  isStoragePersisted,
  requestPersistentStorage,
  timeAgo,
} from '../backup'
import { exportAsHtml } from '../htmlExport'
import { getSettings, updateSettings, DEFAULT_SETTINGS, type LoreSettings } from '../settings'
import { deleteLore, currentLoreId } from '../lores'
import ConfirmDialog from '../components/ConfirmDialog'

export default function SettingsRoute() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pendingImport, setPendingImport] = useState<{
    json: string
    current: BackupCounts
    incoming: BackupCounts
  } | null>(null)

  const snapshots = useLiveQuery(() => getSnapshots(), []) ?? []
  const lastBackup = useLiveQuery(async () => (await db.meta.get(LAST_BACKUP_KEY))?.value as number | undefined, [])
  const latestChange = useLiveQuery(() => latestChangeTime(), []) ?? 0
  const needsBackup = hasUnbackedUpChanges(lastBackup ?? null, latestChange)
  const unbacked = useLiveQuery(() => unbackedChangeCount(lastBackup ?? null), [lastBackup, latestChange]) ?? 0

  // Settings: load once into a draft so rapid edits to different fields don't
  // clobber each other (mirrors HomeRoute's HomeConfig pattern).
  const savedSettings = useLiveQuery(() => getSettings(), [])
  const [draft, setDraft] = useState<LoreSettings | null>(null)
  if (savedSettings !== undefined && draft === null) setDraft(savedSettings)
  const s = draft ?? savedSettings ?? DEFAULT_SETTINGS

  function setField(patch: Partial<LoreSettings>) {
    setDraft((prev) => ({ ...(prev ?? savedSettings ?? DEFAULT_SETTINGS), ...patch }))
  }
  useEffect(() => {
    if (draft) updateSettings(draft)
  }, [draft])

  useEffect(() => {
    isStoragePersisted().then(setPersisted)
  }, [])

  async function handleBackup() {
    setBusy(true)
    try { await downloadBackup() } finally { setBusy(false) }
  }
  async function handleExportHtml() {
    setExporting(true)
    try { await exportAsHtml() } finally { setExporting(false) }
  }
  async function enablePersist() {
    setPersisted(await requestPersistentStorage())
  }

  async function loadCounts(): Promise<BackupCounts> {
    const [pages, maps, pins, regions, templates, calendars, events, images] = await Promise.all([
      db.pages.count(), db.maps.count(), db.pins.count(), db.regions.count(),
      db.templates.count(), db.calendars.count(), db.events.count(), db.images.count(),
    ])
    return { pages, maps, pins, regions, templates, calendars, events, images }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    let incoming: BackupCounts
    try {
      incoming = parseBackup(text).counts
    } catch (err) {
      alert(err instanceof Error ? err.message : 'That file could not be read.')
      e.target.value = ''
      return
    }
    setPendingImport({ json: text, current: await loadCounts(), incoming })
    e.target.value = ''
  }

  async function confirmImport() {
    if (!pendingImport) return
    const { json } = pendingImport
    setPendingImport(null)
    setBusy(true)
    try {
      await downloadPreImportBackup()
      await importAll(json)
      alert('Backup restored.')
    } finally { setBusy(false) }
  }

  const fmtCounts = (c: BackupCounts) =>
    `${c.pages} pages · ${c.maps} maps · ${c.pins} pins · ${c.regions} regions · ${c.templates} page-types · ${c.calendars} calendars · ${c.events} events`

  return (
    <div className="settings-page">
      <h1 className="settings-title">Settings</h1>

      {/* Auto-snapshots */}
      <section className="home-section">
        <h2>Auto-snapshots</h2>
        <div className="settings-controls">
          <label className="settings-field">
            <span>Snapshot after this many changes</span>
            <input
              type="number" min={1} max={100} value={s.snapshotChangeThreshold}
              onChange={(e) => setField({ snapshotChangeThreshold: e.target.valueAsNumber })}
            />
          </label>
          <label className="settings-field">
            <span>…or after this many hours of activity</span>
            <input
              type="number" min={1} max={100} value={s.snapshotTimeHours}
              onChange={(e) => setField({ snapshotTimeHours: e.target.valueAsNumber })}
            />
          </label>
          <label className="settings-field">
            <span>Keep newest snapshots</span>
            <input
              type="number" min={1} max={100} value={s.snapshotRetention}
              onChange={(e) => setField({ snapshotRetention: e.target.valueAsNumber })}
            />
          </label>
        </div>

        {snapshots.length === 0 ? (
          <p className="empty-hint">No snapshots yet. They're taken automatically as you edit.</p>
        ) : (
          <div className="snapshot-list">
            {snapshots.map((snap) => (
              <div key={snap.id} className="snapshot-row">
                <div className="snapshot-meta">
                  <span className="snapshot-time">{new Date(snap.timestamp).toLocaleString()}</span>
                  <span className="snapshot-count">{snap.editCount} pages changed</span>
                </div>
                <button
                  className="ghost-btn"
                  disabled={busy}
                  onClick={async () => {
                    const { counts: incoming } = parseBackup(snap.data)
                    setPendingImport({ json: snap.data, current: await loadCounts(), incoming })
                  }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Backup & data */}
      <section className="home-section backup">
        <h2>Backup &amp; data</h2>

        <div className="backup-status">
          <div className={`status-row ${needsBackup ? 'warn' : 'ok'}`}>
            <span className="status-dot" />
            {needsBackup
              ? `${unbacked} change${unbacked === 1 ? '' : 's'} not backed up yet.`
              : 'All changes are backed up.'}
            <span className="status-sub">Last backup: {timeAgo(lastBackup ?? null)}</span>
          </div>
          <div className={`status-row ${persisted ? 'ok' : 'warn'}`}>
            <span className="status-dot" />
            {persisted === null
              ? 'Checking browser storage…'
              : persisted
                ? 'Browser storage is persistent — Firefox won’t auto-clear your data.'
                : 'Browser storage is best-effort (could be auto-cleared).'}
            {persisted === false && <button className="mini-btn" onClick={enablePersist}>Make persistent</button>}
          </div>
        </div>

        <label className="settings-field">
          <span>Warn me to back up after this many days</span>
          <input
            type="number" min={1} max={100} value={s.backupOverdueDays}
            onChange={(e) => setField({ backupOverdueDays: e.target.valueAsNumber })}
          />
        </label>

        <div className="home-cta">
          <button className="primary-btn" disabled={busy} onClick={handleBackup}>
            {busy ? 'Backing up…' : '⭳ Back up now'}
          </button>
          <button className="ghost-btn" onClick={() => fileRef.current?.click()}>⭱ Restore from backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={handleImport} />
          <button className="ghost-btn" disabled={exporting} onClick={handleExportHtml}>
            {exporting ? 'Exporting…' : 'Export as HTML'}
          </button>
        </div>

        <div className="backup-tip">
          <strong>💡 Make backups automatic & safe (recommended):</strong>
          <p>
            Your lore is saved inside Firefox. To keep a copy that survives even if the browser is
            cleared, point Firefox’s downloads at a cloud-synced folder:
          </p>
          <ol>
            <li>Make a folder inside <em>Dropbox</em>, <em>OneDrive</em>, or <em>Google Drive</em> (e.g. <code>Lore Backups</code>).</li>
            <li>In Firefox: <em>Settings → General → Files and Applications → Downloads</em>, set “Save files to” to that folder.</li>
            <li>Click <strong>Back up now</strong> whenever the warning appears — the file lands in your synced folder and is copied to the cloud automatically.</li>
          </ol>
        </div>
      </section>

      {/* Danger zone */}
      <section className="home-section danger-zone">
        <h2>Danger zone</h2>
        <p className="empty-hint">Deleting this world removes all its pages, maps, and history. This cannot be undone — back up first.</p>
        <button className="danger-btn" onClick={() => setConfirmDelete(true)}>Delete this world</button>
      </section>

      <ConfirmDialog
        open={pendingImport !== null}
        danger
        title="Replace your codex?"
        confirmLabel="Replace everything"
        cancelLabel="Cancel"
        onConfirm={confirmImport}
        onCancel={() => setPendingImport(null)}
      >
        {pendingImport && (
          <>
            <p><strong>This replaces everything currently in your codex.</strong></p>
            <p>
              <strong>Current:</strong> {fmtCounts(pendingImport.current)}<br />
              <strong>Incoming:</strong> {fmtCounts(pendingImport.incoming)}
            </p>
            <p>Your current data will be downloaded as a recovery file first. <strong>This cannot be undone.</strong></p>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Delete this world?"
        confirmLabel="Delete world"
        cancelLabel="Cancel"
        onConfirm={() => deleteLore(currentLoreId())}
        onCancel={() => setConfirmDelete(false)}
      >
        <p><strong>This permanently deletes the active world and everything in it.</strong></p>
        <p>This cannot be undone. Make sure you have a backup first.</p>
      </ConfirmDialog>
    </div>
  )
}
```

> If `ConfirmDialog` does not accept a `danger` prop or children, check its actual signature in `src/components/ConfirmDialog.tsx` and match the usage already in `HomeRoute.tsx:470-489` exactly — that call site is the source of truth.

- [ ] **Step 4: Wire the route in `src/App.tsx`**

Add the import after the other route imports (near line 16):

```tsx
import SettingsRoute from './routes/SettingsRoute'
```

Add the route inside `<Routes>` (after the templates route, line 78):

```tsx
<Route path="/settings" element={<SettingsRoute />} />
```

- [ ] **Step 5: Add the sidebar nav link**

In `src/components/Sidebar.tsx`, inside `<nav className="top-nav">` (after the Templates link, line 94), add:

```tsx
<Link to="/settings" className={location.pathname.startsWith('/settings') ? 'nav-item active' : 'nav-item'}>Settings</Link>
```

- [ ] **Step 6: Add minimal styles**

Append to `src/index.css`:

```css
/* Settings page */
.settings-page { max-width: 860px; }
.settings-title { margin: 0 0 18px; }
.settings-controls { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 16px; }
.settings-field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--ink-dim); }
.settings-field input { width: 120px; background: var(--bg-2); border: 1px solid var(--border); color: var(--ink); border-radius: 6px; padding: 6px 8px; }
.danger-zone .danger-btn { background: #3a1714; border: 1px solid #7c2d24; color: #f3b9b1; border-radius: 7px; padding: 8px 14px; cursor: pointer; }
.danger-zone .danger-btn:hover { background: #4a1d18; }
```

- [ ] **Step 7: Run the route test + build**

Run: `npm run test:run -- src/routes/SettingsRoute.test.tsx`
Expected: PASS.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/routes/SettingsRoute.tsx src/routes/SettingsRoute.test.tsx src/App.tsx src/components/Sidebar.tsx src/index.css
git commit -m "feat(settings): SettingsRoute with snapshots, backup, and danger zone"
```

---

### Task 6: Slim `HomeRoute` — remove the moved sections

**Files:**
- Modify: `src/routes/HomeRoute.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: Home no longer renders Auto-snapshots or Backup sections; unused imports/state/handlers removed.

- [ ] **Step 1: Remove the two sections**

Delete the **Auto-snapshots** `<section>` (`HomeRoute.tsx:404-435`) and the **Backup & safety** `<section>` (`HomeRoute.tsx:437-503`), including the import/restore `<ConfirmDialog>` that lives inside the backup section.

- [ ] **Step 2: Remove now-unused code**

Remove the state, handlers, queries, and imports that only the deleted sections used. After deletion these become unused (TS strict will flag them at build):
- State: `persisted`, `busy`, `exporting`, `pendingImport`.
- Handlers: `handleExportHtml`, `handleBackup`, `enablePersist`, `handleImport`, `confirmImport`, `fmtCounts`, and the `fileRef`.
- Queries/effects: `snapshots`, `latestChange`, `needsBackup`, `unbacked`, and the `useEffect(() => { isStoragePersisted()... })`.
- Imports no longer referenced: `importAll`, `parseBackup`, `getSnapshots`, `BackupCounts`, `ConfirmDialog`, `exportAsHtml`, and from `../backup`: `downloadBackup`, `downloadPreImportBackup`, `latestChangeTime`, `hasUnbackedUpChanges`, `unbackedChangeCount`, `isStoragePersisted`, `requestPersistentStorage`, `timeAgo`. Keep `LAST_BACKUP_KEY` **only if** `lastBackup` is still used elsewhere — it is not after removal, so remove `lastBackup` and `LAST_BACKUP_KEY` too.

> Let the TypeScript build be the guide: after deleting the JSX, run `npm run build` and remove each "declared but never read" symbol it reports until clean. Do not remove anything still used by the hero/About/Overview/Recently-edited sections (e.g. `categoryColor`, `statusColor`, `pageStatus`, `STATUSES`, `getMeta`, `setMeta`, `compressImage`, lore name/banner handlers).

- [ ] **Step 3: Build to confirm no unused symbols remain**

Run: `npm run build`
Expected: succeeds with zero TS errors.

- [ ] **Step 4: Run the full suite**

Run: `npm run test:run`
Expected: all tests pass (Home has no dedicated test; the suite stays green).

- [ ] **Step 5: Commit**

```bash
git add src/routes/HomeRoute.tsx
git commit -m "refactor(home): move snapshots and backup sections to Settings"
```

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Lint, build, test**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all three pass.

- [ ] **Step 2: Manual smoke (dev server)**

Run: `npm run dev`, open `http://localhost:5174`.
Verify:
- Sidebar shows a **Settings** nav item; clicking it opens `/settings`.
- Auto-snapshots controls show defaults (50 / 24 / 10); editing one persists across reload.
- Backup section: status rows render, "Back up now" downloads a file, cadence input shows 7.
- Danger zone "Delete this world" opens a confirm dialog (cancel it — do not delete).
- Home no longer shows snapshot/backup sections; overview/recent still render.

- [ ] **Step 3: Commit (if any doc/cleanup tweaks were needed)**

```bash
git add -A
git commit -m "chore(settings): final verification pass"
```

---

## Self-Review

**Spec coverage:**
- New `/settings` route + nav → Task 5. ✓
- `src/settings.ts` policy module with defaults/merge/clamp → Task 1. ✓
- Snapshot retention configurable (`saveSnapshot` keep) → Task 2. ✓
- `maybeTakeSnapshot` reads frequency/retention → Task 3. ✓
- `isBackupOverdue` cadence + BackupBanner honors it → Task 4. ✓
- Auto-snapshots section moved → Tasks 5 (add) + 6 (remove from Home). ✓
- Backup & data section moved → Tasks 5 + 6. ✓
- Danger zone delete-world → Task 5. ✓
- Home slimmed to dashboard → Task 6. ✓
- Error handling: clamp in Task 1; default args preserve behavior in Tasks 2–4; delete guarded by ConfirmDialog in Task 5. ✓
- Testing: settings, snapshots retention, maybeTakeSnapshot, isBackupOverdue, SettingsRoute render → Tasks 1–5. ✓
- Non-goals (global page, theme, world-identity on Settings) — correctly absent. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are concrete. ✓

**Type consistency:** `LoreSettings`, `DEFAULT_SETTINGS`, `SETTINGS_KEY`, `getSettings`, `updateSettings` consistent across Tasks 1/3/4/5. `saveSnapshot(data, editCount, keep?)` consistent Tasks 2/3. `isBackupOverdue(lastBackup, overdueDays?)` consistent Tasks 4. `BackupCounts` field list matches `HomeRoute` usage. ✓
