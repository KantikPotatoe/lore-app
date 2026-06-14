# Design: Link integrity on rename and delete (issue #30)

**Date:** 2026-06-14
**Issue:** [#30](https://github.com/KantikPotatoe/lore-app/issues/30) — Tier 1 (Trust),
part of the v0.0.1 roadmap (`docs/superpowers/plans/2026-06-14-v0.0.1-roadmap.md`).
Labeled **bug**.

## Problem (confirmed in code)

Wiki links resolve by **title at render/click time**, never by a stable id:

- `getOrCreatePageByTitle` (`db.ts:518`) matches a page by lowercased title and, if
  none exists, **creates a Stub**. It is called only from `followWikiLink`
  (`PageRoute.tsx:37`), the single click handler for both body and infobox links.
- Backlinks (`getBacklinks`/`linkedTitles`, `db.ts:535-566`) and the graph
  (`buildGraphData`, `db.ts:601`) also match on lowercased titles.

Two failure modes:

1. **Rename breaks every reference.** The title `<input>` persists on *every
   keystroke* (`PageRoute.tsx:75`: `onChange={(e) => updatePage(id, { title: e.target.value })}`),
   with no link rewrite. So every existing `[[Old Title]]` reference dangles after a
   rename, and there is no commit point at which the old→new mapping is even known
   (the old title dissolves character-by-character as you type).
2. **Delete + click resurrects a stub.** `deletePage` (`db.ts:510`) just removes the
   row. Inbound links become dangling; clicking one calls `getOrCreatePageByTitle`,
   which **silently re-creates an empty Stub** — actively corrupting the wiki.

## Goal

Renaming a referenced page keeps all links working; deleting a page (or a typo'd
link) no longer lets a click silently resurrect it as an empty stub, and broken
links are visible.

## Decisions

- **Delete policy = mark broken + confirm-before-create (Decision 1, option A).**
  Unresolved links render visibly broken (red/dashed) in both body and infobox.
  Clicking a broken link asks "Create it?" instead of silently creating. Fixes the
  delete-resurrect bug *and* typo'd links while keeping create-by-click deliberate.
- **Collision guard on rename.** Renaming a page to a title another page already
  holds (case-insensitive) is blocked with an alert — duplicate titles make
  `[[links]]` ambiguous, which is itself a link-integrity hazard.
- **Defer the global broken-links report (Decision 2).** Per-page red links already
  surface breakage; a Graph-panel report is a nice-to-have, not a v0.0.1 trust need.

---

## Part A — Rename rewrites all references

### A1. `rewriteLinksInPage` — private util in `db.ts`

Co-located with `linkedTitles` (which reads the same two sources). Rewrites
references to `oldTitle` into `newTitle` within a single page, returning only the
fields that changed (or `null` when nothing matched, so untouched pages aren't
rewritten or re-timestamped).

```ts
/** Rewrite every reference to `oldTitle` into `newTitle` within one page's body
 *  and infobox. Matches titles case-insensitively. Returns the changed fields, or
 *  null if this page referenced nothing. */
function rewriteLinksInPage(
  page: LorePage,
  oldTitle: string,
  newTitle: string,
): Partial<LorePage> | null {
  const oldLc = oldTitle.trim().toLowerCase()
  const out: Partial<LorePage> = {}
  let changed = false

  // Body: <a data-wikilink data-title="Old">Old</a> — rewrite attr + visible text.
  if (page.content && page.content.includes('data-wikilink')) {
    const doc = new DOMParser().parseFromString(page.content, 'text/html')
    let bodyChanged = false
    doc.querySelectorAll('a[data-wikilink]').forEach((a) => {
      if (a.getAttribute('data-title')?.trim().toLowerCase() === oldLc) {
        a.setAttribute('data-title', newTitle)
        a.textContent = newTitle
        bodyChanged = true
      }
    })
    if (bodyChanged) {
      out.content = doc.body.innerHTML
      changed = true
    }
  }

  // Infobox: field values keep raw [[Name]] tokens (covers plain AND ref fields).
  if (page.infobox) {
    let boxChanged = false
    const fields = page.infobox.fields.map((f) => {
      const v = f.value.replace(/\[\[([^\]]+)\]\]/g, (m, inner) =>
        inner.trim().toLowerCase() === oldLc ? `[[${newTitle}]]` : m,
      )
      if (v !== f.value) boxChanged = true
      return v === f.value ? f : { ...f, value: v }
    })
    if (boxChanged) {
      out.infobox = { ...page.infobox, fields }
      changed = true
    }
  }

  return changed ? out : null
}
```

Notes:
- A fresh `/\[\[([^\]]+)\]\]/g` literal is used in `.replace` (not the shared
  module-level `WIKILINK_RE`) to avoid any `lastIndex` state coupling.
- `data-title` and the visible anchor text are always equal in this app (the
  `WikiLink` node renders `node.attrs.title` as its text — `WikiLink.ts:39`), so
  setting both to `newTitle` is correct.

### A2. `renamePage(id, newTitle)` — exported in `db.ts`

```ts
export async function renamePage(id: string, newTitle: string): Promise<void> {
  const trimmed = newTitle.trim()
  const page = await db.pages.get(id)
  if (!page) return
  const oldTitle = page.title
  if (!trimmed || trimmed === oldTitle) return // nothing meaningful to do

  const all = await db.pages.toArray()
  const clash = all.find(
    (p) => p.id !== id && p.title.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  if (clash) throw new Error(`A page titled "${clash.title}" already exists.`)

  await db.transaction('rw', db.pages, async () => {
    await db.pages.update(id, { title: trimmed, updatedAt: now() })
    for (const p of all) {
      if (p.id === id) continue
      const rewritten = rewriteLinksInPage(p, oldTitle, trimmed)
      if (rewritten) await db.pages.update(p.id, { ...rewritten, updatedAt: now() })
    }
  })
}
```

- Case-only self-rename (e.g. `Gandalf` → `gandalf`) still proceeds and rewrites
  references to the new casing; the clash check excludes the page itself.
- Scans/rewrites all pages — fine at personal-wiki scale.

### A3. Title editing rework — `PageRoute.tsx`

Replace per-keystroke persistence with a draft + commit:

- Add `const [titleDraft, setTitleDraft] = useState<string | null>(null)`.
- Reset it in the existing id-change block (alongside `setEditing(false)`):
  `setTitleDraft(null)`.
- The title `<input>` becomes:
  - `value={titleDraft ?? page.title}`
  - `onChange={(e) => setTitleDraft(e.target.value)}` (draft only — no DB write)
  - `onBlur={commitTitle}`
  - `onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}` (Enter → blur → commit)
- Commit handler:

```ts
async function commitTitle() {
  if (titleDraft === null) return
  const next = titleDraft.trim()
  setTitleDraft(null)
  if (!next || next === page!.title) return
  try {
    await renamePage(id, next)
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Could not rename the page.')
  }
}
```

- The "✓ Done" button calls `commitTitle()` before `setEditing(false)` (the input's
  `onBlur` typically fires first, but calling it explicitly is safe — the second call
  no-ops because `titleDraft` is already `null`).

---

## Part B — Delete safety + visible broken links

### B1. Resolve-only lookup — `db.ts`

Remove `getOrCreatePageByTitle` (its only caller, `followWikiLink`, is reworked
below) and add:

```ts
/** Find an existing page's id by title (case-insensitive), or null. */
export async function findPageIdByTitle(title: string): Promise<string | null> {
  const trimmed = title.trim().toLowerCase()
  const all = await db.pages.toArray()
  return all.find((p) => p.title.trim().toLowerCase() === trimmed)?.id ?? null
}
```

No function in the app silently creates a stub anymore. (Explicit creation paths —
`RefField.tsx`, the "New page" buttons in `Sidebar`/`Home`/`Category` — are
unchanged.)

### B2. `followWikiLink` — `PageRoute.tsx`

```ts
async function followWikiLink(title: string) {
  const existing = await findPageIdByTitle(title)
  if (existing) {
    navigate(`/page/${existing}`)
    return
  }
  if (!confirm(`"${title.trim()}" doesn't exist yet. Create it?`)) return
  const newId = await createPage({ title: title.trim(), status: 'Stub' })
  navigate(`/page/${newId}`)
}
```

Update the `../db` import in `PageRoute.tsx`: drop `getOrCreatePageByTitle`, add
`createPage` and `findPageIdByTitle`.

### B3. Known-titles set — `PageRoute.tsx`

Add a live query for the set of existing titles (lowercased), passed to the body and
infobox so they can mark broken links:

```ts
const knownTitles = useLiveQuery(
  async () => new Set((await db.pages.toArray()).map((p) => p.title.trim().toLowerCase())),
  [],
)
```

Pass `knownTitles={knownTitles}` to both `<LoreEditor>` and `<Infobox>`.

### B4. Broken-link styling in the infobox — `WikiText.tsx`

Add an optional prop and class:

- Props gain `knownTitles?: Set<string>`.
- When building each link, compute
  `const broken = knownTitles ? !knownTitles.has(title.trim().toLowerCase()) : false`
  and set `className={broken ? 'wiki-link is-broken' : 'wiki-link'}`.

`Infobox.tsx` threads the prop through: add `knownTitles?: Set<string>` to its Props,
and pass it to the `<WikiText … knownTitles={knownTitles} />` render (`Infobox.tsx:172`).

### B5. Broken-link styling in the body — `LoreEditor.tsx`

The body is Tiptap-rendered, so mark broken links with a post-render DOM pass — the
same pattern `TableOfContents` already uses (query after render in an effect).

- Props gain `knownTitles?: Set<string>`.
- Add an effect that runs in **view mode only**:

```ts
useEffect(() => {
  if (!editor || editable || !knownTitles) return
  editor.view.dom.querySelectorAll('a.wiki-link').forEach((a) => {
    const t = a.getAttribute('data-title')?.trim().toLowerCase()
    a.classList.toggle('is-broken', !!t && !knownTitles.has(t))
  })
}, [editor, editable, knownTitles, content])
```

- Depending on `content` and `knownTitles` re-runs the pass when the body changes or
  pages are created/deleted elsewhere. Edit mode is untouched (no styling while
  authoring). This is a pragmatic choice over a ProseMirror decoration plugin, which
  would be more robust but heavier; in view mode there are no editing transactions to
  clobber the class, and toggling on `[editable]` reapplies after a mode switch.

### B6. CSS — `src/index.css`

After the existing `.wiki-link:hover` rule (~line 281):

```css
.wiki-link.is-broken {
  color: var(--danger);
  border-bottom-color: var(--danger);
  border-bottom-style: dashed;
}
.wiki-link.is-broken:hover {
  color: var(--danger);
  background: rgba(200, 100, 90, 0.12);
}
```

---

## Files touched

- **`src/db.ts`** — add `renamePage`, `findPageIdByTitle`, private `rewriteLinksInPage`;
  remove `getOrCreatePageByTitle`.
- **`src/routes/PageRoute.tsx`** — draft-based title editing + `commitTitle`; reworked
  `followWikiLink`; `knownTitles` live query passed down; import changes.
- **`src/components/LoreEditor.tsx`** — `knownTitles` prop + view-mode broken-link pass.
- **`src/components/WikiText.tsx`** — `knownTitles` prop + `is-broken` class.
- **`src/components/Infobox.tsx`** — thread `knownTitles` through to `WikiText`.
- **`src/index.css`** — `.wiki-link.is-broken` styles.

## Out of scope (deferred)

- Global "broken links" report in the Graph panel / `HubsOrphansPanel`.
- Aliased link syntax (`[[Title|display]]`) — not supported today; visible text always
  equals the title, which the rename rewrite relies on.
- Backlink/graph matching logic is unchanged: it already resolves by current title, so
  once references are rewritten on rename and not orphaned silently on delete, it stays
  correct.

## Verification (manual — no automated tests in this project)

1. **Rename keeps body links:** Page A body links `[[Gandalf]]`. Rename "Gandalf" →
   "Gandalf the Grey". Reopen A — the link text and target both read "Gandalf the
   Grey" and navigate correctly; A appears in the renamed page's backlinks.
2. **Rename keeps infobox links:** repeat with a `[[Gandalf]]` in an infobox field
   (plain and a `ref` field) — both rewrite.
3. **Case-only rename:** "gandalf" → "Gandalf" rewrites references to the new casing.
4. **Collision blocked:** with pages "A" and "B", rename "A" → "B" → alert appears and
   "A" keeps its title; no references change.
5. **Title commit timing:** typing in the title field does not alter other pages until
   blur/Enter/Done; mid-typing leaves the DB untouched.
6. **Delete no longer resurrects:** delete "Gandalf". On a page that linked it, the
   link shows red/dashed. Click it → a confirm appears; Cancel leaves nothing created;
   OK creates a fresh Stub intentionally.
7. **Typo link is broken, not silent:** type `[[Galdalf]]` (typo), view the page — it's
   red; clicking prompts before creating.
8. **Broken styling clears on fix:** create the missing page (or rename back) → the red
   styling clears on the referencing page without reload (live query).
