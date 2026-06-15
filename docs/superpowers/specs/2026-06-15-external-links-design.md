# External links in the editor — design (issue #32)

**Status:** Approved
**Date:** 2026-06-15
**Issue:** #32 (Tier 2, v0.0.1 roadmap)

## Problem

The body editor (`src/components/LoreEditor.tsx`) supports `[[wiki links]]` between
pages but has no way to link out to a reference URL. Issue #32 asks to add the Tiptap
Link extension with a toolbar button, external links opening in a new tab, and `WikiLink`
handling kept separate.

## Key revision to the issue's premise

The issue states "StarterKit omits the Link extension." This is out of date for the
installed version. `@tiptap/starter-kit@3.26.1` already bundles and registers
`@tiptap/extension-link` by default (`if (this.options.link !== false) { extensions.push(Link.configure(...)) }`).
The extension is already active as a mark — it's just unconfigured (default
`openOnClick: true`, no `target="_blank"`) and has no toolbar UI. We therefore
**configure it via `StarterKit.configure({ link: ... })`** rather than adding a
separate `@tiptap/extension-link` import (a duplicate would trigger a Tiptap
"duplicate extension" warning and undefined behavior).

No new npm dependency is required.

## Architecture

`WikiLink` is a Tiptap **Node** (`<a data-wikilink class="wiki-link">`). The bundled
Link extension is a Tiptap **mark** (`<a href>`). Different type systems — they don't
collide. The existing `handleClick` in `LoreEditor` already ignores external anchors
(it only matches `a.wiki-link`); it gets a new explicit branch for `a[href]:not(.wiki-link)`.

URL entry uses an **inline popover** (small input that appears below the toolbar on
toolbar-button click). No `window.prompt()`, no modal.

## Design

### `src/components/LoreEditor.tsx`

**1. Configure the bundled Link extension**

Pass configuration through `StarterKit.configure`:

```ts
StarterKit.configure({
  link: {
    openOnClick: false,   // cursor placement, not navigation (we handle clicks)
    autolink: true,       // typed/pasted bare URLs auto-link
    defaultProtocol: 'https',
    HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer', class: 'ext-link' },
  },
})
```

`openOnClick: false` is critical — it prevents Tiptap from navigating away in edit mode.
Navigation is handled explicitly by our click handler so wiki vs external links stay
on completely separate code paths.

**2. Popover state + handlers**

Add `useState` to the React import. Add near `fileInput` / `pickImage`:

- `showLinkBox: boolean` — controls popover visibility.
- `linkUrl: string` — the URL input value.
- `openLinkBox()` — pre-fills URL from `editor.getAttributes('link').href` if cursor is on a link, then opens popover.
- `applyLink()` — if URL is non-empty, prefixes `https://` if no protocol/mailto, calls `editor.chain().focus().extendMarkRange('link').setLink({ href }).run()`; if empty, calls `unsetLink()`.
- `removeLink()` — calls `unsetLink()` and closes popover.

`extendMarkRange('link')` applies the command to the full link even when only the cursor (no selection) is inside it.

**3. Toolbar button + popover JSX**

Inside the `{editable && (...)}` block:
- 🔗 toolbar button, `active={editor.isActive('link')}`, `onClick={openLinkBox}`.
- Popover (separate from toolbar `<div>`, but still gated on `editable && showLinkBox`): `<input type="url" autoFocus>`, Apply button, conditional Remove button (only shown when `editor.isActive('link')`). Input handles Enter (apply) and Escape (dismiss). All buttons use `onMouseDown={e => e.preventDefault()}` to preserve editor focus/selection.

**4. Extend `handleClick`**

Two explicit branches, mutually exclusive via `.wiki-link` class:

```ts
const wiki = el.closest('a.wiki-link')        // existing behavior, unchanged
const ext  = el.closest('a[href]:not(.wiki-link)')
```

External-link rule: view mode → always open in new tab; edit mode → Ctrl/Cmd-click to follow, plain click places cursor (same convention as `WikiLink`).

### `src/index.css`

Add in the `/* --- Editor --- */` block:

```css
.lore-editor { position: relative; }  /* popover anchor */

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

`top: 52px` positions the popover just below the sticky toolbar (30px button +
2 × 5px padding + 2px border = ~42px; 52px gives a small gap).

## Data flow

External links are `<a href class="ext-link" target="_blank" rel="noopener noreferrer">`
marks in the page's `content` HTML, persisted via the existing `onChange` → save path.
No `db.ts` changes. Export/import already serialize `content`, so links round-trip
through backups. Backlinks/graph scan `<a data-wikilink>`, not `<a href>`, so external
links are invisible to the backlink system (correct — they're not wiki-internal).

## Out of scope (YAGNI)

No link-editing bubble menu on hover, no per-link "edit/visit" inline controls, no
title/text attribute editing, no link-type auto-detection beyond the existing `[[…]]`
wiki syntax, no `@tiptap/extension-link` direct import.

## Testing

No automated tests in this project. Manual verification:

1. `npm run build` passes (type-check + bundle); no duplicate-extension warning at runtime.
2. Select text in edit mode, click 🔗, type `example.com`, Apply → text becomes
   `.ext-link`; href gets `https://` prefix.
3. Click 🔗 with cursor inside the link → popover pre-fills URL; Remove clears the link.
4. View mode → click the external link → opens in a new tab.
5. A `[[wiki link]]` on the same page still navigates in-app (separate branch in `handleClick`).
6. Edit mode: plain click on external link places cursor; Ctrl/Cmd-click opens new tab.
7. Reload (F5) → link persists in IndexedDB.
