import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPage, importAll, categoryColor } from '../db'
import {
  LAST_BACKUP_KEY,
  downloadBackup,
  latestChangeTime,
  hasUnbackedUpChanges,
  isStoragePersisted,
  requestPersistentStorage,
  timeAgo,
} from '../backup'

export default function HomeRoute() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  const recent = useLiveQuery(
    () => db.pages.orderBy('updatedAt').reverse().limit(8).toArray(),
    [],
  ) ?? []
  const total = useLiveQuery(() => db.pages.count(), []) ?? 0
  const mapCount = useLiveQuery(() => db.maps.count(), []) ?? 0
  const lastBackup = useLiveQuery(async () => (await db.meta.get(LAST_BACKUP_KEY))?.value as number | undefined, [])
  const latestChange = useLiveQuery(() => latestChangeTime(), []) ?? 0

  const needsBackup = hasUnbackedUpChanges(lastBackup ?? null, latestChange)

  useEffect(() => {
    isStoragePersisted().then(setPersisted)
  }, [])

  async function handleNew() {
    const id = await createPage()
    navigate(`/page/${id}`)
  }

  async function handleBackup() {
    setBusy(true)
    try {
      await downloadBackup()
    } finally {
      setBusy(false)
    }
  }

  async function enablePersist() {
    setPersisted(await requestPersistentStorage())
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm('Restoring will REPLACE all current data with this backup file. Continue?')) return
    await importAll(await file.text())
    alert('Backup restored.')
    e.target.value = ''
  }

  return (
    <div className="home">
      <div className="home-hero">
        <h1>Your Worlds Await</h1>
        <p>Write, link, and map the lore of everything you create.</p>
        <div className="home-cta">
          <button className="primary-btn" onClick={handleNew}>+ New page</button>
          <Link to="/map" className="ghost-btn">Open maps</Link>
        </div>
      </div>

      <div className="home-stats">
        <div className="stat"><span className="stat-num">{total}</span> pages</div>
        <div className="stat"><span className="stat-num">{mapCount}</span> maps</div>
      </div>

      <section className="home-section">
        <h2>Recently edited</h2>
        {recent.length === 0 ? (
          <p className="empty-hint">Nothing yet — create your first lore page to get started.</p>
        ) : (
          <div className="card-grid">
            {recent.map((p) => (
              <Link key={p.id} to={`/page/${p.id}`} className="lore-card">
                <span className="card-badge" style={{ background: categoryColor(p.category) }}>{p.category}</span>
                <h3>{p.title}</h3>
                {p.summary && <p>{p.summary}</p>}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="home-section backup">
        <h2>Backup &amp; safety</h2>

        <div className="backup-status">
          <div className={`status-row ${needsBackup ? 'warn' : 'ok'}`}>
            <span className="status-dot" />
            {needsBackup
              ? 'You have changes that aren’t backed up yet.'
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

        <div className="home-cta">
          <button className="primary-btn" disabled={busy} onClick={handleBackup}>
            {busy ? 'Backing up…' : '⭳ Back up now'}
          </button>
          <button className="ghost-btn" onClick={() => fileRef.current?.click()}>⭱ Restore from backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={handleImport} />
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
    </div>
  )
}
