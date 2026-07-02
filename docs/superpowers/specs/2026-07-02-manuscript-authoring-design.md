# Manuscript Authoring — Design

**Date:** 2026-07-02
**Status:** Approved (design), pending spec review
**Milestone:** Documents & Manuscripts (#10)

## Problem

The "Documents & Manuscripts" milestone as originally written under-scopes what a
manuscript should be. Its issues (#110–#114) frame manuscripts as *in-world books*
modeled as **just another page type** — a `LorePage` with a coloured category and
some starter `<h2>` sections. That is not the feature the author wants.

What is actually wanted is a **dedicated authoring workspace for the author's real
novel**: a structured writing environment with an outline, a plotline grid, story
structures, and the ability to pull characters/places from the worldbuilding wiki
into the manuscript. It is a distinct product surface, not an encyclopedia page.

This is the biggest untouched product area and closes the gap with Scrivener/Plottr
and World Anvil's manuscript features.

## Scope & non-goals

**In scope (this design, one spec, built in phases):**

- Book → Chapter → Scene authoring structure (multiple books per world).
- Rich-text scene editing reusing the existing Tiptap `LoreEditor`.
- Scene metadata: POV / cast / location references to wiki pages, status,
  synopsis, private notes, word count, optional word-count goals.
- A Plottr-style **plotline grid board** (plotline lanes × scene columns, beat cards).
- A **story-structure track** on the grid (Save the Cat / Hero's Journey / Snowflake).
- **Wiki integration:** an "Appears in" section on wiki pages driven by scene refs +
  inline `[[wiki-links]]`.
- Backup/import, snapshots, and EPUB + print-to-PDF export.

**Non-goals:**

- **In-world books/texts** (a grimoire, a treaty, an in-universe novel a character
  reads) remain served by the **existing `builtin-document` page type** and the
  shipped `DocLink` "attach documents to a page" primitive (#109). The manuscript
  feature is separate and does not absorb or retire the Document type.
- No collaborative/multi-user editing (the app is local-first, single machine).
- No bundled PDF-generation library in the first build (browser Save-as-PDF instead;
  a `pdf-lib`-based true PDF is a noted follow-up).

## Approach

**Approach C — dedicated model, reuse the good parts.** Dedicated Dexie tables for
the manuscript spine (books/chapters/scenes/plotlines/beats), kept entirely out of
the wiki page list, sidebar categories, and relationship graph so the wiki stays
uncluttered. But deliberately reuse:

- the Tiptap `LoreEditor` component for scene prose,
- the `RefField` picker for POV/cast/location wiki references,
- the backlinks concept (a new "Appears in" section) so wiki pages learn where they
  appear in the manuscript,
- the backup/import + snapshot patterns, extended to cover the new tables.

Rejected alternatives:

- **A — dedicated & isolated:** same tables but re-plumbing every cross-cutting
  system from scratch; C is A plus explicit, minimal reuse.
- **B — scenes are `LorePage`s:** stores scenes as wiki pages of a special category.
  Rejected: scenes would pollute the sidebar, graph, browse grids, and search as if
  they were encyclopedia entries, and POV/status/synopsis would be shoehorned into
  infobox fields. Leaky and confusing.

## Data model

New module **`src/db/manuscript.ts`**, re-exported from the `db/index.ts` barrel.
Dexie schema bumped **v9 → v10**. All tables are per-lore (same DB binding as the
rest). Types live in `src/db/types.ts` alongside the existing interfaces.

```ts
// A book/volume. A world can hold several (a series).
interface Book {
  id: string
  title: string
  synopsis: string          // short, plain text
  order: number             // position in the world's book list
  targetWordCount?: number  // optional goal
  createdAt: number; updatedAt: number
}

// A chapter within a book.
interface Chapter {
  id: string; bookId: string
  title: string
  order: number             // position within the book
  targetWordCount?: number
  createdAt: number; updatedAt: number
}

type SceneStatus = 'outline' | 'draft' | 'revised' | 'done'

// A scene — the atomic writing unit. Holds the prose.
interface Scene {
  id: string; bookId: string; chapterId: string
  title: string
  content: string           // Tiptap HTML (rendered by LoreEditor)
  synopsis: string          // short card summary, plain text
  notes: string             // private notes, plain text
  status: SceneStatus
  order: number             // position within the chapter
  wordCount: number         // cached, recomputed on save
  targetWordCount?: number
  povPageId: string | null      // wiki page: POV character
  castPageIds: string[]         // wiki pages present in the scene
  locationPageIds: string[]     // wiki pages: setting(s)
  createdAt: number; updatedAt: number
}

// A lane on the grid. 'plot' = a storyline you track; 'structure' = a
// story-structure track (fixed named beats). At most one 'structure' lane per book.
type StructureType = 'save-the-cat' | 'heros-journey' | 'snowflake'
interface Plotline {
  id: string; bookId: string
  name: string
  color: string
  kind: 'plot' | 'structure'
  structureType?: StructureType   // set only when kind==='structure'
  order: number
  createdAt: number; updatedAt: number
}

// A cell on the grid: what a plotline does in a scene.
interface Beat {
  id: string; bookId: string; plotlineId: string
  sceneId: string | null    // null = a structure beat not yet aligned to a scene
  label: string             // structure beats carry a fixed name ("Catalyst"); plot beats optional
  note: string              // the card text, plain/short HTML
  order: number             // structure beats: canonical order; plot beats: placement fallback
  createdAt: number; updatedAt: number
}
```

**Modeling choices:**

- **One `beats` table serves both cell kinds.** A plot beat is created when the user
  fills a `(plotline, scene)` cell. A structure lane, when created, seeds its beats
  from the chosen `StructureType` template (fixed labels, `sceneId: null`); the user
  assigns each to a scene to see pacing.
- **Grid columns = scenes**, visually grouped by chapter. Column order derives from
  `chapterId` + scene `order`; it is not stored separately.
- **Word counts cached on `Scene`**, rolled up for chapter/book at read time (cheap,
  reactive via `useLiveQuery`). Targets optional at scene/chapter/book level.
- **`SceneStatus`** is a manuscript-specific set with its own `STATUS_COLORS` map —
  deliberately *not* the page `STATUSES` — and drives grid/scene colors.
- **Structured refs store page ids, not titles**, so wiki renames never touch them
  (matches `DocLink` / `MapPin.pageId`).

CRUD lives in `manuscript.ts`: `createBook`/`updateBook`/`deleteBook` (cascades to
its chapters/scenes/plotlines/beats), analogous chapter/scene/plotline/beat CRUD,
`reorderScenes`/`reorderChapters`/`reorderPlotlines`, and `computeWordCount(html)`.

## Routes & writing UI

New top-level **"Manuscript"** nav entry in `<Sidebar>` — a peer of Map/Graph/
Timeline, not mixed into page categories.

| Path | Component | Purpose |
|---|---|---|
| `/manuscript` | `ManuscriptRoute` | Books index: cards (title, synopsis, word count vs. goal, scene count); create/rename/delete/reorder book |
| `/book/:bookId` | `BookRoute` | Book workspace hosting two views via a header segmented control: **Write** and **Grid** |

Scene selection inside `BookRoute` is local state with `?scene=<id>` in the hash for
deep-linking/back-button — not a separate route, to avoid editor remounts.

**Write view (`BookWriteView`) — two panes:**

- **Left: binder tree (`BinderTree`)** — chapters as collapsible groups, scenes
  nested. Drag to reorder scenes within/across chapters and chapters within the book.
  Each scene row shows a status dot + word count. "+ Chapter" / "+ Scene".
- **Right: scene editor (`SceneEditor`)** — wraps the existing **`LoreEditor`** for
  `scene.content`, unchanged, plus a **`SceneMetaPanel`**:
  - Title, status picker (Outline→Draft→Revised→Done), word count + optional target.
  - **POV** (single ref), **Cast** (multi ref), **Location** (multi ref) via the
    existing **`RefField`** picker.
  - Collapsible **Synopsis** and **Notes** plain-text textareas.

**Component boundaries** (each testable in isolation): `ManuscriptRoute` (books CRUD)
· `BookRoute` (view shell + scene selection) · `BookWriteView` → `BinderTree` +
`SceneEditor` (→ `LoreEditor` + `SceneMetaPanel`). All reads via `useLiveQuery`; all
writes via `manuscript.ts`. No DB-state prop-drilling.

## Grid board & structure track

The **Grid view (`BookGridView`)** renders `plotlines` (lanes) × `scenes` (columns)
with `beats` in the cells.

**Layout:**

- **Columns = scenes** in reading order, with a sticky **chapter band** spanning its
  scenes across the top. Column header: scene title + status dot.
- **Rows = plotlines**, each a colored lane with a sticky left gutter (plotline name).
  Row order = `plotline.order`; drag the gutter to reorder lanes.
- **Cell = a beat card.** Empty cells show a faint "+"; clicking creates a `Beat` for
  that `(plotline, scene)` and opens an inline `note` editor. A filled cell shows the
  note (and `label` if set), tinted by plotline color. Dragging a card rewrites its
  `sceneId`/`plotlineId`.
- A scene **in multiple plotlines** simply has a card in each of those rows — the
  multi-membership falls out of the model.

**Interactions:** add/rename/recolor/delete a plotline; add a scene column inline
(creates a `Scene`); click a column header to jump to that scene in the Write view;
cell colors reflect scene status (written vs. planned at a glance).

**Structure track:**

- A book has **at most one** `plotline` of `kind: 'structure'`, rendered as a pinned,
  visually distinct top lane.
- Choosing a `StructureType` seeds that lane's beats from a **built-in definition** —
  an ordered list of named beats (e.g. Save the Cat's 15). These live as pure data in
  **`src/manuscriptStructures.ts`** (no DB), like `BUILTIN_TEMPLATES`/`BUILTIN_SECTIONS`.
- Seeded beats start unassigned (`sceneId: null`) in an **"unplaced" tray** above the
  grid. Dragging a structure beat onto a scene column sets its `sceneId` ("this scene
  *is* the Catalyst"), giving the pacing read across the actual manuscript.
- Switching structure type reseeds the lane (with a confirm, since it discards
  placements); "None" removes the structure lane.

**Data flow:** the grid is derived in a `useMemo` from three `useLiveQuery` reads
(scenes, plotlines, beats) into a `{ columns, lanes, cellsByKey }` view-model keyed by
`plotlineId:sceneId` — mirroring how `GraphRoute` builds its view-model on demand
rather than persisting layout.

## Wiki integration, data safety & export

**Wiki backlinks ("Appears in").** Pure function in `manuscript.ts`:

```
sceneAppearances(pageId) → { sceneId, bookTitle, chapterTitle, sceneTitle, role }[]
```

Scans all scenes for the page id in `povPageId` / `castPageIds` / `locationPageIds`
(role = pov/cast/location) **and** for inline `[[wiki-links]]` in `scene.content`
(reusing `wikiLinkTitles()` from `src/html.ts`, resolved via `findPageIdByTitle`).
Rendered as a new **"Appears in"** section on the page aside (near `Backlinks.tsx`),
kept visually distinct from wiki backlinks.

**Backup / import.** Extend `exportAll`/`importAll` (`src/db/backup.ts`) to serialize
the five new tables. **Bump `CURRENT_SCHEMA_VERSION`** and add a `MIGRATIONS` step
(older backups get empty manuscript tables). On import, **sanitize** each
`scene.content` through `sanitizeHtml()` (same boundary as page content + event
descriptions); `synopsis`/`notes`/`title` are plain text (React-escaped).
`parseBackup()` counts the new records before any `clear()`.

**Snapshots.** `maybeTakeSnapshot()` change-tracking extended to count scene/beat
writes toward the "≥50 records changed" threshold.

**Export (`src/manuscriptExport.ts`):**

- **EPUB** — a valid `.epub` zip (`mimetype`, `META-INF/container.xml`, `content.opf`,
  `nav.xhtml`, one XHTML per chapter with scenes in order) via **JSZip** (already a
  dependency; `htmlExport.ts` uses it). Scene HTML is sanitized into EPUB-safe XHTML;
  wiki-links flatten to plain text.
- **PDF** — compile the book into a single print-optimized HTML view + print
  stylesheet and trigger the browser's **Save-as-PDF** (Firefox-friendly, no heavy
  deps). A `pdf-lib`-based true PDF is a noted follow-up, not built now.
- Exposed via a **"Compile"** action in the book workspace (and/or Settings alongside
  HTML export).

## Testing

Vitest, repo conventions (fake-indexeddb, happy-dom; **jsdom** for any DOMPurify path).

- **Pure/unit:** word-count + rollups; structure-definition seeding; `sceneAppearances`
  scan; EPUB compile (assert zip entries + opf spine order); backup round-trip +
  migration; beat placement/reseed logic.
- **Component:** `BinderTree` reorder; grid cell create/move; structure-beat
  drag-to-assign — thin happy-path coverage.
- **Barrel:** new public API re-exported from `db/index.ts` (`barrel.test.ts`).

## Implementation phases

One spec, decomposed into sequential plans. Each phase is independently shippable and
green (lint + build + test) before the next.

1. **Data layer** — `manuscript.ts` types + schema v10, book/chapter/scene CRUD,
   word-count compute, barrel exports, backup/import + migration, snapshot tracking.
2. **Writing UI** — `ManuscriptRoute`, `BookRoute`, `BinderTree`, `SceneEditor`
   (reusing `LoreEditor`), `SceneMetaPanel` (status, goals, POV/cast/location via
   `RefField`), sidebar nav entry.
3. **Wiki integration** — `sceneAppearances()` + "Appears in" section on the page aside.
4. **Grid board** — `plotlines`/`beats` CRUD, `BookGridView`, cell create/edit/drag,
   lane reorder, status colors.
5. **Structure track** — `manuscriptStructures.ts` built-ins, structure-lane seeding,
   unplaced tray + drag-to-assign.
6. **Export** — `manuscriptExport.ts` EPUB + print-to-PDF, Compile action.

## Milestone reshaping

The current Documents & Manuscripts issues under-scope this feature. After spec
approval, remap them onto the phases (the in-world "book type" framing goes away —
that need is met by the existing Document type):

| Issue | Disposition |
|---|---|
| #110 Manuscripts — in-world books, first-class type | Repurpose into the real manuscript feature (this spec) / split into per-phase issues |
| #111 Outlining with story structures | Rewrite → structure-track-on-grid (phase 5) |
| #112 Multiple plotlines / arcs | Rewrite → grid board (phase 4) |
| #113 Link manuscript text to entries | Rewrite → scene refs + inline links + "Appears in" (phase 3) |
| #114 Export EPUB / PDF | Keep, retarget to `manuscriptExport` (phase 6) |
| #109 Linked documents | Closed; untouched (Document/in-world path) |

Open decision: rewrite #110–114 in place vs. close and open fresh phase-mapped issues.
