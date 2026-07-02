# Linked documents on pages — Design

**Issue:** #109 (milestone: Documents & Manuscripts) · **Effort:** 🟡 medium
**Date:** 2026-07-02 · **Status:** approved, ready for implementation plan

## Summary

Add a curated **Documents** attachment list to pages. A page (of any type) can
have a hand-picked, drag-ordered list of Document-type pages attached to it —
distinct from prose `[[wiki links]]`, infobox `ref` fields, and the automatic
"Linked from" backlinks. The relationship is **reciprocal**: attaching a
document on a Character surfaces it on the Character (as "Documents") *and* on
the document (as "Attached to"), and can be managed from either side.

This adds the *relation primitive* between a page and one or more documents. The
`builtin-document` page type already exists; no new page type is introduced.

### Decisions locked during brainstorming

- **Core value:** a curated attachments list (not auto-surfaced backlinks, not
  typed roles, not file uploads).
- **Attach scope:** Document-type pages only — defined as `category === 'Document'`.
  Custom user-made types are **not** treated as documents in v1.
- **Reciprocity:** visible and manageable from both ends.
- **Entry richness:** link + manual drag-order. No per-attachment notes.
- **Placement:** full-width section in the page main column, below the body
  (ImageGallery-style), positioned after `<References>`.

## Data model — `src/db/types.ts`

```ts
/** A curated attachment linking a page to a Document-type page. Reciprocal:
 *  surfaced on both the owning page ("Documents") and the document
 *  ("Attached to"). Edge is id-based, so page renames never touch it. */
export interface DocLink {
  id: string
  pageId: string      // the page the document is attached to
  documentId: string  // the attached Document-type page
  order: number       // 0-based position in pageId's curated list
  createdAt: number
}
```

Edges are pure id references — no titles, no HTML. Consequences:

- No sanitization needed on import (nothing renderable is stored).
- `renamePage` never has to rewrite them (unlike title-based wiki links).
- Attaching/detaching never rewrites a whole `LorePage` row (unlike an array
  field on the page — the same reason gallery images live in their own table).

## Schema — `src/db/schema.ts`

Bump the Dexie version ladder **v9 → v10** and add one store:

```
docLinks: 'id, pageId, documentId'
```

Both `pageId` and `documentId` are indexed to serve the two lookup directions.
`order` and `createdAt` stay unindexed. No existing store changes; no data
migration is required (empty table on upgrade).

## CRUD — new module `src/db/docLinks.ts`

Re-export all public functions from `src/db/index.ts` (`barrel.test.ts` fails
otherwise). Public API:

- `attachDocument(pageId: string, documentId: string): Promise<void>`
  - Rejects self-attach (`pageId === documentId`) — no-op.
  - Idempotent: if the `(pageId, documentId)` pair already exists, no-op.
  - Appends at `order = (max existing order for pageId) + 1`.
  - Uses `uid()`/`now()` from schema for `id`/`createdAt`.
- `detachDocument(pageId: string, documentId: string): Promise<void>`
  - Deletes the matching edge if present.
- `getAttachedDocuments(pageId: string): Promise<{ link: DocLink; page: LorePage }[]>`
  - Owning side. Edges for `pageId`, joined to their document pages, ordered by
    `order`. Silently skips edges whose document page no longer exists (defense
    in depth; cascade delete should prevent this).
- `getDocumentAttachedTo(documentId: string): Promise<{ link: DocLink; page: LorePage }[]>`
  - Reciprocal side. Edges for `documentId`, joined to their owning pages,
    ordered by page title (case-insensitive). No per-doc order field on this side.
- `reorderAttachedDocuments(pageId: string, orderedDocIds: string[]): Promise<void>`
  - Rewrites `order` for `pageId`'s edges to match the given sequence, in one
    `rw` transaction. Ignores ids not currently attached.

## Cascade delete — extend `deletePage` (`src/db/pages.ts`)

Add `db.docLinks` to the existing delete transaction (which already handles
`images` and `pins`). Sweep and delete edges where `pageId === id` **or**
`documentId === id`, so removing either endpoint leaves no dangling edge. Keep
it inside the single `rw` transaction so the whole delete is atomic.

## UI — new component `src/components/DocumentLinks.tsx`

Rendered in `PageRoute`'s main column after `<References>`:

```tsx
<DocumentLinks page={page} editable={editing} />
```

Props: `{ page: LorePage; editable: boolean }`. Reads reactively via
`useLiveQuery` on the two getters.

### "Documents" section (shown on all pages)

- **View mode:** a list of attached documents — a type-colour dot + title, each
  a `<Link to={/page/:id}>` with hover-preview wired through
  `showPageHover`/`scheduleWikiHoverClose` (same as `Backlinks.tsx`). The whole
  section is hidden when the list is empty and not editing (quiet by default).
- **Edit mode:** the same list with a `×` remove button per row and drag-to-
  reorder (persisted via `reorderAttachedDocuments`), plus a **"＋ Attach
  document"** control. The picker reuses `RefField`'s markup
  (`.ref-search` / `.ref-results` / `.ref-result`): a search input filtering
  `db.pages.where('category').equals('Document')`, excluding this page itself and
  already-attached documents, capped at ~8 matches.

### "Attached to" section (shown only when inbound edges exist)

Because only Document-type pages can be attached, inbound edges exist only on
Document pages — so this section naturally appears only there.

- Lists the pages this document is attached to (dot + title + hover preview),
  ordered by page title.
- **Edit mode:** a `×` remove per row and a picker to attach *this* document to
  another page. The target picker offers pages of **any** type (excluding this
  page and pages it's already attached to). No drag-reorder on this side.

Reordering DnD: use the lightweight approach already used elsewhere in the app
(HTML5 draggable rows). Implementation plan to confirm the exact mechanism
against existing reorderable lists (e.g. image gallery ordering) before adding a
dependency.

## Backup & import — `src/db/backup.ts`

- Include `docLinks` in `exportAll()` and `importAll()` (import replaces all
  data; coerce the table to an array defensively as other tables do).
- Bump `CURRENT_SCHEMA_VERSION` (mirrors the Dexie store version) and add one
  `MIGRATIONS` step so older backups (no `docLinks`) import as `docLinks: []`.
- On import, after coercion, **drop edges whose `pageId` or `documentId` is not
  present in the imported page set** (referential integrity across an untrusted
  backup boundary).
- Snapshots need no change — `snapshots.ts` wraps `exportAll()`, so `docLinks`
  rides along automatically.

## Testing (Vitest + happy-dom + fake-indexeddb)

`docLinks` CRUD (`src/db/docLinks.test.ts`):
- `attachDocument`: appends with incrementing `order`; dedupes the pair;
  rejects self-attach.
- `detachDocument`: removes the edge; no-op when absent.
- `getAttachedDocuments`: ordered by `order`; skips edges to deleted docs.
- `getDocumentAttachedTo`: ordered by page title.
- `reorderAttachedDocuments`: rewrites order to match input; ignores unknown ids.

Cascade (extend page-deletion tests):
- Deleting the owning page removes its edges.
- Deleting the document removes edges pointing at it.

Backup (`src/db/backup.test.ts`):
- Round-trip preserves `docLinks`.
- Legacy backup (no `docLinks`) migrates to `[]`.
- Import drops edges referencing absent pages.

Barrel (`barrel.test.ts`): new exports appear from `src/db/index.ts`.

Run `npm run lint`, `npm run build`, and `npm run test:run` before claiming done
(CI runs all three).

## Out of scope (v1)

- Per-attachment notes/captions.
- Feeding attached-document edges into the relationship graph — the graph stays
  wiki-link-based. Possible follow-up.
- Any new page type; custom document-like types are not recognized as documents.

## PR

Label `version:minor` (new feature). Reference issue #109.
