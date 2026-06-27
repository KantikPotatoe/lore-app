# Alias / Flavor Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authors link to a page but display different text — `[[Target|shown text]]` — in both the rich-text body and infobox fields.

**Architecture:** A single pure helper (`parseWikiToken`) splits the inside of `[[…]]` into target + display; both code paths (the Tiptap `WikiLink` node and the `WikiText` infobox renderer) call it. The display text is cosmetic — `data-title` always stores the canonical target, so backlinks, the graph, hover, and broken-link detection are untouched. A node-selection edit popover in the body editor lets authors change an existing link's target/display.

**Tech Stack:** TypeScript (strict), React, Tiptap (ProseMirror), Vitest + happy-dom + @testing-library/react.

## Global Constraints

- TS `strict`; no `any` leaks in new public signatures.
- Test envs: Vitest + happy-dom + fake-indexeddb. DOMPurify tests would need jsdom, but this work adds none.
- CI gate before "done": `npm run lint && npm run build && npm run test:run` (all three).
- Do **not** change anything that resolves links by target: `data-title` stays the canonical target everywhere.
- Tests that mount `useLiveQuery` components need `afterEach(cleanup)`.

---

### Task 1: Pure `parseWikiToken` helper

**Files:**
- Create: `src/wikiLink.ts`
- Test: `src/wikiLink.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function parseWikiToken(raw: string): { target: string; display: string } | null`
  — `raw` is the text **inside** `[[…]]` (brackets already stripped by the caller).
  Splits on the first `|`; trims both halves; returns `null` when the target is
  empty; when no/empty display, `display === target`.

- [ ] **Step 1: Write the failing test**

```ts
// src/wikiLink.test.ts
import { describe, it, expect } from 'vitest'
import { parseWikiToken } from './wikiLink'

describe('parseWikiToken', () => {
  it('returns target=display for a plain token', () => {
    expect(parseWikiToken('Veldhaven')).toEqual({ target: 'Veldhaven', display: 'Veldhaven' })
  })

  it('splits target and display on the pipe', () => {
    expect(parseWikiToken('Odrian Borinor|the stranger'))
      .toEqual({ target: 'Odrian Borinor', display: 'the stranger' })
  })

  it('trims both halves', () => {
    expect(parseWikiToken('  Odrian Borinor  |  the stranger  '))
      .toEqual({ target: 'Odrian Borinor', display: 'the stranger' })
  })

  it('falls back to the target when display is empty', () => {
    expect(parseWikiToken('Veldhaven|')).toEqual({ target: 'Veldhaven', display: 'Veldhaven' })
    expect(parseWikiToken('Veldhaven|   ')).toEqual({ target: 'Veldhaven', display: 'Veldhaven' })
  })

  it('splits on the first pipe only (display may contain pipes)', () => {
    expect(parseWikiToken('Target|a|b')).toEqual({ target: 'Target', display: 'a|b' })
  })

  it('returns null when the target is empty or whitespace', () => {
    expect(parseWikiToken('')).toBeNull()
    expect(parseWikiToken('   ')).toBeNull()
    expect(parseWikiToken('|shown')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/wikiLink.test.ts`
Expected: FAIL — cannot resolve `./wikiLink` / `parseWikiToken` is not a function.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/wikiLink.ts
// Pure parser for the inside of a [[wiki link]] token. Shared by the editor's
// WikiLink node and the infobox WikiText renderer so the alias syntax
// (`Target|shown text`) is interpreted identically in both. The display text is
// cosmetic; `target` is the canonical page title everything else resolves by.

/** Split the inside of `[[…]]` into target + display. Splits on the first `|`
 *  only; trims both halves; returns null when the target is empty. With no (or
 *  empty) display, `display` equals `target`. */
export function parseWikiToken(raw: string): { target: string; display: string } | null {
  const pipe = raw.indexOf('|')
  const target = (pipe === -1 ? raw : raw.slice(0, pipe)).trim()
  if (!target) return null
  const display = pipe === -1 ? target : raw.slice(pipe + 1).trim() || target
  return { target, display }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/wikiLink.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/wikiLink.ts src/wikiLink.test.ts
git commit -m "feat: add parseWikiToken helper for alias link syntax"
```

---

### Task 2: `display` attribute on the WikiLink node

**Files:**
- Modify: `src/extensions/WikiLink.ts`
- Test: `src/extensions/WikiLink.test.ts` (create)

**Interfaces:**
- Consumes: `parseWikiToken` from `../wikiLink` (Task 1).
- Produces: the `wikiLink` node now carries a `display` attr. Stored HTML gains
  `data-display="…"` **only when display differs from title**. `renderText`
  round-trips `[[title|display]]` (or `[[title]]`). Node-shape contract used by
  Task 4: `attrs = { title: string; display: string }` (`display` is `''` when
  there is no alias).

- [ ] **Step 1: Write the failing test**

```ts
// src/extensions/WikiLink.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { WikiLink } from './WikiLink'

let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })

function mount(inner: { title: string; display?: string }) {
  editor = new Editor({
    extensions: [StarterKit, WikiLink],
    content: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'wikiLink', attrs: { title: inner.title, display: inner.display ?? '' } }],
      }],
    },
  })
  return editor
}

describe('WikiLink node', () => {
  it('renders an alias: display text as content, data-display attribute', () => {
    const html = mount({ title: 'Odrian Borinor', display: 'the stranger' }).getHTML()
    expect(html).toContain('data-title="Odrian Borinor"')
    expect(html).toContain('data-display="the stranger"')
    expect(html).toContain('>the stranger</a>')
  })

  it('omits data-display for a plain link (display empty or equal to title)', () => {
    expect(mount({ title: 'Veldhaven' }).getHTML()).not.toContain('data-display')
    expect(mount({ title: 'Veldhaven', display: 'Veldhaven' }).getHTML()).not.toContain('data-display')
  })

  it('serializes to [[title|display]] and [[title]] via renderText', () => {
    expect(mount({ title: 'Odrian Borinor', display: 'the stranger' }).getText())
      .toBe('[[Odrian Borinor|the stranger]]')
    expect(mount({ title: 'Veldhaven' }).getText()).toBe('[[Veldhaven]]')
  })

  it('parses data-display back into the display attribute', () => {
    editor = new Editor({
      extensions: [StarterKit, WikiLink],
      content: '<p><a data-wikilink data-title="Odrian Borinor" data-display="the stranger">the stranger</a></p>',
    })
    expect(editor.getText()).toBe('[[Odrian Borinor|the stranger]]')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/extensions/WikiLink.test.ts`
Expected: FAIL — `data-display` not emitted; `getText()` returns `[[Odrian Borinor]]`.

- [ ] **Step 3: Write the implementation**

Replace the body of `src/extensions/WikiLink.ts` with:

```ts
import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { parseWikiToken } from '../wikiLink'

// ---------------------------------------------------------------------------
// WikiLink: an inline node that renders as a clickable link to another page.
//
// While editing, type  [[Some Page Title]]  and it turns into a link. Use
// [[Target|shown text]] to link to Target but display "shown text" (an alias /
// flavor link). The canonical target lives in `data-title`; the alias is purely
// cosmetic, so backlinks/graph/hover all keep resolving by title.
//
// Navigation is handled by a click listener in LoreEditor (reads `data-title`).
// ---------------------------------------------------------------------------

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true, // treated as a single unit, not editable character-by-character
  selectable: true,

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title'),
        renderHTML: (attrs) => ({ 'data-title': attrs.title }),
      },
      // Optional alias text. Emitted as data-display only when it differs from
      // title (handled in renderHTML below), so plain links stay byte-identical.
      display: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-display') ?? '',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-wikilink]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { title, display } = node.attrs
    const aliased = display && display !== title
    return [
      'a',
      mergeAttributes(
        HTMLAttributes,
        aliased ? { 'data-display': display } : {},
        { 'data-wikilink': '', class: 'wiki-link' },
      ),
      aliased ? display : title,
    ]
  },

  // Lets you copy/paste the page as plain text and keep the [[...]] syntax.
  renderText({ node }) {
    const { title, display } = node.attrs
    return display && display !== title ? `[[${title}|${display}]]` : `[[${title}]]`
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ range, match, chain }) => {
          const parsed = parseWikiToken(match[1])
          if (!parsed) return
          chain()
            .deleteRange(range)
            .insertContent([
              { type: this.name, attrs: { title: parsed.target, display: parsed.display } },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
      }),
    ]
  },
})
```

Note: the input rule's `find` keeps `[^\]]+` so a `|` inside the brackets is
captured, then `parseWikiToken` does the split. The input rule firing on live
keystrokes is verified manually in Task 4's checklist (ProseMirror input rules
aren't reliably simulated in headless tests); its parsing is covered by Task 1.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/extensions/WikiLink.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/extensions/WikiLink.ts src/extensions/WikiLink.test.ts
git commit -m "feat: support [[Target|alias]] display text on the WikiLink node"
```

---

### Task 3: Alias support in infobox `WikiText`

**Files:**
- Modify: `src/components/WikiText.tsx`
- Test: `src/components/WikiText.test.tsx` (create)

**Interfaces:**
- Consumes: `parseWikiToken` from `../wikiLink` (Task 1).
- Produces: `WikiText` renders the display half of `[[Target|shown]]`, links/hovers
  the target, and broken-checks the target. Public props unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/WikiText.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import WikiText from './WikiText'

afterEach(cleanup)

describe('WikiText', () => {
  it('renders alias display text but links the target', () => {
    const onWikiClick = vi.fn()
    render(
      <WikiText
        value="Met [[Odrian Borinor|the stranger]] today"
        onWikiClick={onWikiClick}
        knownTitles={new Set(['odrian borinor'])}
      />,
    )
    const link = screen.getByText('the stranger')
    expect(link.className).toBe('wiki-link') // not broken — target is known
    fireEvent.click(link)
    expect(onWikiClick).toHaveBeenCalledWith('Odrian Borinor')
  })

  it('renders a plain link with its title', () => {
    const onWikiClick = vi.fn()
    render(<WikiText value="See [[Veldhaven]]." onWikiClick={onWikiClick} knownTitles={new Set(['veldhaven'])} />)
    fireEvent.click(screen.getByText('Veldhaven'))
    expect(onWikiClick).toHaveBeenCalledWith('Veldhaven')
  })

  it('marks an alias broken when the target is unknown', () => {
    render(
      <WikiText
        value="[[Nowhere|somewhere]]"
        onWikiClick={() => {}}
        knownTitles={new Set(['veldhaven'])}
      />,
    )
    expect(screen.getByText('somewhere').className).toBe('wiki-link is-broken')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/WikiText.test.tsx`
Expected: FAIL — current code shows `[[Odrian Borinor|the stranger]]` verbatim as
the link text; `getByText('the stranger')` finds nothing.

- [ ] **Step 3: Write the implementation**

Replace the loop body in `src/components/WikiText.tsx`. The full updated file:

```tsx
import { Fragment } from 'react'
import { showWikiHover, scheduleWikiHoverClose } from '../wikiLinkHover'
import { parseWikiToken } from '../wikiLink'

// Renders a plain string, turning any [[Page Name]] (or [[Target|shown text]])
// tokens into clickable wiki links — the same behavior as links inside the
// rich-text editor. Used for infobox field values (and anywhere else short text
// should support links).

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

interface Props {
  value: string
  onWikiClick: (title: string) => void
  /** Lowercased titles of existing pages; links not in the set render as broken. */
  knownTitles?: Set<string>
}

export default function WikiText({ value, onWikiClick, knownTitles }: Props) {
  const nodes: React.ReactNode[] = []
  const re = new RegExp(WIKILINK_RE) // fresh instance so lastIndex starts at 0
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(value)) !== null) {
    if (match.index > lastIndex) nodes.push(value.slice(lastIndex, match.index))
    const parsed = parseWikiToken(match[1])
    if (!parsed) {
      // Empty/whitespace target — leave the raw token in place.
      nodes.push(match[0])
    } else {
      const { target, display } = parsed
      const broken = knownTitles ? !knownTitles.has(target.toLowerCase()) : false
      nodes.push(
        <a
          key={key++}
          className={broken ? 'wiki-link is-broken' : 'wiki-link'}
          onClick={(e) => {
            e.preventDefault()
            onWikiClick(target)
          }}
          onMouseEnter={(e) => showWikiHover(target, (e.currentTarget as HTMLElement).getBoundingClientRect())}
          onMouseLeave={scheduleWikiHoverClose}
        >
          {display}
        </a>,
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex))

  return <Fragment>{nodes}</Fragment>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/components/WikiText.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/WikiText.tsx src/components/WikiText.test.tsx
git commit -m "feat: render alias display text in infobox wiki links"
```

---

### Task 4: Edit popover for body wiki links

**Files:**
- Modify: `src/components/LoreEditor.tsx`
- Modify: `src/index.css` (add `.wiki-link-edit` popover styles)

**Interfaces:**
- Consumes: the `wikiLink` node attr shape `{ title, display }` from Task 2.
- Produces: selecting a `wikiLink` node in edit mode opens a popover to edit its
  Target and Display; committing updates the node's attrs. No new exports.

- [ ] **Step 1: Add the selection-detection helper and state**

In `src/components/LoreEditor.tsx`, add the import near the other ProseMirror-ish
imports (top of file):

```ts
import { NodeSelection } from '@tiptap/pm/state'
```

Add this helper next to `computeSuggest` (after it, around line 32):

```ts
/** When the current selection is a single wiki-link node, return its document
 *  position and attrs so the edit popover can target it. Otherwise null. */
function selectedWikiLink(editor: Editor): { pos: number; title: string; display: string } | null {
  if (!editor.isEditable) return null
  const { selection } = editor.state
  if (selection instanceof NodeSelection && selection.node.type.name === 'wikiLink') {
    return { pos: selection.from, title: selection.node.attrs.title, display: selection.node.attrs.display || '' }
  }
  return null
}
```

Add state next to the `suggest` state (around line 68):

```ts
  // The wiki-link node currently being edited via the popover (edit mode only).
  const [editLink, setEditLink] = useState<{ pos: number; title: string; display: string } | null>(null)
```

- [ ] **Step 2: Drive the popover from selection changes**

Update the editor's `onSelectionUpdate` (currently line ~96) to also detect a
selected wiki link, and clear it on blur:

```ts
    onUpdate: ({ editor }) => { onChange(editor.getHTML()); setSuggest(computeSuggest(editor)) },
    onSelectionUpdate: ({ editor }) => { setSuggest(computeSuggest(editor)); setEditLink(selectedWikiLink(editor)) },
    onBlur: () => setSuggest(null),
```

(Leave `onBlur` clearing only `suggest` — clicking into the popover's inputs blurs
the editor, and we must not close the popover while it's being used.)

- [ ] **Step 3: Add the commit handler**

Add near `acceptSuggestion` (around line 108):

```ts
  // Write the popover's Target/Display back onto the selected wiki-link node.
  const applyEditLink = useCallback(() => {
    if (!editor || !editLink) return
    const title = editLink.title.trim()
    if (!title) { setEditLink(null); return }
    const display = editLink.display.trim()
    editor.chain().focus().command(({ tr }) => {
      tr.setNodeMarkup(editLink.pos, undefined, {
        title,
        display: display && display !== title ? display : '',
      })
      return true
    }).run()
    setEditLink(null)
  }, [editor, editLink])
```

- [ ] **Step 4: Compute the popover position and render it**

Add the position calc next to `suggestPos` (around line 185):

```ts
  let editLinkPos: { left: number; top: number } | null = null
  if (editable && editLink) {
    try {
      const c = editor.view.coordsAtPos(editLink.pos)
      editLinkPos = { left: c.left, top: c.bottom }
    } catch { editLinkPos = null }
  }
```

Render the popover just before the closing `</div>` of `.lore-editor` (after the
`{suggestPos && (…)}` block, around line 305):

```tsx
      {editLinkPos && editLink && (
        <div className="wiki-link-edit" style={{ left: editLinkPos.left, top: editLinkPos.top }}>
          <label>
            Target
            <input
              autoFocus
              type="text"
              value={editLink.title}
              onChange={(e) => setEditLink((s) => s && { ...s, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyEditLink() }
                if (e.key === 'Escape') { e.preventDefault(); setEditLink(null) }
              }}
            />
          </label>
          <label>
            Display
            <input
              type="text"
              placeholder="(same as target)"
              value={editLink.display}
              onChange={(e) => setEditLink((s) => s && { ...s, display: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyEditLink() }
                if (e.key === 'Escape') { e.preventDefault(); setEditLink(null) }
              }}
            />
          </label>
          <Btn title="Apply" onClick={applyEditLink}>Apply</Btn>
        </div>
      )}
```

- [ ] **Step 5: Add the popover styles**

Add to `src/index.css` after the `.wiki-suggest-item` rules (around line 487):

```css
/* Edit popover for an existing wiki link — anchored to the node (viewport-fixed). */
.wiki-link-edit {
  position: fixed; z-index: 1200; margin-top: 4px;
  display: flex; gap: 8px; align-items: flex-end;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px; box-shadow: 0 8px 30px rgba(0,0,0,.55);
}
.wiki-link-edit label {
  display: flex; flex-direction: column; gap: 3px;
  font-size: 11px; color: var(--muted); letter-spacing: 0.3px;
}
.wiki-link-edit input {
  background: var(--panel-2); border: 1px solid var(--border);
  border-radius: 6px; padding: 5px 9px; color: var(--ink); width: 170px;
}
```

- [ ] **Step 6: Verify the full suite + lint + build**

Run: `npm run test:run && npm run lint && npm run build`
Expected: all pass (test:run green, no ESLint errors, `tsc -b` + vite build succeed).

- [ ] **Step 7: Manual verification (dev server)**

Run `npm run dev`, open a page in edit mode, and confirm:
1. Typing `[[Veldhaven]]` makes a normal link showing "Veldhaven".
2. Typing `[[Odrian Borinor|the stranger]]` makes a link showing "the stranger";
   in view mode it navigates to Odrian Borinor and the hover card shows that page.
3. Clicking an existing wiki link in edit mode opens the popover; changing Display
   updates the shown text; clearing Display reverts it to the target title.
4. An infobox text/ref field containing `[[Veldhaven|the capital]]` shows "the
   capital" and links to Veldhaven.
5. Backlinks on the target page still list the linking page (target resolution
   unaffected).

- [ ] **Step 8: Commit**

```bash
git add src/components/LoreEditor.tsx src/index.css
git commit -m "feat: add edit popover for wiki link target/display"
```

---

## Self-Review notes

- **Spec coverage:** syntax/parsing → Task 1; WikiLink node `display` + `renderText`
  + input rule → Task 2; infobox WikiText → Task 3; edit popover → Task 4; sanitize
  (no change), backlinks/graph/hover/export (verified unaffected) → no task needed,
  asserted by Task 3's broken-check test + Task 4 manual step 5.
- **No migration:** additive; existing `[[Target]]` content and stored HTML parse
  identically (no `data-display` ⇒ `display` defaults to `''`). No schema bump.
- **Type consistency:** node attrs `{ title, display }` (both `string`, `display`
  `''` when unset) used consistently in Tasks 2 and 4; `parseWikiToken` returns
  `{ target, display }` used in Tasks 2 and 3.
- **Honest test boundary:** the input rule firing on live keystrokes and the
  popover's selection/positioning are covered by Task 4's manual checklist, not
  headless tests, because ProseMirror input rules and `coordsAtPos` aren't reliably
  exercised under happy-dom. The parsing and render/serialize logic they depend on
  is unit-tested in Tasks 1–3.
