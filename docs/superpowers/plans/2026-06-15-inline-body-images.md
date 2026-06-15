# Inline Body Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authors insert downscaled, locally-stored images into article bodies via a toolbar button.

**Architecture:** Register the Tiptap `Image` extension in the existing `LoreEditor`, add a hidden file input + toolbar button that runs the source image through the existing `compressImage(file, 1600)` helper and inserts it as a `data:` URL node. Images persist inside the page's `content` HTML — no data-layer changes. CSS keeps body images responsive and shows a selected-node outline.

**Tech Stack:** React, Tiptap 3 (`@tiptap/react`, `@tiptap/starter-kit`, new `@tiptap/extension-image`), Vite, plain CSS.

**Note on tests:** This project has no automated test suite (see `CLAUDE.md`). "Tests" here are `npm run build` (type-check + bundle) plus explicit manual verification steps. Do not scaffold a test framework.

---

### Task 1: Add the Tiptap image extension dependency

**Files:**
- Modify: `package.json` (dependencies), `package-lock.json` (auto)

- [ ] **Step 1: Install the extension pinned to the core version**

Run:
```bash
npm install @tiptap/extension-image@3.26.1
```
Expected: `package.json` gains `"@tiptap/extension-image": "^3.26.1"` under `dependencies`, alongside the existing `@tiptap/*` entries. No peer-dependency errors (it matches `@tiptap/react`/`@tiptap/pm` at `^3.26.1`).

- [ ] **Step 2: Verify the build still passes**

Run:
```bash
npm run build
```
Expected: PASS (type-check + bundle succeed). The new dep is installed but not yet imported, so nothing should change.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @tiptap/extension-image for inline body images (#31)"
```

---

### Task 2: Wire the Image extension + insert button into LoreEditor

**Files:**
- Modify: `src/components/LoreEditor.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/components/LoreEditor.tsx`, change the React import to include `useRef`, and add the new extension + `compressImage` imports. The current lines are:

```ts
import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { WikiLink } from '../extensions/WikiLink'
```

Replace with:

```ts
import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { WikiLink } from '../extensions/WikiLink'
import { compressImage } from '../imageUtils'
```

- [ ] **Step 2: Register the extension**

In the `useEditor` call, change:

```ts
    extensions: [StarterKit, WikiLink],
```

to:

```ts
    extensions: [StarterKit, WikiLink, Image.configure({ inline: false, allowBase64: true })],
```

`allowBase64: true` lets the `data:` URL `src` survive parsing/serialization; `inline: false` makes each image a block node on its own line.

- [ ] **Step 3: Add a file-input ref and pick handler**

Immediately after the `const editor = useEditor({...})` block (before the `// Toggle edit/view` effect), add:

```ts
  const fileInput = useRef<HTMLInputElement>(null)

  // Insert an image into the body: downscale to a body-friendly 1600px and embed
  // as a data URL (local-first — no upload). Mirrors Infobox.pickImage.
  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || !editor) return
    const dataUrl = await compressImage(file, 1600)
    editor.chain().focus().setImage({ src: dataUrl }).run()
  }
```

- [ ] **Step 4: Add the toolbar button + hidden input**

In the toolbar JSX, after the Divider button line:

```tsx
          <Btn title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</Btn>
```

insert:

```tsx
          <Btn title="Insert image" onClick={() => fileInput.current?.click()}>🖼</Btn>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={pickImage}
          />
```

The button lives inside the `{editable && (...)}` toolbar block, so it only renders in edit mode.

- [ ] **Step 5: Type-check and build**

Run:
```bash
npm run build
```
Expected: PASS. If TypeScript complains that `setImage` does not exist on the chain type, confirm the import in Step 1 is the default export from `@tiptap/extension-image` (the extension augments Tiptap's command types).

- [ ] **Step 6: Commit**

```bash
git add src/components/LoreEditor.tsx
git commit -m "feat: insert inline images into article bodies via toolbar (#31)"
```

---

### Task 3: Style body images

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add image rules to the ProseMirror block**

In `src/index.css`, after the existing line (~273):

```css
.ProseMirror ul, .ProseMirror ol { padding-left: 1.4em; }
```

add:

```css
.ProseMirror img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em 0;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.ProseMirror img.ProseMirror-selectednode {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

`max-width: 100%` keeps large images inside the column; the selected-node outline shows which image Backspace will delete.

- [ ] **Step 2: Build**

Run:
```bash
npm run build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: responsive body images with selected-node outline (#31)"
```

---

### Task 4: Manual verification

**Files:** none (runtime check).

- [ ] **Step 1: Start the dev server**

Run:
```bash
npm run dev
```
Then open `http://localhost:5174` (the pinned port; see `CLAUDE.md`).

- [ ] **Step 2: Insert an image**

Open any page, enter edit mode, click the 🖼 toolbar button, choose a large image (e.g. a multi-MB photo). Expected: the image appears inline in the editor, scaled to the column width.

- [ ] **Step 3: Verify view-mode persistence**

Switch to view mode, then reload the page (F5). Expected: the image is still there — confirms it saved into `content` and round-trips from IndexedDB.

- [ ] **Step 4: Verify downscaling**

In DevTools, inspect the inserted `<img>` and check its `naturalWidth`/`naturalHeight` — the larger dimension should be ≤ 1600. Expected: a multi-MB source becomes a much smaller JPEG data URL.

- [ ] **Step 5: Verify export/import round-trip**

Download a backup (Home → backup), then re-import it. Expected: pages with body images re-import with images intact.

- [ ] **Step 6: Confirm clean shutdown**

Stop the dev server (Ctrl-C). No commit for this task.

---

## Self-Review

**Spec coverage:**
- Add Tiptap image extension → Task 1 + Task 2 Step 2. ✓
- Store as data URLs, local-first → Task 2 Step 3 (`compressImage` returns a data URL; `allowBase64` preserves it). ✓
- Size guard / downscale, reuse `imageUtils.ts` → Task 2 Step 3 (`compressImage(file, 1600)`). ✓
- Files `LoreEditor.tsx`, `imageUtils.ts`, `index.css` → `imageUtils.ts` is reused as-is (no change needed; spec says "reuse"), the other two are modified in Tasks 2–3. ✓
- Insertion = toolbar button only → Task 2 Step 4. ✓
- Max dimension 1600px → Task 2 Step 3. ✓
- Insert-only (no resize/align/caption) → not implemented, per scope. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type/name consistency:** `pickImage`, `fileInput`, `setImage({ src })`, `compressImage(file, 1600)`, class `.ProseMirror-selectednode` used consistently across tasks. `setImage` is the command contributed by `@tiptap/extension-image`. ✓
