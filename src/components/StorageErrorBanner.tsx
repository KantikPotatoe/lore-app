import { useState } from 'react'
import { useStorageError } from '../storageError'
import { downloadBackup } from '../backup'

// A fixed, app-wide alert shown when an IndexedDB write fails for lack of space
// (roadmap #7). Unlike BackupBanner (a gentle reminder), this fires only when data
// has actually failed to save, so it leads with the recovery action: download a
// backup before any more edits are lost.
export default function StorageErrorBanner() {
  const { message, dismiss } = useStorageError()
  const [busy, setBusy] = useState(false)

  if (!message) return null

  async function backup() {
    setBusy(true)
    try {
      await downloadBackup()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="storage-error-banner" role="alert">
      <span className="storage-error-icon" aria-hidden="true">⚠</span>
      <span className="storage-error-msg">{message}</span>
      <div className="storage-error-actions">
        <button className="storage-error-btn" disabled={busy} onClick={backup}>
          {busy ? 'Downloading…' : 'Download a backup'}
        </button>
        <button className="storage-error-x" title="Dismiss" onClick={dismiss}>×</button>
      </div>
    </div>
  )
}
