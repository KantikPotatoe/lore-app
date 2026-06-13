import { useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPage, exportAll, importAll, categoryColor } from '../db'

export default function HomeRoute() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const recent = useLiveQuery(
    () => db.pages.orderBy('updatedAt').reverse().limit(8).toArray(),
    [],
  ) ?? []
  const total = useLiveQuery(() => db.pages.count(), []) ?? 0
  const mapCount = useLiveQuery(() => db.maps.count(), []) ?? 0

  async function handleNew() {
    const id = await createPage()
    navigate(`/page/${id}`)
  }

  async function handleExport() {
    const json = await exportAll()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lore-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm('Importing will REPLACE all current data with the backup. Continue?')) return
    await importAll(await file.text())
    alert('Backup restored.')
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
        <h2>Backup</h2>
        <p className="muted">Your lore lives in this browser. Export regularly to keep a safe copy.</p>
        <div className="home-cta">
          <button className="ghost-btn" onClick={handleExport}>⭳ Export backup</button>
          <button className="ghost-btn" onClick={() => fileRef.current?.click()}>⭱ Import backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={handleImport} />
        </div>
      </section>
    </div>
  )
}
