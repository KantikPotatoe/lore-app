# Inline images in article bodies — design (issue #31)

**Status:** Approved
**Date:** 2026-06-15
**Issue:** #31 (Tier 2, v0.0.1 roadmap)

## Problem

The body editor is bare `StarterKit` (`src/components/LoreEditor.tsx`). Images
only exist in infoboxes and maps. A worldbuilding wiki wants portraits and scenes
inside prose. The app is local-first (IndexedDB via Dexie), so images must be
stored inline as data URLs and size-guarded to avoid DB bloat.

## Scope (approved decisions)

- **Insertion:** toolbar button only (file picker). No paste / drag-and-drop.
- **Max dimension:** downscale to **1600px** via existing `compressImage`.
- **Controls:** insert-only. No resize, alignment, or captions.

## Design

### 1. Dependency

Add `@tiptap/extension-image@^3.26.1` (matches the installed `@tiptap/*` core at
`^3.26.1`).

### 2. `src/components/LoreEditor.tsx`

- Register the `Image` extension: `extensions: [StarterKit, WikiLink, Image]`,
  configured with `inline: false` (block image on its own line) and
  `allowBase64: true` so a `data:` URL `src` survives serialization/parsing.
- Add a hidden `<input type="file" accept="image/*">` (via `useRef`) plus a
  toolbar `Btn` (🖼) in the existing toolbar group.
- On file pick: `compressImage(file, 1600)` → `editor.chain().focus()
  .setImage({ src: dataUrl }).run()`, then reset the input value — mirrors
  `Infobox.pickImage` (`src/components/Infobox.tsx:58`).
- The button + input render only when `editable` (toolbar is already gated on
  `editable`).

### 3. `src/index.css`

Add `.ProseMirror img` rules near the existing `.ProseMirror` block (~line 264):

- `max-width: 100%; height: auto;` + `border-radius` and margin so body images
  sit nicely in prose.
- A selected-state outline (`.ProseMirror img.ProseMirror-selectednode`) so
  authors can see which node Backspace will delete.

## Data flow

The image becomes an `<img src="data:image/jpeg;...">` node in the page's
`content` HTML, persisted through the existing `onChange` → save path. No `db.ts`
changes. `exportAll`/`importAll` already serialize `content`, so images round-trip
through backups. Backlinks and the graph scan `<a data-wikilink>` anchors and
infobox `[[…]]` values, so inline `<img>` nodes don't affect them.

## Out of scope (YAGNI)

Paste-from-clipboard, drag-and-drop, image resizing, alignment / text-wrap,
captions.

## Testing

No automated tests in this project. Manual verification:

1. Insert an image in edit mode; confirm it appears in view mode.
2. Save and reload; confirm the image persists (data URL in IndexedDB).
3. Export to JSON, re-import; confirm the image round-trips.
4. Confirm a large source image is downscaled (≤1600px) — check data URL size is
   reasonable, not multi-MB.
