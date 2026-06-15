# External Links in the Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline-popover link toolbar button to the body editor so authors can create external `<a href>` links that open in a new tab, while keeping `[[wiki link]]` navigation on a separate, explicit code path.

**Architecture:** The Tiptap `Link` extension is already bundled inside `@tiptap/starter-kit@3.26.1` and registered by default — no new npm dependency. We configure it via `StarterKit.configure({ link: { ... } })` to disable the default `openOnClick` behavior, add `target="_blank"`, and attach a CSS class. A small popover (position-absolute, anchored to `.lore-editor`) appears on toolbar-button click for URL entry. The existing `handleClick` gets an explicit second branch for `a[href]:not(.wiki-link)` anchors.

**Tech Stack:** React 18 (`useState`, `useRef`), Tiptap 3 (`StarterKit`, bundled Link mark, `extendMarkRange`/`setLink`/`unsetLink` commands), plain CSS, Vite.

**Note on tests:** This project has no automated test suite. "Verification" means `npm run build` (type-check + bundle) plus manual browser smoke-testing. Do not scaffold a test framework.

---

### Task 1: Rewrite `LoreEditor.tsx` with Link configuration, popover, and updated click handler

**Files:**
- Modify: `src/components/LoreEditor.tsx` (full rewrite shown below)

This is a single-file change. Replacing the whole file avoids fiddly incremental edits and makes the diff reviewable in one shot.

- [ ] **Step 1: Verify the current file before touching it**

Run:
```bash
npm run build
```
Expected: `✓ built in ~300ms` (same pre-existing chunk-size advisory). Confirms the baseline is clean.

- [ ] **Step 2: Replace `src/components/LoreEditor.tsx` with the implementation below**

Write the entire file (do not patch line-by-line — replace completely):

```tsx
import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { WikiLink } from '../extensions/WikiLink'
import { compressImage } from '../imageUtils'

interface Props {
  content: string
  editable: boolean
  onChange: (html: string) => void
  /** Called when a [[wiki link]] is clicked, with the linked page title. */
  onWikiClick: (title: string) => void
  /** Lowercased titles of existing pages; missing ones render as broken (view mode). */
  knownTitles?: Set<string>
}

/** Toolbar button helper. */
function Btn({ active, onClick, title, children }: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? ' is-active' : ''}`}
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep editor focus
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default function LoreEditor({ content, editable, onChange, onWikiClick, knownTitles }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false, // we handle clicks ourselves so wiki vs external stay separate
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer', class: 'ext-link' },
        },
      }),
      WikiLink,
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  const fileInput = useRef<HTMLInputElement>(null)
  const [showLinkBox, setShowLinkBox] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  // Insert an image into the body: downscale to a body-friendly 1600px and embed
  // as a data URL (local-first — no upload). Mirrors Infobox.pickImage.
  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || !editor) return
    const dataUrl = await compressImage(file, 1600)
    editor.chain().focus().setImage({ src: dataUrl }).run()
  }

  function openLinkBox() {
    setLinkUrl(editor?.getAttributes('link').href ?? '')
    setShowLinkBox(true)
  }

  function applyLink() {
    const url = linkUrl.trim()
    if (!url) {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      // Prefix https:// when the author types a bare domain (e.g. "example.com").
      const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`
      editor?.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    setShowLinkBox(false)
    setLinkUrl('')
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    setShowLinkBox(false)
  }

  // Toggle edit/view without losing the editor instance.
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editable, editor])

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

  if (!editor) return null

  // Route clicks: wiki links navigate in-app; external href links open a new
  // tab. In edit mode both require Ctrl/Cmd-click so plain clicks place the cursor.
  const handleClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement

    const wiki = el.closest('a.wiki-link')
    if (wiki) {
      if (editable && !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      const title = wiki.getAttribute('data-title')
      if (title) onWikiClick(title)
      return
    }

    const ext = el.closest('a[href]:not(.wiki-link)') as HTMLAnchorElement | null
    if (ext) {
      if (editable && !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      const href = ext.getAttribute('href')
      if (href) window.open(href, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="lore-editor">
      {editable && (
        <div className="editor-toolbar">
          <Btn title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></Btn>
          <Btn title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Btn>
          <Btn title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Btn>
          <span className="tb-sep" />
          <Btn title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</Btn>
          <Btn title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
          <Btn title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn>
          <span className="tb-sep" />
          <Btn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</Btn>
          <Btn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</Btn>
          <Btn title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</Btn>
          <Btn title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</Btn>
          <Btn title="Insert image" onClick={() => fileInput.current?.click()}>🖼</Btn>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={pickImage}
          />
          <Btn title="Link (external URL)" active={editor.isActive('link')} onClick={openLinkBox}>🔗</Btn>
          <span className="tb-spacer" />
          <span className="tb-hint">Type [[Name]] to link a page</span>
        </div>
      )}
      {editable && showLinkBox && (
        <div className="link-popover">
          <input
            autoFocus
            type="url"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink() }
              if (e.key === 'Escape') { setShowLinkBox(false) }
            }}
          />
          <button type="button" className="tb-btn" onMouseDown={(e) => e.preventDefault()} onClick={applyLink}>Apply</button>
          {editor.isActive('link') && (
            <button type="button" className="tb-btn" onMouseDown={(e) => e.preventDefault()} onClick={removeLink}>Remove</button>
          )}
        </div>
      )}
      <EditorContent editor={editor} onClick={handleClick} />
    </div>
  )
}
```

Key changes from the current file:
- `useState` added to React import.
- `StarterKit` is now `StarterKit.configure({ link: { ... } })` — configures the already-bundled Link mark.
- `showLinkBox`, `linkUrl` state + `openLinkBox`, `applyLink`, `removeLink` handlers added after `pickImage`.
- `handleClick` rewritten with two explicit branches (wiki / external).
- 🔗 `Btn` added after 🖼 button.
- `{editable && showLinkBox && <div className="link-popover">...}` rendered between the toolbar and `<EditorContent>`.

- [ ] **Step 3: Type-check and build**

Run:
```bash
npm run build
```
Expected: `✓ built in ~300ms`. If TypeScript errors on `setLink`/`unsetLink`/`extendMarkRange`, confirm the `StarterKit.configure({ link: { ... } })` change is in place — those commands are contributed by the Link extension which StarterKit registers.

- [ ] **Step 4: Commit**

```bash
git add src/components/LoreEditor.tsx
git commit -m "feat: external link toolbar button with inline popover (#32)"
```

---

### Task 2: Add CSS for `.lore-editor`, `.ext-link`, and `.link-popover`

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add `.lore-editor { position: relative; }` in the Editor block**

In `src/index.css`, find the `/* --- Editor --- */` comment block (around line 251). The first rule in that block is `.editor-toolbar { ... }`. Add one line **before** `.editor-toolbar`:

```css
/* --- Editor --------------------------------------------------------------- */
.lore-editor { position: relative; }
.editor-toolbar {
```

`position: relative` makes `.lore-editor` the containing block for the absolutely-positioned `.link-popover`.

- [ ] **Step 2: Add `.ext-link` and `.link-popover` rules after the wiki-link block**

In `src/index.css`, after the last `.wiki-link` rule block (`.wiki-link.is-broken:hover { ... }`, currently around line 299–302), append:

```css
.ext-link { color: var(--accent-soft); text-decoration: underline; cursor: pointer; }
.ext-link:hover { color: var(--accent); }
.link-popover {
  position: absolute; top: 52px; left: 5px; z-index: 10;
  display: flex; gap: 6px; align-items: center;
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 8px; padding: 6px;
}
.link-popover input {
  background: var(--panel-2); border: 1px solid var(--border);
  border-radius: 6px; padding: 5px 9px; color: var(--ink); width: 260px;
}
```

`top: 52px`: toolbar is 30px button + 5px top padding + 5px bottom padding + 1px border × 2 + 14px margin-bottom = ~56px, so 52px gives a tight-but-visible gap. Adjust to `56px` if it overlaps during testing.

- [ ] **Step 3: Build**

Run:
```bash
npm run build
```
Expected: `✓ built in ~300ms`.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "style: ext-link and link-popover styles for external links (#32)"
```

---

### Task 3: Manual verification

**Files:** none (runtime check).

The dev server may already be running at `http://localhost:5174` (pinned port per `CLAUDE.md`). If not, start it with `npm run dev` in the background.

- [ ] **Step 1: Insert a link (bare domain)**

Open any page, enter edit mode. Select some text, click 🔗, type `example.com`, press Enter or click Apply. Expected: the selected text becomes styled as `.ext-link` (underlined, accent color). Inspect the `<a>` in DevTools — `href` should be `https://example.com`, `target="_blank"`, `rel="noopener noreferrer"`, `class="ext-link"`.

- [ ] **Step 2: Insert a link (full URL)**

Select different text, click 🔗, type `https://en.wikipedia.org/wiki/Worldbuilding`, Apply. Expected: href stays unchanged (no double-`https://`).

- [ ] **Step 3: Edit an existing link**

Click inside the link from Step 1, click 🔗. Expected: popover opens with `https://example.com` pre-filled. Change URL, Apply. Expected: href updated.

- [ ] **Step 4: Remove a link**

Click inside any link, click 🔗, click Remove. Expected: text loses the link formatting; plain text remains.

- [ ] **Step 5: View mode — external link opens in new tab**

Save the page (click out of edit mode). Click the external link. Expected: new browser tab opens to the URL. The app itself does not navigate.

- [ ] **Step 6: View mode — wiki link still works in-app**

Confirm a `[[wiki link]]` on the same page still navigates within the app when clicked (does not open a new tab).

- [ ] **Step 7: Edit mode — plain click places cursor**

Re-enter edit mode. Click (no modifier) on an external link. Expected: cursor is placed inside the link text; page does not navigate.

- [ ] **Step 8: Edit mode — Ctrl/Cmd-click follows the link**

Ctrl-click (or Cmd-click on Mac) the external link in edit mode. Expected: new tab opens.

- [ ] **Step 9: Persistence**

Save and reload (F5). Expected: external links persist (stored in page `content` HTML in IndexedDB).

- [ ] **Step 10: Autolink**

In edit mode, type `https://example.org` followed by a space (or paste a bare URL). Expected: it auto-links (Tiptap's `autolink: true`). Check that the resulting `<a>` has `target="_blank"`.

---

## Self-Review

**Spec coverage:**
- Configure bundled Link extension via `StarterKit.configure` (no duplicate extension) → Task 1 Step 2 (`StarterKit.configure({ link: { ... } })`). ✓
- `openOnClick: false`, `autolink: true`, `defaultProtocol: 'https'`, `target="_blank"`, `rel="noopener noreferrer"`, `class="ext-link"` → Task 1 Step 2 extensions array. ✓
- `showLinkBox` / `linkUrl` state + `openLinkBox` / `applyLink` / `removeLink` handlers → Task 1 Step 2 (in file). ✓
- `extendMarkRange('link')` so whole-link applies without needing a selection → Task 1 Step 2 (`applyLink` and `removeLink`). ✓
- `https://` prefix for bare domains; `mailto:` left untouched → Task 1 Step 2 (`applyLink` regex). ✓
- 🔗 toolbar button with `active` state → Task 1 Step 2 (toolbar JSX). ✓
- Popover: `autoFocus` input, Enter to apply, Escape to close, Apply button, conditional Remove button → Task 1 Step 2 (popover JSX). ✓
- `onMouseDown={e => e.preventDefault()}` on popover buttons to preserve selection → Task 1 Step 2. ✓
- `handleClick` — two explicit branches, wiki unchanged, external `a[href]:not(.wiki-link)` opens new tab in view mode, Ctrl/Cmd-click in edit mode → Task 1 Step 2. ✓
- `.lore-editor { position: relative }` → Task 2 Step 1. ✓
- `.ext-link`, `.link-popover`, `.link-popover input` CSS → Task 2 Step 2. ✓
- No `@tiptap/extension-link` import (duplicate extension) → not in any task. ✓
- Manual verification (insert, edit, remove, view-mode new-tab, wiki-link unchanged, persistence, autolink) → Task 3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type/name consistency:** `showLinkBox`, `linkUrl`, `openLinkBox`, `applyLink`, `removeLink`, `extendMarkRange`, `setLink`, `unsetLink`, `ext-link`, `link-popover` — all used consistently across tasks. `StarterKit.configure({ link: { ... } })` is the only place the Link extension is configured. ✓
