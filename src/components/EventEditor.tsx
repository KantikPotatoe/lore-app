// src/components/EventEditor.tsx
import { useState } from 'react'
import LoreEditor from './LoreEditor'
import { addEvent, updateEvent, deleteEvent, type Calendar, type TimelineEvent, type LorePage } from '../db'
import { eraForYear } from '../calendar'

interface Props {
  event?: TimelineEvent
  calendars: Calendar[]
  allPages: LorePage[]
  onClose: () => void
}

interface Draft {
  calendarId: string
  title: string
  description: string
  category: string
  color: string
  pageId: string | null
  startYear: number
  startMonth: number
  startDay: number
  hasEnd: boolean
  endYear: number
  endMonth: number
  endDay: number
}

function initDraft(event: TimelineEvent | undefined, calendars: Calendar[]): Draft {
  const defaultCalId = calendars[0]?.id ?? ''
  return {
    calendarId:  event?.calendarId ?? defaultCalId,
    title:       event?.title ?? '',
    description: event?.description ?? '',
    category:    event?.category ?? '',
    color:       event?.color ?? '',
    pageId:      event?.pageId ?? null,
    startYear:   event?.startYear ?? 0,
    startMonth:  event?.startMonth ?? 0,
    startDay:    event?.startDay ?? 1,
    hasEnd:      event?.endYear != null,
    endYear:     event?.endYear ?? 0,
    endMonth:    event?.endMonth ?? 0,
    endDay:      event?.endDay ?? 1,
  }
}

export default function EventEditor({ event, calendars, allPages, onClose }: Props) {
  const [draft, setDraft] = useState<Draft>(() => initDraft(event, calendars))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const cal = calendars.find((c) => c.id === draft.calendarId) ?? calendars[0]
  const maxDay = cal?.months[draft.startMonth]?.days ?? 28
  const maxEndDay = cal?.months[draft.endMonth]?.days ?? 28
  const startEra = cal ? eraForYear(cal, draft.startYear) : null

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function handleCalendarChange(calId: string) {
    const newCal = calendars.find((c) => c.id === calId)
    if (!newCal) return
    const sm = Math.min(draft.startMonth, newCal.months.length - 1)
    const sd = Math.min(draft.startDay, newCal.months[sm]?.days ?? 1)
    const em = Math.min(draft.endMonth, newCal.months.length - 1)
    const ed = Math.min(draft.endDay, newCal.months[em]?.days ?? 1)
    setDraft((d) => ({ ...d, calendarId: calId, startMonth: sm, startDay: sd, endMonth: em, endDay: ed }))
  }

  async function handleSave() {
    if (!draft.title.trim()) { setError('Title is required.'); return }
    if (!cal) { setError('Select a calendar.'); return }
    setSaving(true)
    setError('')
    try {
      const data = {
        calendarId:  draft.calendarId,
        title:       draft.title.trim(),
        description: draft.description,
        category:    draft.category.trim(),
        color:       draft.color || undefined,
        pageId:      draft.pageId,
        startYear:   draft.startYear,
        startMonth:  draft.startMonth,
        startDay:    Math.min(draft.startDay, maxDay),
        endYear:     draft.hasEnd ? draft.endYear : undefined,
        endMonth:    draft.hasEnd ? draft.endMonth : undefined,
        endDay:      draft.hasEnd ? Math.min(draft.endDay, maxEndDay) : undefined,
      }
      if (event) {
        await updateEvent(event.id, data)
      } else {
        await addEvent(data)
      }
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event) return
    if (!confirm(`Delete "${event.title}"? This cannot be undone.`)) return
    await deleteEvent(event.id)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-lg event-editor">
        <div className="cal-editor-head">
          <h2 className="modal-title">{event ? 'Edit event' : 'New event'}</h2>
          <button className="tag-x" onClick={onClose}>×</button>
        </div>

        {error && <p style={{ color: 'var(--danger)', marginBottom: 8, fontSize: 13 }}>{error}</p>}

        <div className="event-editor-grid">
          <div className="event-editor-left">
            <label className="field-label">Calendar</label>
            <select
              value={draft.calendarId}
              onChange={(e) => handleCalendarChange(e.target.value)}
              className="tl-select"
            >
              {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <label className="field-label">
              Start date
              {startEra && <span className="era-badge" style={{ background: startEra.color ?? 'var(--panel-2)' }}>{startEra.name}</span>}
            </label>
            <div className="date-row">
              <input
                type="number"
                value={draft.startYear}
                onChange={(e) => set('startYear', parseInt(e.target.value) || 0)}
                className="date-year"
                placeholder="Year"
              />
              <select
                value={draft.startMonth}
                onChange={(e) => {
                  const m = parseInt(e.target.value)
                  const maxD = cal?.months[m]?.days ?? 28
                  setDraft((d) => ({ ...d, startMonth: m, startDay: Math.min(d.startDay, maxD) }))
                }}
                className="tl-select"
              >
                {(cal?.months ?? []).map((m, i) => (
                  <option key={i} value={i}>{m.name}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={maxDay}
                value={draft.startDay}
                onChange={(e) => set('startDay', Math.max(1, Math.min(maxDay, parseInt(e.target.value) || 1)))}
                style={{ width: 60 }}
                placeholder="Day"
              />
            </div>

            <label className="field-label">
              <input
                type="checkbox"
                checked={draft.hasEnd}
                onChange={(e) => set('hasEnd', e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Has end date (span)
            </label>
            {draft.hasEnd && (
              <div className="date-row">
                <input
                  type="number"
                  value={draft.endYear}
                  onChange={(e) => set('endYear', parseInt(e.target.value) || 0)}
                  className="date-year"
                  placeholder="Year"
                />
                <select
                  value={draft.endMonth}
                  onChange={(e) => {
                    const m = parseInt(e.target.value)
                    const maxD = cal?.months[m]?.days ?? 28
                    setDraft((d) => ({ ...d, endMonth: m, endDay: Math.min(d.endDay, maxD) }))
                  }}
                  className="tl-select"
                >
                  {(cal?.months ?? []).map((m, i) => (
                    <option key={i} value={i}>{m.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={maxEndDay}
                  value={draft.endDay}
                  onChange={(e) => set('endDay', Math.max(1, Math.min(maxEndDay, parseInt(e.target.value) || 1)))}
                  style={{ width: 60 }}
                  placeholder="Day"
                />
              </div>
            )}

            <label className="field-label">Title</label>
            <input
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Event title"
              className="tpl-name-input"
            />

            <label className="field-label">Category</label>
            <input
              value={draft.category}
              onChange={(e) => set('category', e.target.value)}
              placeholder="e.g. Battle, Birth, Founding"
              className="tpl-name-input"
            />

            <div className="field-row" style={{ marginTop: 4 }}>
              <label className="field-label" style={{ minWidth: 60 }}>Color</label>
              <input
                type="color"
                value={draft.color || '#c9a24b'}
                onChange={(e) => set('color', e.target.value)}
                style={{ width: 36, height: 28, padding: 2, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }}
              />
              {draft.color && (
                <button className="mini-btn" onClick={() => set('color', '')}>clear</button>
              )}
            </div>

            <label className="field-label">Linked page</label>
            <select
              value={draft.pageId ?? ''}
              onChange={(e) => set('pageId', e.target.value || null)}
              className="tl-select"
            >
              <option value="">— none —</option>
              {allPages.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>

          <div className="event-editor-right">
            <label className="field-label">Description</label>
            <div className="event-editor-desc">
              <LoreEditor
                content={draft.description}
                editable
                onChange={(html) => set('description', html)}
                onWikiClick={() => {}}
              />
            </div>
          </div>
        </div>

        <div className="modal-actions">
          {event && (
            <button className="ghost-btn danger" onClick={handleDelete} style={{ marginRight: 'auto' }}>
              Delete event
            </button>
          )}
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : event ? 'Save changes' : 'Add event'}
          </button>
        </div>
      </div>
    </div>
  )
}
