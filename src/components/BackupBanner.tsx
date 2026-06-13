import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { LAST_BACKUP_KEY, latestChangeTime, hasUnbackedUpChanges, downloadBackup } from '../backup'

// A thin reminder bar shown across the app whenever there is data that hasn't
// been backed up yet. Dismissible for the current session.
export default function BackupBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  const lastBackup = useLiveQuery(async () => (await db.meta.get(LAST_BACKUP_KEY))?.value as number | undefined, [])
  const latestChange = useLiveQuery(() => latestChangeTime(), []) ?? 0

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

  return (
    <div className="backup-banner">
      <span>⚠ You have changes that aren’t backed up yet.</span>
      <div className="backup-banner-actions">
        <button className="backup-banner-btn" disabled={busy} onClick={backup}>
          {busy ? 'Backing up…' : 'Back up now'}
        </button>
        <button className="backup-banner-x" title="Dismiss for now" onClick={() => setDismissed(true)}>×</button>
      </div>
    </div>
  )
}
