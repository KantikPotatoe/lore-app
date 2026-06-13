import { useRef } from 'react'
import {
  type Infobox,
  type InfoboxField,
  INFOBOX_TEMPLATE_NAMES,
  applyTemplate,
} from '../db'
import WikiText from './WikiText'

interface Props {
  box: Infobox
  editable: boolean
  /** Persist a changed infobox. */
  onChange: (box: Infobox) => void
  /** Remove the infobox entirely (edit mode only). */
  onRemove: () => void
  /** Title of the page, shown as the infobox heading. */
  title: string
  /** Accent color (from the page category) for the heading bar. */
  accent: string
  /** Follow a [[wiki link]] in a field value (view mode). */
  onWikiClick: (title: string) => void
}

export default function Infobox({ box, editable, onChange, onRemove, title, accent, onWikiClick }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const filledFields = box.fields.filter((f) => f.value.trim())
  const hasContent = box.image || filledFields.length > 0

  // In view mode, an empty infobox shows nothing at all.
  if (!editable && !hasContent) return null

  // -- field helpers --------------------------------------------------------
  function setField(id: string, patch: Partial<InfoboxField>) {
    onChange({ ...box, fields: box.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  }
  function addField() {
    onChange({ ...box, fields: [...box.fields, { id: crypto.randomUUID(), label: 'New field', value: '' }] })
  }
  function removeField(id: string) {
    onChange({ ...box, fields: box.fields.filter((f) => f.id !== id) })
  }

  // -- image helpers --------------------------------------------------------
  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await readFileAsDataURL(file)
    onChange({ ...box, image: dataUrl })
    e.target.value = ''
  }

  return (
    <aside className="infobox">
      <div className="infobox-title" style={{ background: accent }}>{title}</div>

      {/* Image */}
      {box.image ? (
        <figure className="infobox-figure">
          <img src={box.image} alt={title} />
          {editable ? (
            <>
              <input
                className="infobox-caption-input"
                placeholder="caption…"
                value={box.caption}
                onChange={(e) => onChange({ ...box, caption: e.target.value })}
              />
              <div className="infobox-img-actions">
                <button className="mini-btn" onClick={() => fileRef.current?.click()}>Replace</button>
                <button className="mini-btn danger" onClick={() => onChange({ ...box, image: null, caption: '' })}>Remove</button>
              </div>
            </>
          ) : (
            box.caption && <figcaption>{box.caption}</figcaption>
          )}
        </figure>
      ) : (
        editable && (
          <button className="infobox-add-image" onClick={() => fileRef.current?.click()}>
            ＋ Add image
          </button>
        )
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />

      {/* Template picker (edit mode only) */}
      {editable && (
        <div className="infobox-template">
          <label>Template</label>
          <select value={box.template} onChange={(e) => onChange(applyTemplate(box, e.target.value))}>
            {INFOBOX_TEMPLATE_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* Fields */}
      <div className="infobox-fields">
        {editable
          ? box.fields.map((f) => (
              <div key={f.id} className="infobox-row editing">
                <input
                  className="infobox-label-input"
                  value={f.label}
                  onChange={(e) => setField(f.id, { label: e.target.value })}
                />
                <input
                  className="infobox-value-input"
                  placeholder="value…"
                  value={f.value}
                  onChange={(e) => setField(f.id, { value: e.target.value })}
                />
                <button className="tag-x" title="Remove field" onClick={() => removeField(f.id)}>×</button>
              </div>
            ))
          : filledFields.map((f) => (
              <div key={f.id} className="infobox-row">
                <span className="infobox-label">{f.label}</span>
                <span className="infobox-value">
                  <WikiText value={f.value} onWikiClick={onWikiClick} />
                </span>
              </div>
            ))}
      </div>

      {editable && (
        <div className="infobox-actions">
          <button className="mini-btn" onClick={addField}>＋ Add field</button>
          <button className="mini-btn danger" onClick={onRemove}>Delete infobox</button>
          <span className="infobox-hint">Use [[Name]] to link a page</span>
        </div>
      )}
    </aside>
  )
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
