import { db, exportAll, getMeta, setMeta, saveSnapshot } from './db'

const SNAPSHOT_TIME_KEY = 'snapshot-last-time'
const PAGES_THRESHOLD = 50
const TIME_THRESHOLD_MS = 24 * 60 * 60 * 1000

/**
 * Take a snapshot if ≥50 distinct pages have been updated since the last
 * snapshot, OR if ≥24 hours have passed and at least one page has changed.
 * Safe to call after every save and on app start — the check is cheap.
 */
export async function maybeTakeSnapshot(): Promise<void> {
  const lastTime = (await getMeta<number>(SNAPSHOT_TIME_KEY)) ?? 0
  const now = Date.now()
  const pagesChanged = await db.pages.where('updatedAt').above(lastTime).count()

  if (pagesChanged === 0) return

  const timePassed = now - lastTime >= TIME_THRESHOLD_MS
  if (pagesChanged < PAGES_THRESHOLD && !timePassed) return

  const data = await exportAll()
  await saveSnapshot(data, pagesChanged)
  await setMeta(SNAPSHOT_TIME_KEY, now)
}
