# Link Integrity on Rename and Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renaming a page rewrites every `[[link]]` to it (body + infobox) so references keep working, and deleting a page (or a typo'd link) shows links as visibly broken and never silently resurrects a stub on click.

**Architecture:** A `renamePage(id, newTitle)` helper in `db.ts` rewrites references across all pages via a shared `rewriteLinksInPage` util (matching the same body-anchor + infobox-`[[…]]` sources `linkedTitles` reads). The title editor becomes draft-based with a single commit point. `getOrCreatePageByTitle` is replaced by resolve-only `findPageIdByTitle`; the link-click handler confirms before creating. Unresolved links get an `is-broken` class — synchronously in `WikiText`, and via a view-mode post-render DOM pass in `LoreEditor` (the pattern `TableOfContents` already uses).

**Tech Stack:** React + TypeScript, Vite, Dexie/IndexedDB, Tiptap (rich-text). **No automated test framework exists** (per `CLAUDE.md`) — each task is verified with `npm run build` (tsc + Vite) and `npm run lint` (ESLint), plus manual browser checks. There is no `npm test`.

**Reference spec:** `docs/superpowers/specs/2026-06-14-link-integrity-design.md`

**Codebase facts the engineer needs:**
- `src/db.ts`: `const now = () => Date.now()` (~line 485). Existing `getOrCreatePageByTitle` is at ~line 518; `linkedTitles` at ~535 reads body `a[data-wikilink]` (via `DOMParser`) and infobox field `value` `[[…]]` tokens; module-level `const WIKILINK_RE = /\[\[([^\]]+)\]\]/g` at ~531. Types `LorePage`, `Infobox`, `InfoboxField` are defined in this file.
- Wiki links in the body render as `<a data-wikilink data-title="Title" class="wiki-link">Title</a>` (`src/extensions/WikiLink.ts`). The visible text always equals the title.
- Infobox field values store raw `[[Title]]` tokens for both plain and `ref` fields.
- `react-hooks/purity` ESLint rule forbids literal `Date.now()`/`Math.random()` in a component's render path. None of the component code below calls them; keep it that way (`now()` is only used inside `db.ts`).
- `src/index.css` uses CSS variables incl. `--danger: #c8645a`, `--accent`, `--accent-soft`. `.wiki-link` is styled at ~line 277.

---

## Task 1: `db.ts` — rename rewrite + resolve-only lookup

**Files:**
- Modify: `src/db.ts` (add `rewriteLinksInPage`, `renamePage`, `findPageIdByTitle`; remove `getOrCreatePageByTitle`)

- [ ] **Step 1: Remove `getOrCreatePageByTitle` and add `findPageIdByTitle`**

Find the existing function (~line 517):
```ts
/** Find a page by its title (case-insensitive); create it if missing. */
export async function getOrCreatePageByTitle(title: string): Promise<string> {
  const trimmed = title.trim()
  const all = await db.pages.toArray()
  const match = all.find((p) => p.title.toLowerCase() === trimmed.toLowerCase())
  if (match) return match.id
  // A page conjured from a link starts life as a stub.
  return createPage({ title: trimmed, status: 'Stub' })
}
```
Replace it **entirely** with:
```ts
/** Find an existing page's id by title (case-insensitive), or null. No creation —
 *  clicking a link to a missing page is handled (with confirmation) by the caller. */
export async function findPageIdByTitle(title: string): Promise<string | null> {
  const trimmed = title.trim().toLowerCase()
  const all = await db.pages.toArray()
  return all.find((p) => p.title.trim().toLowerCase() === trimmed)?.id ?? null
}
```

- [ ] **Step 2: Add `rewriteLinksInPage` + `renamePage`**

Insert these two functions immediately AFTER `findPageIdByTitle` (and before the `// Backlinks` section comment at ~line 527). `rewriteLinksInPage` is a private (non-exported) helper; `renamePage` is exported:

```ts
/** Rewrite every reference to `oldTitle` into `newTitle` within one page's body
 *  and infobox. Matches titles case-insensitively. Returns only the changed fields,
 *  or null if this page referenced nothing (so untouched pages aren't re-written). */
function rewriteLinksInPage(
  page: LorePage,
  oldTitle: string,
  newTitle: string,
): Partial<LorePage> | null {
  const oldLc = oldTitle.trim().toLowerCase()
  const out: Partial<LorePage> = {}
  let changed = false

  // Body: <a data-wikilink data-title="Old">Old</a> — rewrite attribute + text.
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

/** Rename a page and rewrite every reference to it across all other pages, so no
 *  [[links]] break. Throws if another page already holds the new title (which would
 *  make links ambiguous). No-ops on an empty or unchanged title. */
export async function renamePage(id: string, newTitle: string): Promise<void> {
  const trimmed = newTitle.trim()
  const page = await db.pages.get(id)
  if (!page) return
  const oldTitle = page.title
  if (!trimmed || trimmed === oldTitle) return

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

- [ ] **Step 3: Type-check and lint**

Run: `npm run build`
Expected: PASS. NOTE — removing `getOrCreatePageByTitle` will cause a TS error in `src/routes/PageRoute.tsx` (it still imports/uses it). That file is fixed in Task 5. To keep this task green on its own, the build may report that PageRoute error; that is expected and acceptable **only** until Task 5. If you want a clean build now, you may temporarily leave `getOrCreatePageByTitle` in place — BUT the spec requires its removal, so the preferred path is: proceed knowing PageRoute is fixed in Task 5, and do not block on that single known error. Report the exact error text.

Run: `npm run lint`
Expected: may flag the same unresolved usage in PageRoute; no other issues in `db.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/db.ts
git commit -m "feat: renamePage rewrites references; resolve-only findPageIdByTitle (#30)"
```

(If the cross-file build error in Step 3 blocks your workflow, you may stage Task 1 and Task 5 together; but committing `db.ts` now is fine since the branch is verified end-to-end after Task 5.)

---

## Task 2: `index.css` — broken-link styles

**Files:**
- Modify: `src/index.css` (after the `.wiki-link:hover` rule, ~line 281)

- [ ] **Step 1: Add the broken-link rules**

Immediately after the existing rule `.wiki-link:hover { color: var(--accent); background: rgba(201, 162, 75, 0.12); }` (~line 281), insert:

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

- [ ] **Step 2: Type-check and lint**

Run: `npm run build`
Expected: PASS (CSS-only change; same known PageRoute error from Task 1 may persist until Task 5).

Run: `npm run lint`
Expected: no new issues.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: broken wiki-link styling (#30)"
```

---

## Task 3: `WikiText.tsx` + `Infobox.tsx` — mark broken infobox links

**Files:**
- Modify: `src/components/WikiText.tsx`
- Modify: `src/components/Infobox.tsx`

- [ ] **Step 1: Add `knownTitles` to `WikiText`**

The current `src/components/WikiText.tsx` Props and link render are:
```tsx
interface Props {
  value: string
  onWikiClick: (title: string) => void
}
```
and inside the loop:
```tsx
    nodes.push(
      <a
        key={key++}
        className="wiki-link"
        onClick={(e) => {
          e.preventDefault()
          if (title) onWikiClick(title)
        }}
      >
        {title}
      </a>,
    )
```

Change Props to:
```tsx
interface Props {
  value: string
  onWikiClick: (title: string) => void
  /** Lowercased titles of existing pages; links not in the set render as broken. */
  knownTitles?: Set<string>
}
```
Update the component signature to destructure it:
```tsx
export default function WikiText({ value, onWikiClick, knownTitles }: Props) {
```
And replace the `<a …>` push with one that computes the broken class:
```tsx
    const broken = knownTitles ? !knownTitles.has(title.toLowerCase()) : false
    nodes.push(
      <a
        key={key++}
        className={broken ? 'wiki-link is-broken' : 'wiki-link'}
        onClick={(e) => {
          e.preventDefault()
          if (title) onWikiClick(title)
        }}
      >
        {title}
      </a>,
    )
```
(`title` is already `match[1].trim()` just above this in the existing code.)

- [ ] **Step 2: Thread `knownTitles` through `Infobox`**

In `src/components/Infobox.tsx`, the Props interface currently ends with:
```tsx
  /** Follow a [[wiki link]] in a field value (view mode). */
  onWikiClick: (title: string) => void
}
```
Add a prop right before the closing brace:
```tsx
  /** Follow a [[wiki link]] in a field value (view mode). */
  onWikiClick: (title: string) => void
  /** Lowercased titles of existing pages, for broken-link styling. */
  knownTitles?: Set<string>
}
```
Update the destructured signature (currently `export default function Infobox({ box, editable, onChange, onRemove, title, accent, onWikiClick }: Props) {`) to include `knownTitles`:
```tsx
export default function Infobox({ box, editable, onChange, onRemove, title, accent, onWikiClick, knownTitles }: Props) {
```
Find the `WikiText` render (~line 172):
```tsx
                    <WikiText value={fld.value} onWikiClick={onWikiClick} />
```
and change it to:
```tsx
                    <WikiText value={fld.value} onWikiClick={onWikiClick} knownTitles={knownTitles} />
```

- [ ] **Step 3: Type-check and lint**

Run: `npm run build`
Expected: PASS for these files (the known PageRoute error from Task 1 may persist until Task 5; `Infobox`/`WikiText` themselves compile, and `knownTitles` is optional so existing call sites still typecheck).

Run: `npm run lint`
Expected: no new issues (`knownTitles` is used in both files).

- [ ] **Step 4: Commit**

```bash
git add src/components/WikiText.tsx src/components/Infobox.tsx
git commit -m "feat: mark broken infobox links (#30)"
```

---

## Task 4: `LoreEditor.tsx` — mark broken body links (view mode)

**Files:**
- Modify: `src/components/LoreEditor.tsx`

**Context:** `LoreEditor` wraps a Tiptap `useEditor` instance (`editor`). It already has a `useEffect` that calls `editor?.setEditable(editable)` (around lines 43-45), placed BEFORE the `if (!editor) return null` early return. `editor.view.dom` is the rendered content root. Body wiki links are `<a class="wiki-link" data-title="…">`.

- [ ] **Step 1: Add `knownTitles` prop**

The current Props interface:
```tsx
interface Props {
  content: string
  editable: boolean
  onChange: (html: string) => void
  /** Called when a [[wiki link]] is clicked, with the linked page title. */
  onWikiClick: (title: string) => void
}
```
Add the prop:
```tsx
interface Props {
  content: string
  editable: boolean
  onChange: (html: string) => void
  /** Called when a [[wiki link]] is clicked, with the linked page title. */
  onWikiClick: (title: string) => void
  /** Lowercased titles of existing pages; missing ones render as broken (view mode). */
  knownTitles?: Set<string>
}
```
Update the component signature:
```tsx
export default function LoreEditor({ content, editable, onChange, onWikiClick, knownTitles }: Props) {
```

- [ ] **Step 2: Add the broken-link post-pass effect**

Immediately AFTER the existing `useEffect` that toggles editability (the one with body `editor?.setEditable(editable)`), and BEFORE `if (!editor) return null`, add:

```tsx
  // In view mode, flag links whose target page no longer exists. Mirrors the
  // post-render DOM pass TableOfContents uses; edit mode is left untouched so
  // authoring isn't disrupted.
  useEffect(() => {
    if (!editor || editable || !knownTitles) return
    editor.view.dom.querySelectorAll('a.wiki-link').forEach((a) => {
      const t = a.getAttribute('data-title')?.trim().toLowerCase()
      a.classList.toggle('is-broken', !!t && !knownTitles.has(t))
    })
  }, [editor, editable, knownTitles, content])
```

(`useEffect` is already imported at the top of the file: `import { useEffect } from 'react'`.)

- [ ] **Step 3: Type-check and lint**

Run: `npm run build`
Expected: PASS for this file (known PageRoute error from Task 1 may persist until Task 5).

Run: `npm run lint`
Expected: no new issues. The effect's dependency array includes everything it reads (`editor`, `editable`, `knownTitles`, `content`), so `react-hooks/exhaustive-deps` stays quiet.

- [ ] **Step 4: Commit**

```bash
git add src/components/LoreEditor.tsx
git commit -m "feat: mark broken body links in view mode (#30)"
```

---

## Task 5: `PageRoute.tsx` — wire rename commit, safe click, known titles

**Files:**
- Modify: `src/routes/PageRoute.tsx`

This task makes the build fully green again (it removes the last use of the deleted `getOrCreatePageByTitle`).

- [ ] **Step 1: Update the `../db` import**

Current (line 4):
```tsx
import { db, updatePage, deletePage, getOrCreatePageByTitle, defaultInfobox, applyTemplate, STATUSES, categoryColor, statusColor, pageStatus, type Infobox as InfoboxType, type LorePage } from '../db'
```
Replace with (drop `getOrCreatePageByTitle`; add `createPage`, `findPageIdByTitle`, `renamePage`):
```tsx
import { db, createPage, updatePage, renamePage, deletePage, findPageIdByTitle, defaultInfobox, applyTemplate, STATUSES, categoryColor, statusColor, pageStatus, type Infobox as InfoboxType, type LorePage } from '../db'
```

- [ ] **Step 2: Add `titleDraft` state and a `knownTitles` live query**

The component currently has (lines ~16-18):
```tsx
  const [editing, setEditing] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const mainRef = useRef<HTMLDivElement>(null)
```
Add `titleDraft` state and the live query right after `mainRef`:
```tsx
  const [editing, setEditing] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  // Lowercased titles of all existing pages — drives broken-link styling.
  const knownTitles = useLiveQuery(
    async () => new Set((await db.pages.toArray()).map((p) => p.title.trim().toLowerCase())),
    [],
  )
```

- [ ] **Step 3: Reset the draft on page change**

The existing id-change reset block (lines ~23-27):
```tsx
  const [prevId, setPrevId] = useState(id)
  if (id !== prevId) {
    setPrevId(id)
    setEditing(false)
  }
```
Add a draft reset:
```tsx
  const [prevId, setPrevId] = useState(id)
  if (id !== prevId) {
    setPrevId(id)
    setEditing(false)
    setTitleDraft(null)
  }
```

- [ ] **Step 4: Rework `followWikiLink` and add `commitTitle`**

Current `followWikiLink` (lines ~36-39):
```tsx
  async function followWikiLink(title: string) {
    const targetId = await getOrCreatePageByTitle(title)
    navigate(`/page/${targetId}`)
  }
```
Replace it with the safe version plus a new `commitTitle`:
```tsx
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

- [ ] **Step 5: Make the title input draft-based**

Current title input (lines ~72-77):
```tsx
            <input
              className="title-input"
              value={page.title}
              onChange={(e) => updatePage(id, { title: e.target.value })}
              placeholder="Page title"
            />
```
Replace with:
```tsx
            <input
              className="title-input"
              value={titleDraft ?? page.title}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              placeholder="Page title"
            />
```

- [ ] **Step 6: Commit the title when leaving edit mode**

Current Edit/Done button (lines ~82-84):
```tsx
            <button className="ghost-btn" onClick={() => setEditing((v) => !v)}>
              {editing ? '✓ Done' : '✎ Edit'}
            </button>
```
Replace with one that commits any pending rename before exiting edit mode:
```tsx
            <button
              className="ghost-btn"
              onClick={() => {
                if (editing) commitTitle()
                setEditing((v) => !v)
              }}
            >
              {editing ? '✓ Done' : '✎ Edit'}
            </button>
```

- [ ] **Step 7: Pass `knownTitles` to the body and infobox**

Find the `<LoreEditor …>` render (~lines 160-166) and add the prop:
```tsx
          <LoreEditor
            key={id}
            content={page.content}
            editable={editing}
            onChange={(html) => updatePage(id, { content: html })}
            onWikiClick={followWikiLink}
            knownTitles={knownTitles}
          />
```
Find the `<Infobox …>` render (~lines 172-180) and add the prop:
```tsx
            <Infobox
              box={page.infobox}
              editable={editing}
              title={page.title}
              accent={categoryColor(page.category)}
              onChange={(box: InfoboxType) => updatePage(id, { infobox: box })}
              onRemove={() => updatePage(id, { infobox: undefined })}
              onWikiClick={followWikiLink}
              knownTitles={knownTitles}
            />
```

- [ ] **Step 8: Type-check and lint (now fully green)**

Run: `npm run build`
Expected: PASS with NO errors — the deleted `getOrCreatePageByTitle` is no longer referenced anywhere.

Run: `npm run lint`
Expected: PASS, no warnings. Every new import (`createPage`, `renamePage`, `findPageIdByTitle`) is used; `getOrCreatePageByTitle` is gone.

- [ ] **Step 9: Commit**

```bash
git add src/routes/PageRoute.tsx
git commit -m "feat: commit-based rename, confirm-before-create, broken-link wiring (#30)"
```

---

## Final verification (manual — no automated tests in this project)

Start/keep the dev server (`npm run dev`) and open `http://localhost:5174`. Run the spec's checklist (`docs/superpowers/specs/2026-06-14-link-integrity-design.md`):

- [ ] **Rename keeps body links:** Page A body has `[[Gandalf]]`. Rename "Gandalf" → "Gandalf the Grey" (edit title, press Enter/Done). Reopen A: link text and target both read "Gandalf the Grey" and navigate; A shows in the renamed page's backlinks.
- [ ] **Rename keeps infobox links:** repeat with `[[Gandalf]]` in a plain infobox field and in a `ref` field — both rewrite.
- [ ] **Case-only rename:** "gandalf" → "Gandalf" rewrites references to new casing.
- [ ] **Collision blocked:** with pages "A" and "B", rename "A" → "B": alert appears, "A" keeps its title, no references change.
- [ ] **Commit timing:** typing in the title field changes nothing in other pages until blur/Enter/Done.
- [ ] **Delete no longer resurrects:** delete "Gandalf". A page that linked it shows the link red/dashed. Click it → confirm dialog; Cancel creates nothing; OK creates a fresh Stub on purpose.
- [ ] **Typo link broken, not silent:** type `[[Galdalf]]`, view the page — red; clicking prompts before creating.
- [ ] **Broken styling clears live:** create the missing page (or rename back) — the red clears on the referencing page without reload.
- [ ] `npm run build` and `npm run lint` both pass clean.
