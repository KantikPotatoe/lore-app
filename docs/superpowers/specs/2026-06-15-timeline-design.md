# Timeline Feature — Design Spec

**Date:** 2026-06-15  
**Status:** Approved

---

## Overview

Lore Codex has no concept of in-world time. This feature adds a WorldAnvil-style **timeline**: a chronology of dated events expressed in **custom in-world calendars**, browsable as a vertical history and a horizontal axis, with links to lore pages.

---

## Decisions

| Topic | Decision |
|---|---|
| Calendar model | Full custom (named months, eras, weekdays; **no leap rules**) |
| Calendars per world | Multiple |
| Cross-calendar alignment | **Shared absolute-day axis** (each calendar has one `anchor` offset) |
| Event features | Date ranges/spans, page link, category/color, rich-text description |
| Visual layout | Vertical chronology + horizontal axis, **toggleable** |

---

## The Shared Absolute-Day Axis

Because there are **no leap rules**, every calendar has a constant year length (`Σ month.days`), so date↔axis conversion is pure arithmetic.

- A hidden integer **absolute day** is the shared ruler for all calendars.
- Each `Calendar` stores one **`anchor`**: which absolute day its Year 0, Month 0, Day 1 sits on (defaults to `0` — a single-calendar world never touches it).
- **Eras** are labeled ranges on a calendar's continuous year axis. Events store a **continuous year**; the entry UI offers an era dropdown + year-within-era that computes the continuous year.

### `src/calendar.ts` — pure conversion module

```ts
yearLength(cal)            → number          // Σ cal.months[].days
dateToAbsolute(cal, d)     → number          // anchor + year*yearLength + daysBeforeMonth + (day-1)
absoluteToDate(cal, abs)   → { year, month, day, weekdayIndex }
eraForYear(cal, year)      → CalendarEra | null
formatDate(cal, d, opts)   → string          // "9th of Seedfall, Year 412 (Imperial Era)"
```

**Display-in-chosen-reckoning:** a toolbar **Reckoning** picker lets you view the whole timeline in any calendar. Each event is stored with `startAbsolute`/`endAbsolute`; re-display calls `absoluteToDate(chosenCal, abs)`.

---

## Data Model

### New interfaces (beside `WorldMap`/`MapPin` in `src/db.ts`)

```ts
interface CalendarMonth { name: string; days: number }
interface CalendarEra   { id: string; name: string; startYear: number; color?: string }
interface Calendar {
  id: string; name: string; anchor: number;
  months: CalendarMonth[]; weekdays: string[]; eras: CalendarEra[];
  createdAt: number
}
interface TimelineEvent {
  id: string; calendarId: string
  title: string; description: string            // rich-text HTML via LoreEditor
  category: string; color?: string
  pageId: string | null                         // linked LorePage stored id (like MapPin.pageId)
  startYear: number; startMonth: number; startDay: number
  endYear?: number; endMonth?: number; endDay?: number
  startAbsolute: number; endAbsolute?: number   // computed cache; drives sort + plot
  createdAt: number; updatedAt: number
}
```

### Schema v5 (Dexie)

```ts
this.version(5).stores({
  pages: 'id, title, category, updatedAt',
  maps: 'id, name, createdAt',
  pins: 'id, mapId, pageId',
  meta: '&key',
  templates: 'id, name',
  snapshots: '++id, timestamp',
  calendars: 'id, name, createdAt',           // NEW
  events: 'id, calendarId, startAbsolute, pageId',  // NEW
})
```

### CRUD helpers (in `src/db.ts`, mirror Map pattern)

- `getCalendars / createCalendar / updateCalendar / deleteCalendar` — cascade-delete events when calendar is deleted; confirm dialog like `deleteMap`.
- `addEvent / updateEvent / deleteEvent` — recompute `startAbsolute` / `endAbsolute` via `calendar.ts` on every write.
- `seedDefaultCalendar()` — seeds one "Standard Calendar" (12 months, 7 weekdays, one starting era) on first Timeline visit. Modeled on `seedTemplates()`.

### Backup (export `version` 2 → 3)

Extend `BackupData`, `BackupCounts`, `parseBackup()`, `exportAll()`, and `importAll()` to include `calendars` and `events`. Older backups import cleanly; `seedDefaultCalendar()` fills the gap.

---

## UI Architecture

### Routing & navigation

- `src/App.tsx` — add `<Route path="/timeline" element={<TimelineRoute />} />` beside `/map`.
- `src/components/Sidebar.tsx` — add `<Link to="/timeline">Timeline</Link>` to `.top-nav`, same `startsWith` active-class pattern.

### `src/routes/TimelineRoute.tsx` (data owner — MapRoute analogue)

- `useLiveQuery` for calendars, events (`orderBy('startAbsolute')`), and `allPages` (page-link dropdown).
- Toolbar: **Reckoning** picker, **Vertical | Horizontal** toggle, **category filter**, **Add event**, **Manage calendars**.
- Direct `db` writes (no intermediate state), like MapRoute.

### Presentational components

| Component | Role |
|---|---|
| `src/components/TimelineVertical.tsx` | Scrolling column; events grouped by the chosen reckoning's eras; each event is a card (date, color, description, page link); spans show extended cards |
| `src/components/TimelineHorizontal.tsx` | Zoom/pan horizontal axis; eras as background bands; points as dots, spans as bars; simple lane layout to avoid overlap |
| `src/components/EventEditor.tsx` | Modal: title, calendar picker, era + year-in-era + month + day inputs, optional end date, category/color, page-link dropdown, LoreEditor for rich description |
| `src/components/CalendarEditor.tsx` | Modal: add/rename/delete calendars; edit anchor, months (name+days, reorderable), weekday names, eras (name+startYear+color). Mirrors Templates screen feel. |

---

## Build Order

1. **Foundation** — schema v5, interfaces, `src/calendar.ts`, calendar CRUD, `seedDefaultCalendar`, event CRUD, backup wiring, sidebar link + route stub.
2. **Vertical chronology** — `TimelineRoute`, `TimelineVertical`, `EventEditor`, `CalendarEditor`, page links, category/color, reckoning picker. Feature is fully usable here.
3. **Horizontal axis + toggle** — `TimelineHorizontal` with zoom/pan/lane layout; wire the view toggle.
4. *(Optional follow-up)* — Show linked events on a page's `PageRoute` view.

---

## Verification Checklist

1. `npm run build` passes with no type errors.
2. First visit to `/timeline` shows a seeded default calendar, immediately usable.
3. Events from two differently-anchored calendars interleave correctly in chronological order.
4. Switching the **Reckoning** picker re-expresses all dates in the chosen calendar.
5. Clicking a linked event navigates to `/page/:id`. Wiki links inside event descriptions resolve.
6. Toggle between Vertical and Horizontal; eras render as bands, spans as bars.
7. Export → clear → import round-trips calendars + events; counts appear in the confirm dialog.
8. Deleting a calendar with events shows a confirmation dialog and cascades correctly.
