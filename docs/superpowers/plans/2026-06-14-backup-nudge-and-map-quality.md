# Backup Nudge + Map Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backup reminder concrete by showing how many changes are unsaved, and stop maps from being stored at a too-low resolution/quality.

**Architecture:** Two independent slices. (A) Add one pure-ish DB helper `unbackedChangeCount()` in `src/backup.ts`, then surface its number in the `BackupBanner` and the Home "Backup & safety" status row, with a stronger banner style when a backup is overdue. (B) A one-line change to the map upload call so images are downscaled less and encoded at higher quality. No schema change (Dexie stays at v3); no new dependencies.

**Tech Stack:** React 19 + TypeScript, Dexie (IndexedDB) with `dexie-react-hooks` `useLiveQuery`, Vite. Verification is `npm run build` (type-check) + `npm run lint` + manual browser checks — **this project has no automated test framework** (see CLAUDE.md), so "tests" below are type-check, lint, and scripted manual verification.

**Spec:** `docs/superpowers/specs/2026-06-14-backup-nudge-and-map-quality-design.md`

---

## File Structure

- **Modify** `src/routes/MapRoute.tsx:31` — raise map upload `maxDim`/quality (Part B).
- **Modify** `src/backup.ts` — add `unbackedChangeCount()` helper (Part A1).
- **Modify** `src/components/BackupBanner.tsx` — count-based copy + `is-urgent` class (Part A2/A4).
- **Modify** `src/routes/HomeRoute.tsx` — show count in the warn status row (Part A3).
- **Modify** `src/index.css` — add `.backup-banner.is-urgent` rule (Part A4).

Tasks are ordered smallest-and-most-independent first (map fix), then the helper before its two consumers.

---

## Task 1: Map image quality (Part B)

**Files:**
- Modify: `src/routes/MapRoute.tsx:31`

- [ ] **Step 1: Make the change**

In `src/routes/MapRoute.tsx`, find line 31:

```ts
    const dataUrl = await compressImage(file, 4096)
```

Replace it with:

```ts
    const dataUrl = await compressImage(file, 8192, 0.92)
```

(`compressImage(file, maxDim, quality)` is defined in `src/imageUtils.ts`; it never upscales and keeps JPEG, so small source images are unaffected. Do **not** touch the `compressImage(file, 800)` call in `src/components/Infobox.tsx` — thumbnails stay small.)

- [ ] **Step 2: Type-check and lint**

Run: `npm run build && npm run lint`
Expected: build completes with no TypeScript errors; lint reports no new errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, open `http://localhost:5174`, go to `/map`, upload a map image **larger than 4096px on its longest side**, and zoom in. Expected: noticeably crisper than before (less blocky). Confirm a small image (< 4096px) still uploads fine.

- [ ] **Step 4: Commit**

```bash
git add src/routes/MapRoute.tsx
git commit -m "fix: store map uploads at higher resolution and quality (8192/0.92)"
```

---

## Task 2: `unbackedChangeCount()` helper (Part A1)

**Files:**
- Modify: `src/backup.ts`

- [ ] **Step 1: Add the helper**

In `src/backup.ts`, add this function immediately after `hasUnbackedUpChanges` (after the closing brace of that function, before the `// Formatting` divider). `db` is already imported at the top of the file.

```ts
/**
 * How many pages/maps have changed since the last backup. Used to turn the
 * vague "you have changes" reminder into a concrete count. When there is no
 * prior backup, `since` is 0 so every existing page/map counts.
 */
export async function unbackedChangeCount(lastBackup: number | null): Promise<number> {
  const since = lastBackup ?? 0
  const pages = await db.pages.where('updatedAt').above(since).count()
  const maps = await db.maps.where('createdAt').above(since).count()
  return pages + maps
}
```

(Both `pages.updatedAt` and `maps.createdAt` are indexed in the Dexie schema — `src/db.ts:451-452` — so `.where().above()` needs no schema change.)

- [ ] **Step 2: Type-check and lint**

Run: `npm run build && npm run lint`
Expected: build completes with no TypeScript errors; lint clean. (The function is unused for now; that's fine — it's consumed in Tasks 3 and 4. If `noUnusedLocals`-style lint flags the export, ignore — it's an exported symbol, not a local.)

- [ ] **Step 3: Commit**

```bash
git add src/backup.ts
git commit -m "feat: add unbackedChangeCount() backup helper"
```

---

## Task 3: Concrete count + urgency in the banner (Part A2/A4)

**Files:**
- Modify: `src/components/BackupBanner.tsx`

- [ ] **Step 1: Replace the component**

Replace the entire contents of `src/components/BackupBanner.tsx` with:

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import {
  LAST_BACKUP_KEY,
  latestChangeTime,
  hasUnbackedUpChanges,
  unbackedChangeCount,
  downloadBackup,
  timeAgo,
} from '../backup'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// A thin reminder bar shown across the app whenever there is data that hasn't
// been backed up yet. Dismissible for the current session.
export default function BackupBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  const lastBackup = useLiveQuery(async () => (await db.meta.get(LAST_BACKUP_KEY))?.value as number | undefined, [])
  const latestChange = useLiveQuery(() => latestChangeTime(), []) ?? 0
  const count = useLiveQuery(() => unbackedChangeCount(lastBackup ?? null), [lastBackup, latestChange]) ?? 0

  const needsBackup = hasUnbackedUpChanges(lastBackup ?? null, latestChange)
  if (dismissed || !needsBackup) return null

  // Escalate styling when a backup is overdue: never taken, or older than a week.
  const urgent = lastBackup == null || Date.now() - lastBackup > WEEK_MS

  async function backup() {
    setBusy(true)
    try {
      await downloadBackup()
    } finally {
      setBusy(false)
    }
  }

  const noun = `change${count === 1 ? '' : 's'}`
  const message = lastBackup == null
    ? `⚠ ${count} ${noun} and no backup yet.`
    : `⚠ ${count} ${noun} since your last backup (${timeAgo(lastBackup)}).`

  return (
    <div className={`backup-banner${urgent ? ' is-urgent' : ''}`}>
      <span>{message}</span>
      <div className="backup-banner-actions">
        <button className="backup-banner-btn" disabled={busy} onClick={backup}>
          {busy ? 'Backing up…' : 'Back up now'}
        </button>
        <button className="backup-banner-x" title="Dismiss for now" onClick={() => setDismissed(true)}>×</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run build && npm run lint`
Expected: no TypeScript errors; lint clean.

- [ ] **Step 3: Manual verification**

With `npm run dev` running: edit a page so there are unsaved changes. Expected: the banner reads e.g. "⚠ 1 change since your last backup (just now)." or "⚠ 3 changes and no backup yet." if never backed up. Click **Back up now**; after the download the banner disappears (count is 0 ⇒ `needsBackup` false). Confirm the banner shows the stronger `is-urgent` look when no backup has ever been taken (styling lands in Task 5; here just confirm the `is-urgent` class is present via devtools if CSS not yet added).

- [ ] **Step 4: Commit**

```bash
git add src/components/BackupBanner.tsx
git commit -m "feat: show unbacked-change count and overdue styling in backup banner"
```

---

## Task 4: Show the count on Home (Part A3)

**Files:**
- Modify: `src/routes/HomeRoute.tsx`

- [ ] **Step 1: Import the helper**

In `src/routes/HomeRoute.tsx`, the backup imports block is at lines 16-24. Add `unbackedChangeCount` to it:

```tsx
import {
  LAST_BACKUP_KEY,
  downloadBackup,
  latestChangeTime,
  hasUnbackedUpChanges,
  unbackedChangeCount,
  isStoragePersisted,
  requestPersistentStorage,
  timeAgo,
} from '../backup'
```

- [ ] **Step 2: Compute the count**

Immediately after line 80 (`const needsBackup = hasUnbackedUpChanges(lastBackup ?? null, latestChange)`), add:

```tsx
  const unbacked = useLiveQuery(() => unbackedChangeCount(lastBackup ?? null), [lastBackup, latestChange]) ?? 0
```

(`useLiveQuery`, `lastBackup`, and `latestChange` are already in scope — see lines 3, 77, 78.)

- [ ] **Step 3: Use the count in the warn status row**

In the "Backup & safety" section, replace the message expression (currently lines 287-289):

```tsx
            {needsBackup
              ? 'You have changes that aren’t backed up yet.'
              : 'All changes are backed up.'}
```

with:

```tsx
            {needsBackup
              ? `${unbacked} change${unbacked === 1 ? '' : 's'} not backed up yet.`
              : 'All changes are backed up.'}
```

(Leave the following `<span className="status-sub">Last backup: …</span>` line unchanged — it already shows freshness.)

- [ ] **Step 4: Type-check and lint**

Run: `npm run build && npm run lint`
Expected: no TypeScript errors; lint clean.

- [ ] **Step 5: Manual verification**

With `npm run dev` running, open Home (`/`). With unsaved edits present, the warn row reads e.g. "3 changes not backed up yet. · Last backup: 2 hours ago". Make another edit; the number increments. Click **Back up now**; the row flips to "All changes are backed up."

- [ ] **Step 6: Commit**

```bash
git add src/routes/HomeRoute.tsx
git commit -m "feat: show unbacked-change count on Home backup status"
```

---

## Task 5: Urgent banner styling (Part A4)

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add the CSS rule**

In `src/index.css`, immediately after the `.backup-banner { … }` block (which ends at line 387), add:

```css
.backup-banner.is-urgent {
  background: linear-gradient(180deg, #4a1d16, #381512);
  border-bottom-color: #7a2a1d;
  color: #f7ddd4;
  font-weight: 600;
}
```

(This re-tints the existing brown reminder bar to an urgent red while reusing the same layout rules from `.backup-banner`.)

- [ ] **Step 2: Type-check and lint**

Run: `npm run build && npm run lint`
Expected: build succeeds; lint clean.

- [ ] **Step 3: Manual verification**

With `npm run dev` running and a state where no backup has ever been taken (or the last backup is over a week old) and there are unsaved changes: the top banner appears in the red urgent style. After clicking **Back up now**, the banner disappears. To re-check the non-urgent style, back up, then make a fresh edit within the same week — the banner returns in the normal brown style.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "style: urgent red treatment for overdue backup banner"
```

---

## Task 6: Final verification and integration

- [ ] **Step 1: Full build + lint**

Run: `npm run build && npm run lint`
Expected: clean type-check and lint across the whole project.

- [ ] **Step 2: End-to-end manual pass**

With `npm run dev`:
1. Fresh edit → banner + Home both show a correct, matching count.
2. Several edits → count increases consistently in both places.
3. Back up now → both clear to "All changes are backed up." and the banner vanishes.
4. Upload a >4096px map → crisp when zoomed.
5. No-backup / >1-week-old state with changes → banner is red/urgent.

- [ ] **Step 3: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to merge `feature/backup-nudge-map-quality` into `main` (or open a PR), and close issue #28 referencing the map fix as a bundled change.

---

## Self-Review

**Spec coverage:**
- A1 helper → Task 2. A2 banner copy → Task 3. A3 Home count → Task 4. A4 urgency (logic) → Task 3; (CSS) → Task 5. Part B map fix → Task 1. "Out of scope" items (File System Access/timers) — correctly absent. Verification steps → mirrored in each task + Task 6. ✓ No gaps.
- Note: the spec's banner copy example was `"{n} changes since your last backup ({timeAgo})"`; the plan refines the `lastBackup == null` case to "and no backup yet" to avoid the awkward "…your last backup (never)". This is a clarity improvement consistent with spec intent (concrete count + freshness).

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `unbackedChangeCount(lastBackup: number | null): Promise<number>` is defined in Task 2 and called identically in Tasks 3 and 4. `db.pages.where('updatedAt')` / `db.maps.where('createdAt')` match the schema at `src/db.ts:451-452`. `compressImage(file, 8192, 0.92)` matches the `compressImage(file, maxDim, quality)` signature in `src/imageUtils.ts`. The `is-urgent` class name matches between Task 3 (toggle) and Task 5 (CSS). ✓
