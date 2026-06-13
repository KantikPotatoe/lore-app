import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updatePage, deletePage, getOrCreatePageByTitle, defaultInfobox, applyTemplate, STATUSES, categoryColor, statusColor, pageStatus, type Infobox as InfoboxType, type LorePage } from '../db'
import LoreEditor from '../components/LoreEditor'
import Infobox from '../components/Infobox'
import Backlinks from '../components/Backlinks'

export default function PageRoute() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const page = useLiveQuery(() => db.pages.get(id), [id])
  const templates = useLiveQuery(() => db.templates.orderBy('name').toArray(), []) ?? []

  const [editing, setEditing] = useState(false)
  const [tagInput, setTagInput] = useState('')

  // Start in view mode whenever you open a different page.
  useEffect(() => setEditing(false), [id])

  if (page === undefined) return <div className="content-pad">Loading…</div>
  if (page === null) return <div className="content-pad">This page doesn’t exist (it may have been deleted).</div>
  // The live query can briefly return the PREVIOUS page's data right after you
  // navigate. Wait until the loaded page actually matches the URL, otherwise the
  // editor would mount with stale content and keep it (see key={id} below).
  if (page.id !== id) return <div className="content-pad">Loading…</div>

  async function followWikiLink(title: string) {
    const targetId = await getOrCreatePageByTitle(title)
    navigate(`/page/${targetId}`)
  }

  async function addTag() {
    const t = tagInput.trim()
    if (!t || page!.tags.includes(t)) return setTagInput('')
    await updatePage(id, { tags: [...page!.tags, t] })
    setTagInput('')
  }

  async function removeTag(tag: string) {
    await updatePage(id, { tags: page!.tags.filter((t) => t !== tag) })
  }

  // Changing a page's type also re-seeds its infobox from that template
  // (keeping any values already filled in).
  async function changeCategory(category: string) {
    const changes: Partial<LorePage> = { category }
    const tpl = templates.find((t) => t.name === category)
    if (tpl && page!.infobox) changes.infobox = applyTemplate(page!.infobox, tpl)
    await updatePage(id, changes)
  }

  async function handleDelete() {
    if (!confirm(`Delete "${page!.title}"? This cannot be undone.`)) return
    await deletePage(id)
    navigate('/')
  }

  return (
    <div className="page-view">
      <header className="page-header" style={{ borderColor: categoryColor(page.category) }}>
        <div className="page-header-row">
          {editing ? (
            <input
              className="title-input"
              value={page.title}
              onChange={(e) => updatePage(id, { title: e.target.value })}
              placeholder="Page title"
            />
          ) : (
            <h1 className="page-title">{page.title}</h1>
          )}
          <div className="page-header-actions">
            <button className="ghost-btn" onClick={() => setEditing((v) => !v)}>
              {editing ? '✓ Done' : '✎ Edit'}
            </button>
            <button className="ghost-btn danger" onClick={handleDelete}>🗑</button>
          </div>
        </div>

        <div className="page-meta">
          {editing ? (
            <select
              className="category-select"
              value={page.category}
              onChange={(e) => changeCategory(e.target.value)}
            >
              {/* Keep the current type listed even if it was renamed/removed. */}
              {!templates.some((t) => t.name === page.category) && (
                <option value={page.category}>{page.category}</option>
              )}
              {templates.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          ) : (
            <span className="category-badge" style={{ background: categoryColor(page.category) }}>
              {page.category}
            </span>
          )}

          {editing ? (
            <select
              className="category-select"
              value={pageStatus(page)}
              onChange={(e) => updatePage(id, { status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          ) : (
            <span className="status-badge" style={{ borderColor: statusColor(pageStatus(page)), color: statusColor(pageStatus(page)) }}>
              {pageStatus(page)}
            </span>
          )}

          {editing ? (
            <input
              className="summary-input"
              value={page.summary}
              onChange={(e) => updatePage(id, { summary: e.target.value })}
              placeholder="One-line summary…"
            />
          ) : (
            page.summary && <span className="summary-text">{page.summary}</span>
          )}
        </div>

        <div className="tags-row">
          {page.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
              {editing && <button className="tag-x" onClick={() => removeTag(t)}>×</button>}
            </span>
          ))}
          {editing && (
            <input
              className="tag-input"
              placeholder="add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
              onBlur={addTag}
            />
          )}
        </div>
      </header>

      <div className="page-body">
        <div className="page-main">
          <LoreEditor
            key={id}
            content={page.content}
            editable={editing}
            onChange={(html) => updatePage(id, { content: html })}
            onWikiClick={followWikiLink}
          />
        </div>

        <div className="page-aside">
          {page.infobox ? (
            <Infobox
              box={page.infobox}
              editable={editing}
              title={page.title}
              accent={categoryColor(page.category)}
              onChange={(box: InfoboxType) => updatePage(id, { infobox: box })}
              onRemove={() => updatePage(id, { infobox: undefined })}
              onWikiClick={followWikiLink}
            />
          ) : (
            editing && (
              <button
                className="ghost-btn add-infobox-btn"
                onClick={async () => updatePage(id, { infobox: await defaultInfobox(page.category) })}
              >
                ＋ Add infobox
              </button>
            )
          )}

          <Backlinks pageId={id} />
        </div>
      </div>
    </div>
  )
}
