import { useNavigate } from 'react-router-dom'
import { absoluteToDate, eraForYear, formatDate, yearLength } from '../calendar'
import type { Calendar, TimelineEvent, LorePage, CalendarEra } from '../db'

interface Props {
  events: TimelineEvent[]
  calendars: Calendar[]
  displayCalendar: Calendar | null
  allPages: LorePage[]
  onEdit: (event: TimelineEvent) => void
}

interface EraGroup {
  era: CalendarEra | null
  events: TimelineEvent[]
}

function groupByEra(events: TimelineEvent[], displayCal: Calendar): EraGroup[] {
  const eras = [...displayCal.eras].sort((a, b) => a.startYear - b.startYear)

  if (!eras.length) return [{ era: null, events }]

  const groups: EraGroup[] = eras.map((era) => ({ era, events: [] }))
  const preEra: EraGroup = { era: null, events: [] }

  for (const event of events) {
    const yl = yearLength(displayCal)
    if (yl === 0) { preEra.events.push(event); continue }
    const { year } = absoluteToDate(displayCal, event.startAbsolute)
    const era = eraForYear(displayCal, year)
    const group = era ? groups.find((g) => g.era?.id === era.id) : null
    if (group) group.events.push(event)
    else preEra.events.push(event)
  }

  const result: EraGroup[] = []
  if (preEra.events.length) result.push(preEra)
  result.push(...groups.filter((g) => g.events.length > 0))
  return result
}

export default function TimelineVertical({
  events,
  calendars,
  displayCalendar,
  allPages,
  onEdit,
}: Props) {
  const navigate = useNavigate()
  const displayCal = displayCalendar ?? calendars[0]

  if (!displayCal || events.length === 0) {
    return <div className="tl-vert-empty"><p className="muted">No events to display.</p></div>
  }

  const groups = groupByEra(events, displayCal)
  const pageById = new Map(allPages.map((p) => [p.id, p]))

  return (
    <div className="tl-vert">
      {groups.map((group, gi) => (
        <div key={group.era?.id ?? `pre-${gi}`} className="tl-era-group">
          <div
            className="tl-era-header"
            style={{ borderColor: group.era?.color ?? 'var(--border)' }}
          >
            {group.era ? group.era.name : 'Before recorded history'}
          </div>

          <div className="tl-era-events">
            {group.events.map((event) => {
              const { year: sy, month: sm, day: sd } = absoluteToDate(displayCal, event.startAbsolute)
              const startLabel = formatDate(displayCal, sy, sm, sd, { showEra: false })
              const endLabel = event.endAbsolute != null
                ? (() => {
                    const { year: ey, month: em, day: ed } = absoluteToDate(displayCal, event.endAbsolute)
                    return formatDate(displayCal, ey, em, ed, { showEra: false })
                  })()
                : null
              const dateLabel = endLabel ? `${startLabel} — ${endLabel}` : startLabel
              const linkedPage = event.pageId ? pageById.get(event.pageId) : null
              const accent = event.color ?? 'var(--accent)'

              return (
                <div
                  key={event.id}
                  className="tl-event-card"
                  style={{ borderLeftColor: accent }}
                  onClick={() => onEdit(event)}
                >
                  <div className="tl-event-date">{dateLabel}</div>
                  <div className="tl-event-title">{event.title}</div>
                  {event.category && (
                    <span className="tl-event-cat" style={{ background: accent + '33', color: accent }}>
                      {event.category}
                    </span>
                  )}
                  {event.description && (
                    <div
                      className="tl-event-desc"
                      dangerouslySetInnerHTML={{ __html: event.description }}
                    />
                  )}
                  {linkedPage && (
                    <button
                      className="ghost-btn tl-page-link"
                      onClick={(e) => { e.stopPropagation(); navigate(`/page/${linkedPage.id}`) }}
                    >
                      → {linkedPage.title}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
