# Import Safety — No Silent Wipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make database import safe — a wrong file can never silently wipe data, every import shows concrete current-vs-incoming counts behind a reusable confirm modal, and the pre-import state is auto-downloaded as a recovery file first.

**Architecture:** Four units. (1) A reusable `ConfirmDialog` React component (DOM/CSS only, no host `confirm()`). (2) A `parseBackup()` validator in `db.ts` that rejects non-backup files before any `clear()`, used both by the UI for counts and by `importAll()` for defense in depth. (3) A `downloadPreImportBackup()` recovery export in `backup.ts`. (4) A validate-then-confirm flow in `HomeRoute` wiring them together.

**Tech Stack:** React + TypeScript, Vite, Dexie/IndexedDB. **No automated test framework exists in this project** (per `CLAUDE.md`), so each task is verified with `npm run build` (tsc type-check) + `npm run lint` (ESLint), plus manual browser checks where noted. There is no `npm test`.

**Reference spec:** `docs/superpowers/specs/2026-06-14-import-safety-design.md`

**Important codebase facts the engineer needs:**
- `src/index.css` uses CSS custom properties: `--bg #15130f`, `--bg-2 #1d1a14`, `--panel #211d16`, `--panel-2 #2a251c`, `--border #3a3328`, `--ink #e9e1d2`, `--ink-dim #b3a890`, `--ink-faint #82785f`, `--accent #c9a24b`, `--danger #c8645a`, `--radius 10px`. Use these — do not hardcode new hex values except where shown.
- Existing buttons: `.primary-btn` (gold gradient, `width: 100%`), `.ghost-btn` (panel bg). A `.ghost-btn.danger` variant already exists.
- `src/db.ts` has `const now = () => Date.now()` (line ~485) and `exportAll()` returns `{ version: 2, exportedAt: now(), pages, maps, pins, templates }`.
- `src/db.ts` exports interfaces `LorePage`, `WorldMap`, `MapPin`, `InfoboxTemplate`.
- `react-hooks/purity` ESLint rule forbids literal `Date.now()`/`Math.random()` in a component render path. None of the new component code calls them, so this is not a concern here, but do not introduce such calls.
- The ESLint config flags unused variables and (in some configs) unnecessary truthiness checks; the code below is written to pass as-is.

---

## Task 1: Reusable `ConfirmDialog` component + modal styles

**Files:**
- Create: `src/components/ConfirmDialog.tsx`
- Modify: `src/index.css` (append a new "Modal" section after the Buttons section, around line 104)

- [ ] **Step 1: Create the component**

Create `src/components/ConfirmDialog.tsx` with exactly this content:

```tsx
import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for destructive actions. */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  children: React.ReactNode
}

// A small, reusable confirmation modal built from plain DOM (no host confirm()),
// so it renders identically in a browser, Electron, or Tauri. Esc and a backdrop
// click both cancel; the confirm button is focused when the dialog opens.
export default function ConfirmDialog({
  open,
  title,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={`primary-btn${danger ? ' danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add modal styles**

In `src/index.css`, immediately after the `.ghost-btn.danger:hover` rule (the end of the Buttons section, ~line 104, before the `/* --- Home --- */` comment), insert:

```css
/* --- Modal ---------------------------------------------------------------- */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1000;
}
.modal-dialog {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  max-width: 460px;
  width: 100%;
  padding: 22px 24px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
}
.modal-title {
  font-family: var(--display);
  font-size: 20px;
  color: var(--ink);
  margin: 0 0 12px;
}
.modal-body {
  color: var(--ink-dim);
  font-size: 15px;
  line-height: 1.55;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}
.modal-actions .primary-btn {
  width: auto;
}
.primary-btn.danger {
  background: linear-gradient(180deg, #d6786e, var(--danger));
  color: #2a0f0c;
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npm run build`
Expected: PASS (tsc completes, Vite bundles). The component is not yet imported anywhere, which is fine — it is still type-checked.

Run: `npm run lint`
Expected: PASS, no new warnings or errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ConfirmDialog.tsx src/index.css
git commit -m "feat: reusable ConfirmDialog modal (#29)"
```

---

## Task 2: `parseBackup()` validator + hardened `importAll()`

**Files:**
- Modify: `src/db.ts` (add `BackupData`/`BackupCounts` types + `parseBackup()`; rework `importAll()` at line ~668)

- [ ] **Step 1: Add the backup types and validator**

In `src/db.ts`, in the "Backup / restore" section (just above the existing `exportAll` at ~line 658), add:

```ts
/** The shape produced by exportAll() and accepted by importAll(). */
export interface BackupData {
  version?: number
  exportedAt?: number
  pages: LorePage[]
  maps?: WorldMap[]
  pins?: MapPin[]
  templates?: InfoboxTemplate[]
}

/** Counts of each record kind in a backup, for the import confirmation. */
export interface BackupCounts {
  pages: number
  maps: number
  pins: number
  templates: number
}

/**
 * Parse and validate a backup file. Throws a friendly Error if the text isn't a
 * Lore Codex backup — this is what prevents a wrong file from wiping the DB, since
 * importAll() calls it before any clear(). Only `pages` (an array) is required, so
 * older backups without maps/pins/templates still load.
 */
export function parseBackup(json: string): { data: BackupData; counts: BackupCounts } {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error("This file isn't valid JSON — it may be corrupted.")
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as BackupData).pages)) {
    throw new Error("This doesn't look like a Lore Codex backup file. Nothing was changed.")
  }
  const d = data as BackupData
  return {
    data: d,
    counts: {
      pages: d.pages.length,
      maps: Array.isArray(d.maps) ? d.maps.length : 0,
      pins: Array.isArray(d.pins) ? d.pins.length : 0,
      templates: Array.isArray(d.templates) ? d.templates.length : 0,
    },
  }
}
```

- [ ] **Step 2: Rework `importAll()` to validate through `parseBackup`**

Replace the existing `importAll` (currently at ~line 668) with:

```ts
export async function importAll(json: string): Promise<void> {
  const { data } = parseBackup(json) // throws before any clear() on an invalid file
  await db.transaction('rw', db.pages, db.maps, db.pins, db.templates, async () => {
    await Promise.all([db.pages.clear(), db.maps.clear(), db.pins.clear(), db.templates.clear()])
    await db.pages.bulkAdd(data.pages)
    if (data.maps) await db.maps.bulkAdd(data.maps)
    if (data.pins) await db.pins.bulkAdd(data.pins)
    if (data.templates) await db.templates.bulkAdd(data.templates)
  })
  // Older backups have no templates — make sure the built-ins exist.
  await seedTemplates()
}
```

(Note: `data.pages` is guaranteed to be an array by `parseBackup`, so its previous
`if (data.pages)` guard is dropped; the optional tables keep their guards.)

- [ ] **Step 3: Type-check and lint**

Run: `npm run build`
Expected: PASS. `LorePage`, `WorldMap`, `MapPin`, `InfoboxTemplate` are already defined in this file, so the new types resolve.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual sanity check of the guard**

Start the dev server if not running (`npm run dev`) and open the app at `http://localhost:5174`. Open the browser devtools console and run:

```js
// Should throw the "doesn't look like a backup" error, NOT wipe anything:
(await import('/src/db.ts')).parseBackup('{}')
```

Expected: a thrown `Error` with the message "This doesn't look like a Lore Codex backup file. Nothing was changed." (In the console this surfaces as a rejected promise / thrown error.) Confirm your pages are still present in the sidebar.

- [ ] **Step 5: Commit**

```bash
git add src/db.ts
git commit -m "feat: validate backups before import to prevent silent wipe (#29)"
```

---

## Task 3: `downloadPreImportBackup()` recovery export

**Files:**
- Modify: `src/backup.ts` (extract `triggerDownload()`; add `downloadPreImportBackup()`; uses `db` which is already imported at the top of the file)

- [ ] **Step 1: Extract a private `triggerDownload` helper and reuse it in `downloadBackup`**

In `src/backup.ts`, replace the existing `downloadBackup` function (lines ~25-38) with this refactor — a shared private helper plus the unchanged-behavior `downloadBackup`:

```ts
/** Build a JSON blob and trigger a browser download of it. */
function triggerDownload(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Download a timestamped JSON backup of everything and record the time. */
export async function downloadBackup(): Promise<void> {
  const json = await exportAll()
  triggerDownload(json, `lore-backup-${backupStamp()}.json`)
  await setMeta(LAST_BACKUP_KEY, Date.now())
}

/**
 * Download a recovery copy of the current DB right before an import replaces it.
 * Named distinctly from a normal backup, and deliberately does NOT stamp
 * LAST_BACKUP_KEY (it's a safety artifact, and the data it captures is about to be
 * replaced). Skips entirely when the DB is empty — nothing to recover.
 */
export async function downloadPreImportBackup(): Promise<void> {
  const [pages, maps, pins, templates] = await Promise.all([
    db.pages.count(),
    db.maps.count(),
    db.pins.count(),
    db.templates.count(),
  ])
  if (pages + maps + pins + templates === 0) return
  const json = await exportAll()
  triggerDownload(json, `lore-pre-import-${backupStamp()}.json`)
}
```

Leave `backupStamp()`, `exportAll` import, `setMeta` import, `LAST_BACKUP_KEY`, and `db` import as they already are. `backupStamp` is defined lower in the same file and is in scope.

- [ ] **Step 2: Type-check and lint**

Run: `npm run build`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/backup.ts
git commit -m "feat: pre-import recovery backup download (#29)"
```

---

## Task 4: Validate-then-confirm import flow in `HomeRoute`

**Files:**
- Modify: `src/routes/HomeRoute.tsx` (imports, new state, rewritten `handleImport`, modal render)

**Context:** `HomeRoute` already has `const fileRef = useRef<HTMLInputElement>(null)`, `const [busy, setBusy] = useState(false)`, a hidden file `<input ... onChange={handleImport}>` at ~line 310, and imports `importAll`, `db` from `../db`. The current `handleImport` (lines ~128-135) does a bare `confirm()` then `importAll`.

- [ ] **Step 1: Update imports**

In `src/routes/HomeRoute.tsx`, change the `../db` import block (lines ~4-15) to also bring in `parseBackup` and the `BackupCounts` type:

```tsx
import {
  db,
  createPage,
  importAll,
  parseBackup,
  getMeta,
  setMeta,
  categoryColor,
  statusColor,
  pageStatus,
  STATUSES,
  type LorePage,
  type BackupCounts,
} from '../db'
```

Change the `../backup` import block (lines ~16-25) to add `downloadPreImportBackup`:

```tsx
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
```

Add the component import near the other component imports at the top of the file (after the `../backup` import block):

```tsx
import ConfirmDialog from '../components/ConfirmDialog'
```

- [ ] **Step 2: Add pending-import state**

Right after `const [busy, setBusy] = useState(false)` (~line 55), add:

```tsx
const [pendingImport, setPendingImport] = useState<{
  json: string
  current: BackupCounts
  incoming: BackupCounts
} | null>(null)
```

- [ ] **Step 3: Rewrite `handleImport` and add confirm/cancel handlers**

Replace the existing `handleImport` (lines ~128-135) with:

```tsx
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
  const [pages, maps, pins, templates] = await Promise.all([
    db.pages.count(),
    db.maps.count(),
    db.pins.count(),
    db.templates.count(),
  ])
  setPendingImport({ json: text, current: { pages, maps, pins, templates }, incoming })
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
  } finally {
    setBusy(false)
  }
}
```

- [ ] **Step 4: Render the modal**

Find the `home-cta` block containing the Restore button and hidden file input (~lines 305-311). Immediately after the closing `</div>` of `.home-cta`, add the dialog. Use this helper inline — add a small formatter function just above the component's `return` (near the other derived values, ~line 96):

```tsx
const fmtCounts = (c: BackupCounts) =>
  `${c.pages} pages · ${c.maps} maps · ${c.pins} pins · ${c.templates} page-types`
```

Then render the dialog (place it right after the `.home-cta` div):

```tsx
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
```

- [ ] **Step 5: Type-check and lint**

Run: `npm run build`
Expected: PASS.

Run: `npm run lint`
Expected: PASS, no unused-import or unused-variable warnings (every new import is used).

- [ ] **Step 6: Manual verification (browser)**

Start/keep the dev server (`npm run dev`) and open `http://localhost:5174`. With at least one page in the codex:

1. First make a normal backup (⭳ Back up now) so you have a valid file to import.
2. Click **⭱ Restore from backup** and pick that file. Confirm the modal appears showing **Current** and **Incoming** lines each with all four counts (pages · maps · pins · page-types).
3. Click **Cancel** — confirm nothing changes and no file downloads.
4. Click Restore again, pick the file, click **Replace everything** — confirm a `lore-pre-import-<stamp>.json` downloads first, then "Backup restored." appears and the data matches the file.
5. Click Restore and pick a non-backup JSON file (e.g. create one containing `{}`): confirm the explanatory alert shows and **your data is unchanged** — no modal, no recovery download.
6. Press **Esc** while the modal is open and separately **click the dark backdrop** — both cancel.

- [ ] **Step 7: Commit**

```bash
git add src/routes/HomeRoute.tsx
git commit -m "feat: confirm import with counts + recovery backup (#29)"
```

---

## Final verification

After all four tasks:

- [ ] Run `npm run build` — expected PASS.
- [ ] Run `npm run lint` — expected PASS.
- [ ] Re-run the Task 4 Step 6 manual checklist end-to-end once more on a fresh page load.
- [ ] Confirm against the spec's verification list (`docs/superpowers/specs/2026-06-14-import-safety-design.md`), including the empty-DB case: with an empty codex, importing a valid file applies it and downloads **no** recovery file.
