# Timeline Visual Redesign

**Date:** 2026-06-16  
**Status:** Approved

## Goal

Make the Timeline's List view and Axis view visually match the app's dark fantasy parchment aesthetic (warm browns, gold accent, Cinzel/EB Garamond fonts). Both views are currently functional but spartan; neither leverages the color, typography, or texture available in the design system.

---

## Design Decisions

- **List view style:** Chronicle Cards — colored header strip per event, era-colored centered dividers
- **Axis view style:** Ruler + Glow — Cinzel ruler with major/minor ticks, glowing events, gradient era bands
- **Era headers:** Each era uses its own `era.color`, not a uniform gold
- **Event icons:** Optional emoji field added to `TimelineEvent`, shown in card header and axis blocks
- **Event images:** Pull from the linked lore page's infobox image when `pageId` is set — no separate upload; zero extra storage

---

## 1. Data Model (`src/db.ts`)

Add one optional field to `TimelineEvent`:

```ts
/** Optional single emoji shown in the card header and axis block. */
icon?: string
```

No Dexie schema version bump required — this is a new optional field on existing rows; missing values are simply `undefined`.

`EventEditor` gets a small text input for this field (placeholder `"emoji · optional"`).

---

## 2. List View (`TimelineVertical.tsx` + CSS)

### Era headers

Replace the current left-border heading with a **centered divider**:

```
─────────────── The Age of Roots ───────────────
```

The era name is displayed in `era.color` (Cinzel, uppercase, letter-spaced). The horizontal lines are `::before`/`::after` pseudo-elements using `var(--border)`. If no era exists (pre-history group), use `var(--ink-faint)`.

### Event cards

Each card gains a **colored header strip** at the top (background: `event.color + '22'`, i.e. 13% opacity):

```
[ 🔥  HISTORICAL                          Year 1, Spring ]
  Founding of the First Hearth
  The settlers gathered on the hill and lit the sacred flame…
  → The First Hearth (Lore Page)
```

Strip contents (left to right):
- **Icon** (`event.icon`) — 14 px emoji, only rendered if set
- **Category badge** — 10 px, bold, uppercase, `event.color`
- **Date** — right-aligned, 10 px, `rgba(255,255,255,0.45)`

Card body below the strip:
- **Title** — Cinzel 13 px
- **Description** — EB Garamond italic 12 px, clamped to 4 lines (unchanged)
- **Linked page image** — if `event.pageId` resolves to a page whose `infobox?.image` (`LorePage.infobox.image`, a data URL string) is set, render a 52×52 px rounded thumbnail flush-right in the card body. The thumbnail is purely decorative; clicking the card still opens the editor.
- **"→ Page title" link** — unchanged, shown below description when `pageId` is set

Cards with no icon, no description, and no image are compact (header strip + title only) and still look clean.

---

## 3. Axis View (`TimelineHorizontal.tsx` + CSS)

### Ruler header (replaces current plain header)

Height increases from 44 px → 48 px. Styling:

- Background: `linear-gradient(to bottom, var(--bg-2), var(--bg))`
- Bottom border: `2px solid #5a4e35` (warm gold-brown)
- **Major ticks** (era boundaries or centuries): 16 px tall, `var(--accent)` at 55% opacity, label in Cinzel 10 px gold
- **Minor ticks** (regular years): 8 px tall, `#5a4e35`, label in Cinzel 10 px `var(--ink-faint)`

The tick-density logic (the `step` calculation) is unchanged — only the visual treatment differs.

### Era bands

Current: solid `era.color + '18'` fill.  
New: `linear-gradient(to right, {color}06, {color}14, {color}06)` — a gentle gradient fade that adds depth without overwhelming the events. Era label retains Cinzel styling but at `opacity: 0.45`.

### Event blocks

Current: solid filled rectangles with `border-radius: 4px`.  
New changes:

- `border-radius: 6px`
- `border-top: 1px solid rgba(255,255,255,0.18)` — a subtle "lit edge"
- `box-shadow: 0 0 14px {color}44` — glow matching the event color (44 = 27% opacity hex)
  - Darker/red events (`#c05050`) get `66` opacity (40%) so they read clearly
- **Icon** (`event.icon`) — shown as a 13 px emoji at the left edge of the block when `w > 40` px, before the label
- Text color: determined by perceived luminance of `event.color`. Use the formula `R×0.299 + G×0.587 + B×0.114`; if the result is < 128, use `rgba(255,255,255,0.85)`, otherwise `rgba(0,0,0,0.75)`. Fall back to dark text when `event.color` is undefined (i.e. using `var(--accent)` gold).

Lane strips (subtle alternating row backgrounds) are added: `rgba(255,255,255,0.012)` with a 1 px bottom border at `rgba(255,255,255,0.025)`. These give the lanes visual separation without distracting from the events.

---

## 4. Event Editor (`EventEditor.tsx`)

Add a single new row in the left column of the event editor grid:

```
Icon    [ ⚔️ _________________ ]  (text input, maxLength=2, placeholder="emoji · optional")
```

Placed below the Color picker row. The value is stored as `event.icon`. No emoji picker library — a plain text input is sufficient; the user types or pastes an emoji.

---

## 5. Files Changed

| File | Change |
|---|---|
| `src/db.ts` | Add `icon?: string` to `TimelineEvent` interface |
| `src/components/EventEditor.tsx` | Add Icon field input |
| `src/components/TimelineVertical.tsx` | Chronicle Cards layout, era dividers, linked page thumbnail |
| `src/components/TimelineHorizontal.tsx` | Ruler header, era band gradients, glow events, lane strips, icon in block |
| `src/index.css` | Update `.tl-*` and `.horiz-*` classes; add new classes for card header strip, ruler ticks, lane strips |

No new dependencies. No routing changes. No Dexie schema version bump.

---

## Out of Scope

- Full image upload directly on events (can be added later as an additive change)
- Emoji picker UI component (plain text input is sufficient)
- Any changes to the toolbar, CalendarEditor, or EventEditor layout beyond the Icon field
