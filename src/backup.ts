import { db, exportAll, setMeta } from './db'

// ---------------------------------------------------------------------------
// Backup & storage-safety helpers
// ---------------------------------------------------------------------------
// Your lore lives in the browser (IndexedDB). These helpers reduce the chance
// of losing it: they ask the browser to keep the data persistently, track when
// you last backed up, and download timestamped backup files you can keep in a
// synced folder (Dropbox / OneDrive / Google Drive) for off-device safety.

export const LAST_BACKUP_KEY = 'lastBackupAt'

/** Ask the browser not to auto-evict our data. Returns whether it's persisted. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function isStoragePersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false
  return navigator.storage.persisted()
}

/** Download a timestamped JSON backup of everything and record the time. */
export async function downloadBackup(): Promise<void> {
  const json = await exportAll()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lore-backup-${backupStamp()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  await setMeta(LAST_BACKUP_KEY, Date.now())
}

/** The most recent time any page or map changed — i.e. the data we'd lose. */
export async function latestChangeTime(): Promise<number> {
  const newestPage = await db.pages.orderBy('updatedAt').last()
  const newestMap = await db.maps.orderBy('createdAt').last()
  return Math.max(newestPage?.updatedAt ?? 0, newestMap?.createdAt ?? 0)
}

/** True if there is data that has changed since the last backup. */
export function hasUnbackedUpChanges(lastBackup: number | null, latestChange: number): boolean {
  if (latestChange === 0) return false // nothing to back up yet
  if (lastBackup === null) return true // data exists but never backed up
  return latestChange > lastBackup
}

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

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** A filename-safe timestamp, e.g. 2026-06-13_14-32. */
function backupStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`
}

/** Human-friendly "3 days ago" / "just now" from a timestamp. */
export function timeAgo(ts: number | null): string {
  if (!ts) return 'never'
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
