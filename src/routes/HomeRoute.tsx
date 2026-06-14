import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  createPage,
  importAll,
  getMeta,
  setMeta,
  categoryColor,
  statusColor,
  pageStatus,
  STATUSES,
  type LorePage,
} from '../db'
import {
  LAST_BACKUP_KEY,
  downloadBackup,
  latestChangeTime,
  hasUnbackedUpChanges,
  isStoragePersisted,
  requestPersistentStorage,
  timeAgo,
} from '../backup'

/** Personalisable bits of the home page, stored as one row in the meta table. */
interface HomeConfig {
  title: string
  tagline: string
  about: string
  showAbout: boolean
  showOverview: boolean
  showRecent: boolean
}

/** Stable empty array so the live query doesn't feed `useMemo` a fresh `[]`
 *  (forcing a recompute) on every render while pages are still loading. */
const NO_PAGES: LorePage[] = []

const HOME_CONFIG_KEY = 'home-config'
const DEFAULT_HOME: HomeConfig = {
  title: 'Your Worlds Await',
  tagline: 'Write, link, and map the lore of everything you create.',
  about: '',
  showAbout: true,
  showOverview: true,
  showRecent: true,
}

export default function HomeRoute() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [customizing, setCustomizing] = useState(false)

  // Home config lives in the meta table. We load it once into local state and
  // treat that as the source of truth while editing — merging each change onto
  // the async live-query value directly would let rapid edits to different
  // fields clobber one another.
  const savedConfig = useLiveQuery(() => getMeta<Partial<HomeConfig>>(HOME_CONFIG_KEY), [])
  const [draft, setDraft] = useState<HomeConfig | null>(null)
  // Initialise the draft from the saved config the first time it loads. Adjusting
  // state during render (instead of in an effect) is React's recommended pattern
  // for deriving state from an async/changing input.
  if (savedConfig !== undefined && draft === null) {
    setDraft({ ...DEFAULT_HOME, ...(savedConfig ?? {}) })
  }
  const cfg: HomeConfig = draft ?? { ...DEFAULT_HOME, ...(savedConfig ?? {}) }

  const pages = useLiveQuery(() => db.pages.toArray(), []) ?? NO_PAGES
  const recent = useLiveQuery(
    () => db.pages.orderBy('updatedAt').reverse().limit(8).toArray(),
    [],
  ) ?? []
  const mapCount = useLiveQuery(() => db.maps.count(), []) ?? 0
  const lastBackup = useLiveQuery(async () => (await db.meta.get(LAST_BACKUP_KEY))?.value as number | undefined, [])
  const latestChange = useLiveQuery(() => latestChangeTime(), []) ?? 0

  const needsBackup = hasUnbackedUpChanges(lastBackup ?? null, latestChange)

  // -- overview figures -----------------------------------------------------
  const total = pages.length
  const byType = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of pages) m.set(p.category, (m.get(p.category) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [pages])
  const byStatus = useMemo(
    () => STATUSES.map((s) => ({ ...s, count: pages.filter((p) => pageStatus(p) === s.name).length })),
    [pages],
  )
  const completePct = total ? Math.round((byStatus.find((s) => s.name === 'Complete')!.count / total) * 100) : 0

  useEffect(() => {
    isStoragePersisted().then(setPersisted)
  }, [])

  // Persist whenever the draft changes (functional update keeps merges correct
  // even across fast successive edits to different fields).
  useEffect(() => {
    if (draft) setMeta(HOME_CONFIG_KEY, draft)
  }, [draft])
  function saveConfig(patch: Partial<HomeConfig>) {
    setDraft((prev) => ({ ...(prev ?? { ...DEFAULT_HOME, ...(savedConfig ?? {}) }), ...patch }))
  }

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
        {customizing ? (
          <>
            <input
              className="home-title-input"
              value={cfg.title}
              onChange={(e) => saveConfig({ title: e.target.value })}
              placeholder="World name"
            />
            <input
              className="home-tagline-input"
              value={cfg.tagline}
              onChange={(e) => saveConfig({ tagline: e.target.value })}
              placeholder="A short tagline…"
            />
          </>
        ) : (
          <>
            <h1>{cfg.title || DEFAULT_HOME.title}</h1>
            {cfg.tagline && <p>{cfg.tagline}</p>}
          </>
        )}

        <div className="home-cta">
          <button className="primary-btn" onClick={handleNew}>+ New page</button>
          <Link to="/map" className="ghost-btn">Open maps</Link>
          <button className={customizing ? 'ghost-btn active' : 'ghost-btn'} onClick={() => setCustomizing((v) => !v)}>
            {customizing ? '✓ Done' : '✎ Customize'}
          </button>
        </div>

        {customizing && (
          <div className="home-customize">
            <label className="home-toggle">
              <input type="checkbox" checked={cfg.showAbout} onChange={(e) => saveConfig({ showAbout: e.target.checked })} />
              About this world
            </label>
            <label className="home-toggle">
              <input type="checkbox" checked={cfg.showOverview} onChange={(e) => saveConfig({ showOverview: e.target.checked })} />
              Overview
            </label>
            <label className="home-toggle">
              <input type="checkbox" checked={cfg.showRecent} onChange={(e) => saveConfig({ showRecent: e.target.checked })} />
              Recently edited
            </label>
          </div>
        )}
      </div>

      {/* About this world */}
      {(cfg.showAbout && (cfg.about || customizing)) && (
        <section className="home-section">
          <h2>About this world</h2>
          {customizing ? (
            <textarea
              className="home-about-input"
              value={cfg.about}
              onChange={(e) => saveConfig({ about: e.target.value })}
              placeholder="Describe your world, its premise, the tone you're going for…"
              rows={4}
            />
          ) : (
            <p className="home-about">{cfg.about}</p>
          )}
        </section>
      )}

      {/* Overview */}
      {cfg.showOverview && (
        <section className="home-section">
          <h2>Overview</h2>
          <div className="overview-cards">
            <div className="ov-card"><span className="ov-num">{total}</span><span className="ov-label">pages</span></div>
            <div className="ov-card"><span className="ov-num">{byType.length}</span><span className="ov-label">types in use</span></div>
            <div className="ov-card"><span className="ov-num">{mapCount}</span><span className="ov-label">maps</span></div>
            <div className="ov-card"><span className="ov-num">{completePct}%</span><span className="ov-label">complete</span></div>
          </div>

          {total === 0 ? (
            <p className="empty-hint">Your overview fills in as you add pages.</p>
          ) : (
            <div className="overview-breakdowns">
              <div className="ov-block">
                <h3>By type</h3>
                <div className="type-chips">
                  {byType.map(([name, count]) => (
                    <span key={name} className="type-chip">
                      <span className="type-chip-dot" style={{ background: categoryColor(name) }} />
                      {name}
                      <span className="type-chip-count">{count}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="ov-block">
                <h3>By status</h3>
                <div className="status-bar">
                  {byStatus.filter((s) => s.count > 0).map((s) => (
                    <div
                      key={s.name}
                      className="status-seg"
                      title={`${s.name}: ${s.count}`}
                      style={{ flexGrow: s.count, background: s.color }}
                    />
                  ))}
                </div>
                <div className="status-legend">
                  {byStatus.map((s) => (
                    <span key={s.name} className="legend-item">
                      <span className="legend-dot" style={{ background: s.color }} />
                      {s.name} <span className="muted">{s.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Recently edited */}
      {cfg.showRecent && (
        <section className="home-section">
          <h2>Recently edited</h2>
          {recent.length === 0 ? (
            <p className="empty-hint">Nothing yet — create your first lore page to get started.</p>
          ) : (
            <div className="card-grid">
              {recent.map((p) => (
                <Link key={p.id} to={`/page/${p.id}`} className="lore-card">
                  <div className="card-badges">
                    <span className="card-badge" style={{ background: categoryColor(p.category) }}>{p.category}</span>
                    <span className="status-badge" style={{ borderColor: statusColor(pageStatus(p)), color: statusColor(pageStatus(p)) }}>{pageStatus(p)}</span>
                  </div>
                  <h3>{p.title}</h3>
                  {p.summary && <p>{p.summary}</p>}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

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
