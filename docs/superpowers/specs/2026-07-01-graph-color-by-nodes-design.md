# Design — Color graph nodes by type / status / tag (#121)

**Milestone:** Graph & Relationships · **Effort:** medium · **Issue:** [#121](https://github.com/KantikPotatoe/lore-app/issues/121)

## Goal

Let the user recolor the relationship graph's nodes by one of three dimensions
instead of always by page type:

- **Type** — page category (current default; `categoryColor`).
- **Status** — Stub/Draft/WIP/Complete (`statusColor`). A "status" view instantly
  surfaces the unfinished corners of the world.
- **Tag** — highlight nodes carrying one chosen tag against a muted rest.

The chosen mode persists with the other graph view prefs and applies identically
in the 2D and 3D views.

## Background — current behavior

- Nodes are filled by `categoryColor(node.category)` in both `GraphView.tsx`
  (`paintNode`, ~line 154) and `GraphView3D.tsx` (`nodeColor`, ~line 49).
- Ghost nodes (missing-page stand-ins) render specially — a dashed muted outline
  in 2D, `GHOST_COLOR` in 3D — branching on `node.ghost`, not on color mode.
- The toolbar already has: category filter chips, a single-tag `<select>`, status
  filter chips, min-degree + depth sliders, and several toggles.
- View prefs persist through `useGraphPrefs` → `SavedView` → the meta store.
- Helpers `categoryColor(cat)` and `statusColor(name)` already exist and return
  color strings synchronously. Tags have no color helper.

## Design

### 1. Pure color helper — new `src/graphColor.ts`

Follows the codebase's pure-helper convention (`calendar.ts`, `citations.ts`,
`autolink.ts`): React-free and unit-testable.

```ts
export type ColorBy = 'type' | 'status' | 'tag'

// Fill color for a NON-ghost node. Callers keep their own ghost rendering.
export function nodeFill(node: GraphNode, colorBy: ColorBy, highlightTag: string): string
```

Behavior:

- `type` → `categoryColor(node.category)` (unchanged behavior).
- `status` → `statusColor(node.status)`.
- `tag` → `node.tags.includes(highlightTag) ? TAG_ACCENT : MUTED`.
  - `highlightTag === ''` ("All tags") → every node returns `MUTED`.

Constants defined in this module: `TAG_ACCENT` (a bright accent that reads on the
`#15130f` graph background) and `MUTED` (a dim neutral grey).

`GraphView.tsx` and `GraphView3D.tsx` call `nodeFill(...)` where they currently
call `categoryColor(node.category)`. Ghost branches are untouched.

### 2. Prefs — `useGraphPrefs.ts`

- Add `colorBy: ColorBy` to `SavedView`, default `'type'` in `DEFAULT_VIEW`.
- Add `colorBy` + `setColorBy` to the `GraphPrefs` interface and return value,
  wired exactly like `tag` / `minDegree` (`writeView({ ...view, colorBy: v })`).
- Back-compat is automatic: `view` is built as `{ ...DEFAULT_VIEW, ...savedView }`,
  so older persisted rows without `colorBy` fall back to `'type'`. No schema bump
  (meta rows are local-only and not part of backups).

### 3. Toolbar control — `GraphRoute.tsx`

A compact `<select>` labeled **"Color by"**, styled like the existing tag
`<select>`, with options Type / Status / Tag. Its value drives `colorBy`, passed
down to `GraphView` / `GraphView3D` along with the current `tag`.

### 4. Tag-mode filter suspension

When `colorBy === 'tag'`, the tag dropdown drives the highlight and stops
filtering (otherwise it would hide the very nodes the highlight wants to mute).
The tag clause in the `filtered` memo becomes:

```ts
(colorBy === 'tag' || tag === '' || n.tags.includes(tag))
```

All other filters (category, status, min-degree, depth, ghosts) keep working
unchanged.

## Confirmed behaviors

- **No tag selected in Tag mode:** every node renders `MUTED`; the toolbar hint
  nudges the user to pick a tag to highlight. No surprise auto-selection.
- **Filter chips keep their own dimension's colors** (category chips = category
  colors, status chips = status colors) regardless of the active color mode —
  they are filters, not a legend. The status chips already double as a status
  legend when that mode is on, so no separate legend widget is added.
- **Ghost nodes** keep their existing dashed/muted rendering in every mode.

## Out of scope (YAGNI)

- Palette-per-tag coloring (arbitrary tie-breaking for multi-tag nodes, palette
  exhaustion, no clean legend).
- A dedicated legend component.
- Recoloring the Hubs & Orphans panel list dots (they stay category-colored).

## Testing

- **`graphColor.test.ts`** — unit-test `nodeFill` across all three modes:
  type → `categoryColor`, status → `statusColor`, tag highlight (tagged →
  `TAG_ACCENT`, untagged → `MUTED`, empty `highlightTag` → all `MUTED`).
- **`useGraphPrefs.test.ts`** — `colorBy` defaults to `'type'`, persists, and
  round-trips through the meta store.
- **Manual** — toggle the three modes; confirm 2D/3D parity; verify Tag mode
  highlights the chosen tag and suspends tag filtering; confirm older persisted
  view prefs still load.

## Files touched

| File | Change |
|---|---|
| `src/graphColor.ts` | **new** — `ColorBy`, `nodeFill`, `TAG_ACCENT`, `MUTED` |
| `src/graphColor.test.ts` | **new** — unit tests for `nodeFill` |
| `src/components/GraphView.tsx` | call `nodeFill` in `paintNode`; accept `colorBy`/`tag` props |
| `src/components/GraphView3D.tsx` | call `nodeFill` in `nodeColor`; accept `colorBy`/`tag` props |
| `src/useGraphPrefs.ts` | add `colorBy` to `SavedView` + prefs API |
| `src/useGraphPrefs.test.ts` | cover `colorBy` persistence |
| `src/routes/GraphRoute.tsx` | "Color by" `<select>`; pass props; suspend tag filter in tag mode |
