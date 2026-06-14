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
  // Escalate styling when a backup is overdue: never taken, or older than a week.
  // Evaluated in a live query so the time read happens off the render path.
  const urgent = useLiveQuery(async () => lastBackup == null || Date.now() - lastBackup > WEEK_MS, [lastBackup]) ?? false

  const needsBackup = hasUnbackedUpChanges(lastBackup ?? null, latestChange)
  if (dismissed || !needsBackup) return null

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
