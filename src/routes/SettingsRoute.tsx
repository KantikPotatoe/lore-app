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
  // Clearing a number input makes valueAsNumber NaN; dropping it keeps a bad value
  // out of settings (a NaN snapshot threshold makes `changed < NaN` always false).
  function setNumField(key: keyof LoreSettings) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.valueAsNumber
      if (Number.isFinite(v)) setField({ [key]: v } as Partial<LoreSettings>)
    }
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
    const [pages, maps, pins, regions, templates, calendars, events, images, docLinks] = await Promise.all([
      db.pages.count(), db.maps.count(), db.pins.count(), db.regions.count(),
      db.templates.count(), db.calendars.count(), db.events.count(), db.images.count(),
      db.docLinks.count(),
    ])
    return { pages, maps, pins, regions, templates, calendars, events, images, docLinks }
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
    } catch (err) {
      // importAll rolls the transaction back on failure (e.g. a crafted backup with
      // duplicate ids), so the current data survives — but the user still needs to
      // know it didn't take, rather than seeing nothing happen.
      alert(err instanceof Error ? `Import failed: ${err.message}` : 'Import failed. Your data was not changed.')
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
              onChange={setNumField('snapshotChangeThreshold')}
            />
          </label>
          <label className="settings-field">
            <span>…or after this many hours of activity</span>
            <input
              type="number" min={1} max={100} value={s.snapshotTimeHours}
              onChange={setNumField('snapshotTimeHours')}
            />
          </label>
          <label className="settings-field">
            <span>Keep newest snapshots</span>
            <input
              type="number" min={1} max={100} value={s.snapshotRetention}
              onChange={setNumField('snapshotRetention')}
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

      {/* Linking */}
      <section className="home-section">
        <h2>Linking</h2>
        <label className="settings-field settings-field-check">
          <input
            type="checkbox"
            checked={s.autolinkEnabled}
            onChange={(e) => setField({ autolinkEnabled: e.target.checked })}
          />
          <span>Auto-link page titles in body text</span>
        </label>
        <p className="empty-hint">
          Links the first mention of another page's title in each page's body. Your own
          [[links]] always take precedence.
        </p>
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
                ? 'Browser storage is persistent — Firefox won\'t auto-clear your data.'
                : 'Browser storage is best-effort (could be auto-cleared).'}
            {persisted === false && <button className="mini-btn" onClick={enablePersist}>Make persistent</button>}
          </div>
        </div>

        <label className="settings-field">
          <span>Warn me to back up after this many days</span>
          <input
            type="number" min={1} max={100} value={s.backupOverdueDays}
            onChange={setNumField('backupOverdueDays')}
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
          <strong>💡 Make backups automatic &amp; safe (recommended):</strong>
          <p>
            Your lore is saved inside Firefox. To keep a copy that survives even if the browser is
            cleared, point Firefox's downloads at a cloud-synced folder:
          </p>
          <ol>
            <li>Make a folder inside <em>Dropbox</em>, <em>OneDrive</em>, or <em>Google Drive</em> (e.g. <code>Lore Backups</code>).</li>
            <li>In Firefox: <em>Settings → General → Files and Applications → Downloads</em>, set "Save files to" to that folder.</li>
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
