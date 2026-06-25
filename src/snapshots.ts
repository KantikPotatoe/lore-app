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
  const lastTime = (await getMeta<number>(SNAPSHOT_TIME_KEY))
  const now = Date.now()
  const [pagesChanged, events] = await Promise.all([
    db.pages.where('updatedAt').above(lastTime ?? 0).count(),
    db.events.toArray(),
  ])
  const eventsChanged = events.filter((e) => e.updatedAt > (lastTime ?? 0)).length
  const changed = pagesChanged + eventsChanged

  if (changed === 0) return

  const timePassed = lastTime != null && now - lastTime >= snapshotTimeHours * 60 * 60 * 1000
  if (changed < snapshotChangeThreshold && !timePassed) return

  const data = await exportAll()
  await saveSnapshot(data, changed, snapshotRetention)
  await setMeta(SNAPSHOT_TIME_KEY, now)
}
