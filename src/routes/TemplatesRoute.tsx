import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  resetTemplate,
  type InfoboxTemplate,
  type TemplateItem,
} from '../db'

export default function TemplatesRoute() {
  const templates = useLiveQuery(() => db.templates.orderBy('name').toArray(), [])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Default the selection to the first template once they've loaded.
  useEffect(() => {
    if (templates && templates.length && !templates.some((t) => t.id === selectedId)) {
      setSelectedId(templates[0].id)
    }
  }, [templates, selectedId])

  if (!templates) return <div className="content-pad">Loading…</div>

  const selected = templates.find((t) => t.id === selectedId) ?? null

  async function handleNew() {
    const id = await createTemplate('New template')
    setSelectedId(id)
  }

  async function handleDelete(tpl: InfoboxTemplate) {
    if (!confirm(`Delete the "${tpl.name}" template? Pages already using it keep their fields.`)) return
    await deleteTemplate(tpl.id)
    setSelectedId(null)
  }

  // -- item editing (operates on the selected template) ---------------------
  function commitItems(items: TemplateItem[]) {
    if (selected) updateTemplate(selected.id, { items })
  }
  function setItem(index: number, patch: Partial<TemplateItem>) {
    if (!selected) return
    commitItems(selected.items.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }
  function addItem(item: TemplateItem) {
    if (selected) commitItems([...selected.items, item])
  }
  function removeItem(index: number) {
    if (selected) commitItems(selected.items.filter((_, i) => i !== index))
  }
  function moveItem(index: number, dir: -1 | 1) {
    if (!selected) return
    const target = index + dir
    if (target < 0 || target >= selected.items.length) return
    const next = [...selected.items]
    ;[next[index], next[target]] = [next[target], next[index]]
    commitItems(next)
  }

  return (
    <div className="templates-view content-pad">
      <header className="templates-header">
        <h1>Infobox templates</h1>
        <p className="templates-intro">
          Templates are starter rows for a page's infobox. Edit them here, or add your own —
          changes apply the next time a template is chosen on a page.
        </p>
      </header>

      <div className="templates-layout">
        {/* Template list */}
        <aside className="templates-list">
          {templates.map((t) => (
            <button
              key={t.id}
              className={t.id === selectedId ? 'template-pick active' : 'template-pick'}
              onClick={() => setSelectedId(t.id)}
            >
              <span className="template-pick-name">{t.name}</span>
              {t.builtin && <span className="template-builtin-tag">built-in</span>}
            </button>
          ))}
          <button className="mini-btn template-new" onClick={handleNew}>＋ New template</button>
        </aside>

        {/* Selected template editor */}
        {selected ? (
          <section className="template-editor">
            <div className="template-editor-head">
              <input
                className="template-name-input"
                value={selected.name}
                onChange={(e) => updateTemplate(selected.id, { name: e.target.value })}
                placeholder="Template name"
              />
              {selected.builtin ? (
                <button className="mini-btn" onClick={() => resetTemplate(selected.id)} title="Restore shipped rows">
                  ↺ Reset
                </button>
              ) : (
                <button className="mini-btn danger" onClick={() => handleDelete(selected)}>Delete</button>
              )}
            </div>

            <div className="template-items">
              {selected.items.length === 0 && (
                <p className="empty-hint">No rows yet. Add a field or a separator below.</p>
              )}
              {selected.items.map((it, i) => (
                <div key={i} className={it.separator ? 'template-item separator' : 'template-item'}>
                  <div className="template-item-move">
                    <button className="tag-x" title="Move up" disabled={i === 0} onClick={() => moveItem(i, -1)}>▲</button>
                    <button className="tag-x" title="Move down" disabled={i === selected.items.length - 1} onClick={() => moveItem(i, 1)}>▼</button>
                  </div>
                  <input
                    className="template-item-label"
                    value={it.label}
                    placeholder={it.separator ? 'Section heading…' : 'Field label…'}
                    onChange={(e) => setItem(i, { label: e.target.value })}
                  />
                  <span className="template-item-kind">{it.separator ? 'separator' : 'field'}</span>
                  <button className="tag-x" title="Remove row" onClick={() => removeItem(i)}>×</button>
                </div>
              ))}
            </div>

            <div className="template-editor-actions">
              <button className="mini-btn" onClick={() => addItem({ label: 'New field' })}>＋ Add field</button>
              <button className="mini-btn" onClick={() => addItem({ label: 'Section', separator: true })}>＋ Add separator</button>
            </div>
          </section>
        ) : (
          <section className="template-editor empty">
            <p className="empty-hint">Select a template, or create a new one.</p>
          </section>
        )}
      </div>
    </div>
  )
}
