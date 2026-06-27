# Citations in pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an author cite claims in a page's body to in-world sources (a lore page or free text), rendered as inline superscript markers tied to an auto-generated References section.

**Architecture:** A new Tiptap inline atom node (`Citation`, mirroring `WikiLink`) stores the source in `data-*` attributes on a `<sup>`. Numbering is a pure CSS counter. A `References` component parses the page body and renders a numbered list. Data lives in `content`, so it rides existing export/import/sanitize paths. `renamePage` rewrites citation page-targets; backlinks/graph are untouched.

**Tech Stack:** React + TypeScript (strict), Tiptap/ProseMirror, Dexie, Vitest + happy-dom (jsdom for sanitize), DOMPurify.

## Global Constraints

- TS `strict`. Run `npm run lint`, `npm run build`, and `npm run test:run` before claiming done — all three must pass (CI runs them).
- Pure date/dom helpers live in `src/*.ts` (like `html.ts`/`calendar.ts`); they are **not** added to the `src/db/` barrel. Only `db/` public API goes through `src/db/index.ts`.
- DOMPurify tests must use jsdom: first line `// @vitest-environment jsdom`.
- Citations are independent (each marker its own number); no source reuse, no schema/backup change, no backlinks/graph integration.
- Match existing code style: comment density and naming as in neighbouring files.

---

### Task 1: `citations.ts` — Citation type + `parseCitations`

**Files:**
- Create: `src/citations.ts`
- Test: `src/citations.test.ts`

**Interfaces:**
- Consumes: `parseHtml` from `src/html.ts`.
- Produces:
  - `interface Citation { target: string; text: string; locator: string; quote: string }`
  - `function parseCitations(html: string): Citation[]` — citation markers in document order, skipping any `<sup data-citation>` with neither `target` nor `text`.

- [ ] **Step 1: Write the failing test**

```ts
// src/citations.test.ts
import { describe, it, expect } from 'vitest'
import { parseCitations } from './citations'

const mark = (attrs: Record<string, string>) =>
  `<sup data-citation ${Object.entries(attrs).map(([k, v]) => `data-${k}="${v}"`).join(' ')}></sup>`

describe('parseCitations', () => {
  it('returns page + free-text citations in document order', () => {
    const html = `<p>A${mark({ target: 'Chronicle of the Vale', locator: 'Ch. 3', quote: 'founded 312' })}` +
      ` B${mark({ text: "Merchant's Ledger" })}</p>`
    expect(parseCitations(html)).toEqual([
      { target: 'Chronicle of the Vale', text: '', locator: 'Ch. 3', quote: 'founded 312' },
      { target: '', text: "Merchant's Ledger", locator: '', quote: '' },
    ])
  })

  it('skips a marker with neither target nor text', () => {
    expect(parseCitations(`<p>x${mark({ locator: 'p.1' })}</p>`)).toEqual([])
  })

  it('returns [] for empty or marker-free html', () => {
    expect(parseCitations('')).toEqual([])
    expect(parseCitations('<p>nothing here</p>')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/citations.test.ts`
Expected: FAIL — cannot find module `./citations` / `parseCitations` is not a function.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/citations.ts
// A citation marks a claim in a page body with an in-world source. Each marker is
// a Tiptap `Citation` node rendered as <sup data-citation …>; the source lives in
// its data-* attributes. This module is pure (no React/Dexie) — like html.ts — so
// the References component, the HTML export, and tests all read markers the same way.
import { parseHtml } from './html'

export interface Citation {
  target: string  // cited page title; '' when the source is free text
  text: string    // free-text source; '' when the source is a page
  locator: string // optional locator, e.g. "Ch. 3", "p. 42"; '' when none
  quote: string   // optional quoted excerpt; '' when none
}

/** Every citation marker in a body's HTML, in document order. A marker with
 *  neither a page target nor free text is malformed and skipped. */
export function parseCitations(html: string): Citation[] {
  if (!html || !html.includes('data-citation')) return []
  const out: Citation[] = []
  parseHtml(html)
    .querySelectorAll('sup[data-citation]')
    .forEach((el) => {
      const target = el.getAttribute('data-target')?.trim() ?? ''
      const text = el.getAttribute('data-text')?.trim() ?? ''
      if (!target && !text) return
      out.push({
        target,
        text,
        locator: el.getAttribute('data-locator')?.trim() ?? '',
        quote: el.getAttribute('data-quote')?.trim() ?? '',
      })
    })
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/citations.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/citations.ts src/citations.test.ts
git commit -m "feat: parseCitations helper for body citation markers (#87)"
```

---

### Task 2: `Citation` Tiptap node

**Files:**
- Create: `src/extensions/Citation.ts`
- Test: `src/extensions/Citation.test.ts`

**Interfaces:**
- Consumes: nothing project-internal.
- Produces: `export const Citation` — a Tiptap inline atom node named `citation` with attrs `target`, `text`, `locator`, `quote` (all default `''`). Renders `<sup data-citation class="citation" data-target/data-text/data-locator/data-quote>` (only non-empty data-* attrs emitted). `renderText` → `[^<source>]` or `[^<source>, <locator>]` where source is `target || text`. `parseHTML` matches `sup[data-citation]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/extensions/Citation.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Citation } from './Citation'

let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })

function mount(attrs: { target?: string; text?: string; locator?: string; quote?: string }) {
  editor = new Editor({
    extensions: [StarterKit, Citation],
    content: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'citation', attrs: { target: '', text: '', locator: '', quote: '', ...attrs } }],
      }],
    },
  })
  return editor
}

describe('Citation node', () => {
  it('renders a <sup data-citation> with the source data-* attributes', () => {
    const html = mount({ target: 'Chronicle of the Vale', locator: 'Ch. 3' }).getHTML()
    expect(html).toContain('data-citation')
    expect(html).toContain('data-target="Chronicle of the Vale"')
    expect(html).toContain('data-locator="Ch. 3"')
    expect(html).toContain('class="citation"')
  })

  it('omits empty data-* attributes', () => {
    const html = mount({ text: 'Oral tradition' }).getHTML()
    expect(html).toContain('data-text="Oral tradition"')
    expect(html).not.toContain('data-target')
    expect(html).not.toContain('data-quote')
  })

  it('serializes to plain text via renderText', () => {
    expect(mount({ target: 'Frodo', locator: 'p.2' }).getText()).toBe('[^Frodo, p.2]')
    expect(mount({ text: 'Ledger' }).getText()).toBe('[^Ledger]')
  })

  it('parses an existing <sup data-citation> back into a node', () => {
    editor = new Editor({
      extensions: [StarterKit, Citation],
      content: '<p>x<sup data-citation data-target="Frodo" data-locator="p.2" class="citation"></sup></p>',
    })
    expect(editor.getText()).toBe('x[^Frodo, p.2]')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/extensions/Citation.test.ts`
Expected: FAIL — cannot find module `./Citation`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/extensions/Citation.ts
import { Node, mergeAttributes } from '@tiptap/core'

// ---------------------------------------------------------------------------
// Citation: an inline atom rendered as a superscript marker that cites a claim
// to an in-world source — either a lore page (`target`, the page title) or free
// text (`text`), with an optional `locator` ("Ch. 3") and `quote`. The visible
// number is NOT stored: it comes from a CSS counter over document order (see
// index.css), so markers renumber automatically. The References component
// (src/components/References.tsx) lists the sources in the same order.
//
// Insertion/editing is driven by a dialog in LoreEditor; view-mode clicks scroll
// to the matching reference (handled in LoreEditor.handleClick).
// ---------------------------------------------------------------------------

const attr = (name: string) => ({
  default: '',
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? '',
  // Only emit the attribute when non-empty, so plain markers stay compact.
  renderHTML: (attrs: Record<string, string>) =>
    attrs[name] ? { [`data-${name}`]: attrs[name] } : {},
})

export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { target: attr('target'), text: attr('text'), locator: attr('locator'), quote: attr('quote') }
  },

  parseHTML() {
    return [{ tag: 'sup[data-citation]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes, { 'data-citation': '', class: 'citation' })]
  },

  // Plain-text copy/paste: [^Source] or [^Source, locator].
  renderText({ node }) {
    const { target, text, locator } = node.attrs
    const source = target || text
    return locator ? `[^${source}, ${locator}]` : `[^${source}]`
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/extensions/Citation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/extensions/Citation.ts src/extensions/Citation.test.ts
git commit -m "feat: Citation Tiptap node (#87)"
```

---

### Task 3: `References` component

**Files:**
- Create: `src/components/References.tsx`
- Test: `src/components/References.test.tsx`

**Interfaces:**
- Consumes: `parseCitations`, `Citation` from `src/citations.ts`.
- Produces:
  ```ts
  interface ReferencesProps {
    content: string
    knownTitles?: Set<string>          // lowercased existing titles → broken styling
    onWikiClick: (title: string) => void
    onBackref: (index: number) => void // scroll to the nth marker in the body
  }
  export default function References(props: ReferencesProps): JSX.Element | null
  ```
  Renders nothing when there are no citations. Otherwise a `div.references` with a `div.references-head` ("References") and an `<ol class="references-list">`; the nth `<li>` has `id={`cite-ref-${i}`}`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/References.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import References from './References'

afterEach(cleanup)

const mark = (attrs: Record<string, string>) =>
  `<sup data-citation ${Object.entries(attrs).map(([k, v]) => `data-${k}="${v}"`).join(' ')}></sup>`

describe('References', () => {
  it('renders nothing when there are no citations', () => {
    const { container } = render(
      <References content="<p>no marks</p>" onWikiClick={() => {}} onBackref={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a numbered list with a page link and free text', () => {
    const content = `<p>a${mark({ target: 'Frodo', locator: 'p.2' })} b${mark({ text: 'Ledger' })}</p>`
    const onWikiClick = vi.fn()
    render(
      <References
        content={content}
        knownTitles={new Set(['frodo'])}
        onWikiClick={onWikiClick}
        onBackref={() => {}}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    fireEvent.click(screen.getByText('Frodo'))
    expect(onWikiClick).toHaveBeenCalledWith('Frodo')
    expect(screen.getByText(/Ledger/)).toBeTruthy()
    expect(screen.getByText(/p\.2/)).toBeTruthy()
  })

  it('marks a page link to a missing page as broken', () => {
    const content = `<p>a${mark({ target: 'Ghost' })}</p>`
    render(<References content={content} knownTitles={new Set()} onWikiClick={() => {}} onBackref={() => {}} />)
    expect(screen.getByText('Ghost').className).toContain('is-broken')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/References.test.tsx`
Expected: FAIL — cannot find module `./References`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/References.tsx
import { parseCitations } from '../citations'

interface ReferencesProps {
  /** Page body HTML to scan for citation markers. */
  content: string
  /** Lowercased titles of existing pages — page sources not in here render broken. */
  knownTitles?: Set<string>
  /** Navigate to a cited page (resolve-or-create handled by the caller). */
  onWikiClick: (title: string) => void
  /** Scroll the nth citation marker in the body into view. */
  onBackref: (index: number) => void
}

/** The auto-generated "References" section under a page body. Numbered in document
 *  order to match the CSS-counter numbers on the markers (see index.css). Renders
 *  nothing when the page has no citations. */
export default function References({ content, knownTitles, onWikiClick, onBackref }: ReferencesProps) {
  const citations = parseCitations(content)
  if (citations.length === 0) return null

  return (
    <div className="references">
      <div className="references-head">References</div>
      <ol className="references-list">
        {citations.map((c, i) => {
          const broken = !!c.target && !!knownTitles && !knownTitles.has(c.target.toLowerCase())
          return (
            <li key={i} id={`cite-ref-${i}`} className="reference">
              <button
                type="button"
                className="reference-backref"
                title="Back to citation"
                onClick={() => onBackref(i)}
              >
                ↑
              </button>
              <span className="reference-body">
                {c.target ? (
                  <button
                    type="button"
                    className={`wiki-link${broken ? ' is-broken' : ''}`}
                    onClick={() => onWikiClick(c.target)}
                  >
                    {c.target}
                  </button>
                ) : (
                  <span className="reference-source">{c.text}</span>
                )}
                {c.locator && <span className="reference-locator">, {c.locator}</span>}
                {c.quote && <span className="reference-quote">— “{c.quote}”</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/References.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/References.tsx src/components/References.test.tsx
git commit -m "feat: References section component (#87)"
```

---

### Task 4: Wire `Citation` into `LoreEditor` (node + Cite dialog + edit-existing + click nav)

**Files:**
- Modify: `src/components/LoreEditor.tsx`

**Interfaces:**
- Consumes: `Citation` from `src/extensions/Citation.ts`; existing `rankWikiTitles` and `pageTitles`.
- Produces: new optional prop `onCitationClick?: (index: number) => void` on `LoreEditor`'s `Props`, called in view mode when a marker is clicked, with its 0-based ordinal among `sup[data-citation]`.

- [ ] **Step 1: Register the node and add the prop**

In the imports near the top, after the `WikiLink` import:

```tsx
import { Citation } from '../extensions/Citation'
```

Add to `interface Props` (after `autolinkEnabled?`):

```tsx
  /** View-mode: a citation marker was clicked; arg is its 0-based order in the body. */
  onCitationClick?: (index: number) => void
```

Add `onCitationClick` to the destructured params in the function signature:

```tsx
export default function LoreEditor({ content, editable, onChange, onWikiClick, knownTitles, autolinkTitles, autolinkEnabled, onCitationClick }: Props) {
```

Register the node in the `extensions` array (after `WikiLink,`):

```tsx
      Citation,
```

- [ ] **Step 2: Add citation-dialog state and the selected-node helper**

Add this helper next to `selectedWikiLink` (above the component):

```tsx
/** State of the citation dialog. `pos` is the doc position of the node being
 *  edited, or null when inserting a new citation. */
interface CiteDraft {
  pos: number | null
  mode: 'page' | 'text'
  target: string
  text: string
  locator: string
  quote: string
}

/** When the selection is a single citation node, return its position + attrs. */
function selectedCitation(editor: Editor): { pos: number; attrs: CiteDraft } | null {
  if (!editor.isEditable) return null
  const { selection } = editor.state
  if (selection instanceof NodeSelection && selection.node.type.name === 'citation') {
    const a = selection.node.attrs
    return {
      pos: selection.from,
      attrs: {
        pos: selection.from,
        mode: a.text && !a.target ? 'text' : 'page',
        target: a.target ?? '',
        text: a.text ?? '',
        locator: a.locator ?? '',
        quote: a.quote ?? '',
      },
    }
  }
  return null
}
```

Inside the component, add state (next to `editLink`):

```tsx
  const [cite, setCite] = useState<CiteDraft | null>(null)
```

In `onSelectionUpdate`, also sync the citation dialog so selecting a marker opens it pre-filled:

```tsx
    onSelectionUpdate: ({ editor }) => {
      setSuggest(computeSuggest(editor)); setEditLink(selectedWikiLink(editor))
      const sc = selectedCitation(editor)
      setCite(sc ? sc.attrs : null)
    },
```

- [ ] **Step 3: Add insert/apply handlers**

Add near `applyEditLink`:

```tsx
  // Open the dialog to insert a brand-new citation at the cursor.
  const openCite = useCallback(() => {
    setCite({ pos: null, mode: 'page', target: '', text: '', locator: '', quote: '' })
  }, [])

  // Write the dialog back to the document: update the selected node, or insert one.
  const applyCite = useCallback(() => {
    if (!editor || !cite) return
    const attrs = {
      target: cite.mode === 'page' ? cite.target.trim() : '',
      text: cite.mode === 'text' ? cite.text.trim() : '',
      locator: cite.locator.trim(),
      quote: cite.quote.trim(),
    }
    if (!attrs.target && !attrs.text) { setCite(null); return } // nothing to cite
    if (cite.pos === null) {
      editor.chain().focus().insertContent({ type: 'citation', attrs }).run()
    } else {
      const pos = cite.pos
      editor.chain().focus().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, attrs); return true }).run()
    }
    setCite(null)
  }, [editor, cite])
```

- [ ] **Step 4: Add the "Cite" toolbar button**

After the external-link button (`<Btn title="Link (external URL)" …>🔗</Btn>`), add:

```tsx
          <Btn title="Insert citation" active={!!cite} onClick={openCite}>❝¹</Btn>
```

- [ ] **Step 5: Add the citation dialog UI**

After the `showLinkBox` popover block (the `{editable && showLinkBox && (…)}` JSX), add:

```tsx
      {editable && cite && (
        <div className="cite-popover">
          <div className="cite-mode">
            <button
              type="button"
              className={`tb-btn${cite.mode === 'page' ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setCite((c) => c && { ...c, mode: 'page' })}
            >Page</button>
            <button
              type="button"
              className={`tb-btn${cite.mode === 'text' ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setCite((c) => c && { ...c, mode: 'text' })}
            >Free text</button>
          </div>
          {cite.mode === 'page' ? (
            <label>
              Source page
              <input
                autoFocus
                type="text"
                placeholder="Page title…"
                value={cite.target}
                onChange={(e) => setCite((c) => c && { ...c, target: e.target.value })}
              />
              {cite.target.trim() && (
                <div className="cite-suggest">
                  {rankWikiTitles(pageTitles ?? [], cite.target).slice(0, 6).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="wiki-suggest-item"
                      onMouseDown={(e) => { e.preventDefault(); setCite((c) => c && { ...c, target: t }) }}
                    >{t}</button>
                  ))}
                </div>
              )}
            </label>
          ) : (
            <label>
              Source
              <input
                autoFocus
                type="text"
                placeholder="e.g. The Oral Tradition of the Vale"
                value={cite.text}
                onChange={(e) => setCite((c) => c && { ...c, text: e.target.value })}
              />
            </label>
          )}
          <label>
            Locator
            <input
              type="text"
              placeholder="e.g. Ch. 3, p. 42"
              value={cite.locator}
              onChange={(e) => setCite((c) => c && { ...c, locator: e.target.value })}
            />
          </label>
          <label>
            Quote
            <textarea
              rows={2}
              placeholder="optional excerpt"
              value={cite.quote}
              onChange={(e) => setCite((c) => c && { ...c, quote: e.target.value })}
            />
          </label>
          <div className="cite-actions">
            <Btn title="Apply citation" onClick={applyCite}>Apply</Btn>
            <Btn title="Cancel" onClick={() => setCite(null)}>Cancel</Btn>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Handle view-mode marker clicks**

In `handleClick`, before the `const ext = …` external-link block, add:

```tsx
    const citeEl = el.closest('sup[data-citation]')
    if (citeEl) {
      if (editable) return // edit mode: selection opens the dialog instead
      e.preventDefault()
      const all = Array.from(editor.view.dom.querySelectorAll('sup[data-citation]'))
      const idx = all.indexOf(citeEl)
      if (idx >= 0) onCitationClick?.(idx)
      return
    }
```

- [ ] **Step 7: Verify build, lint, and existing tests still pass**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all pass (no behavioural test for the editor UI; covered by manual check in Task 5 and the unit tests of Tasks 1–3).

- [ ] **Step 8: Commit**

```bash
git add src/components/LoreEditor.tsx
git commit -m "feat: citation insert/edit dialog + node wiring in editor (#87)"
```

---

### Task 5: Wire `References` into `PageRoute` + scroll navigation

**Files:**
- Modify: `src/routes/PageRoute.tsx`

**Interfaces:**
- Consumes: `References` (Task 3); `LoreEditor.onCitationClick` (Task 4).
- Produces: References rendered in `page-main`; two scroll helpers wiring marker↔reference.

- [ ] **Step 1: Import the component**

After `import LoreEditor from '../components/LoreEditor'`:

```tsx
import References from '../components/References'
```

- [ ] **Step 2: Add scroll helpers**

Inside the component, after `mainRef` is declared, add:

```tsx
  // Marker → reference: scroll the matching <li> into view (ids set in References).
  function scrollToReference(index: number) {
    document.getElementById(`cite-ref-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  // Reference → marker: scroll the nth citation marker in the body into view.
  function scrollToMarker(index: number) {
    const marks = mainRef.current?.querySelectorAll('sup[data-citation]')
    marks?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
```

- [ ] **Step 3: Pass the click handler to the editor and render References**

Add `onCitationClick={scrollToReference}` to the `<LoreEditor …/>` props (alongside `onWikiClick`).

Then, inside `<div className="page-main" ref={mainRef}>`, after `<ImageGallery page={page} editable={editing} />`, add:

```tsx
          <References
            content={page.content}
            knownTitles={knownTitles}
            onWikiClick={followWikiLink}
            onBackref={scrollToMarker}
          />
```

- [ ] **Step 4: Verify and manually check**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all pass.

Manual check (`npm run dev`, open http://localhost:5174):
- Open a page, Edit, click the **Cite** button, pick a page source, add a locator, Apply → a superscript `[1]` appears.
- Add a second citation with free text → it shows `[2]`.
- Done editing: a **References** section lists both, numbered; the page source is a link, the free-text source is plain text; clicking the marker scrolls to its reference and the "↑" scrolls back.
- Re-enter Edit, click an existing marker → dialog reopens pre-filled; change the locator → Apply updates it.

- [ ] **Step 5: Commit**

```bash
git add src/routes/PageRoute.tsx
git commit -m "feat: render References on pages + citation scroll nav (#87)"
```

---

### Task 6: Styles for markers and the References section

**Files:**
- Modify: `src/index.css`

**Interfaces:** none (CSS only).

- [ ] **Step 1: Add the citation + references styles**

After the `.wiki-link.autolink` rules (around line 454), add:

```css
/* ── Citations ───────────────────────────────────────────────────────────── */
/* Numbering comes from a CSS counter over document order, so markers and the
   References list (an <ol>) stay in sync without storing numbers. */
.page-main { counter-reset: cite; }
sup.citation { counter-increment: cite; cursor: pointer; color: var(--accent-soft); font-size: 0.7em; }
sup.citation::before { content: "[" counter(cite) "]"; }
sup.citation:hover { color: var(--accent); }

.references {
  margin-top: 32px; border-top: 1px solid var(--border); padding-top: 16px;
}
.references-head {
  font-family: var(--display); font-size: 12px; text-transform: uppercase;
  letter-spacing: 1px; color: var(--ink-dim); margin-bottom: 8px;
}
.references-list { margin: 0; padding-left: 1.5em; display: flex; flex-direction: column; gap: 6px; }
.reference { color: var(--ink-dim); font-size: 14px; }
.reference-backref {
  background: none; border: none; color: var(--accent-soft); cursor: pointer;
  padding: 0 4px 0 0; font-size: 13px;
}
.reference-backref:hover { color: var(--accent); }
.reference-locator { color: var(--ink-faint); }
.reference-quote { color: var(--ink-faint); font-style: italic; margin-left: 4px; }

/* Citation dialog (insert/edit) — mirrors .wiki-link-edit. */
.cite-popover {
  position: absolute; top: 58px; left: 5px; z-index: 10;
  display: flex; flex-direction: column; gap: 8px;
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 8px; padding: 10px; width: 300px; max-width: calc(100% - 10px);
  box-shadow: 0 8px 30px rgba(0,0,0,.55);
}
.cite-popover label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--muted); letter-spacing: 0.3px; }
.cite-popover input, .cite-popover textarea {
  background: var(--panel-2); border: 1px solid var(--border);
  border-radius: 6px; padding: 5px 9px; color: var(--ink); width: 100%; box-sizing: border-box;
  font-family: inherit; resize: vertical;
}
.cite-mode { display: flex; gap: 6px; }
.cite-suggest { display: flex; flex-direction: column; margin-top: 4px; max-height: 160px; overflow-y: auto; }
.cite-actions { display: flex; gap: 6px; justify-content: flex-end; }
```

- [ ] **Step 2: Verify and eyeball**

Run: `npm run build`
Expected: PASS.

Manual (`npm run dev`): the marker shows `[1]` in both edit and view, the References section and dialog look consistent with the existing panels. (If `--ink-faint`/`--muted`/`--accent-soft` aren't defined, substitute the nearest existing token — grep `:root` in `src/index.css`.)

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: citation markers + References section (#87)"
```

---

### Task 7: `renamePage` rewrites citation page-targets

**Files:**
- Modify: `src/db/pages.ts` (the `rewriteLinksInPage` function, around lines 53–96)
- Test: `src/db/pages.test.ts` (add to the existing `renamePage` describe block)

**Interfaces:**
- Consumes: existing `rewriteLinksInPage`/`renamePage`.
- Produces: renaming a page also rewrites `sup[data-citation][data-target="OldTitle"]` → new title in every other page's body.

- [ ] **Step 1: Write the failing test**

Add inside the `describe('renamePage', …)` block in `src/db/pages.test.ts`:

```ts
  it('rewrites a citation marker that targeted the old title', async () => {
    const target = await createPage({ title: 'Frodo' })
    const cited = `<sup data-citation data-target="Frodo" data-locator="p.2" class="citation"></sup>`
    const linker = await createPage({ title: 'Sam', content: `<p>knows him${cited}</p>` })

    await renamePage(target, 'Frodo Baggins')

    const body = (await db.pages.get(linker))!.content
    expect(body).toContain('data-target="Frodo Baggins"')
    expect(body).not.toContain('data-target="Frodo"')
    expect(body).toContain('data-locator="p.2"') // other attrs untouched
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/pages.test.ts -t "citation marker"`
Expected: FAIL — body still contains `data-target="Frodo"`.

- [ ] **Step 3: Extend `rewriteLinksInPage`**

In `src/db/pages.ts`, inside `rewriteLinksInPage`, change the body-rewrite guard and add a citation pass. Replace the existing body block:

```ts
  // Body: <a data-wikilink data-title="Old">Old</a> — rewrite attribute + text.
  if (page.content && page.content.includes('data-wikilink')) {
    const doc = parseHtml(page.content)
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
```

with:

```ts
  // Body: rewrite <a data-wikilink data-title="Old"> (attribute + text) AND
  // <sup data-citation data-target="Old"> citation markers.
  if (page.content && (page.content.includes('data-wikilink') || page.content.includes('data-citation'))) {
    const doc = parseHtml(page.content)
    let bodyChanged = false
    doc.querySelectorAll('a[data-wikilink]').forEach((a) => {
      if (a.getAttribute('data-title')?.trim().toLowerCase() === oldLc) {
        a.setAttribute('data-title', newTitle)
        a.textContent = newTitle
        bodyChanged = true
      }
    })
    doc.querySelectorAll('sup[data-citation]').forEach((s) => {
      if (s.getAttribute('data-target')?.trim().toLowerCase() === oldLc) {
        s.setAttribute('data-target', newTitle)
        bodyChanged = true
      }
    })
    if (bodyChanged) {
      out.content = doc.body.innerHTML
      changed = true
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/db/pages.test.ts`
Expected: PASS (existing rename tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/db/pages.ts src/db/pages.test.ts
git commit -m "feat: rewrite citation targets on page rename (#87)"
```

---

### Task 8: Confirm citations survive import sanitization

**Files:**
- Modify: `src/sanitize.ts` (comment only)
- Test: `src/sanitize.test.ts`

**Interfaces:** none new — `sup`, `class`, and `data-*` are already whitelisted. This task pins that behaviour so a future whitelist edit can't silently drop citations.

- [ ] **Step 1: Write the failing/guard test**

Add to `src/sanitize.test.ts` (inside the `describe('sanitizeHtml', …)` block, in the "must survive" section):

```ts
  it('keeps citation markers (sup data-citation + data-* attrs)', () => {
    const html = '<sup data-citation data-target="Frodo" data-locator="p.2" data-quote="hi" class="citation"></sup>'
    const out = sanitizeHtml(html)
    expect(out).toContain('data-citation')
    expect(out).toContain('data-target="Frodo"')
    expect(out).toContain('data-locator="p.2"')
    expect(out).toContain('citation')
  })
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/sanitize.test.ts`
Expected: PASS (DOMPurify keeps empty allowed elements; `data-*` via `ALLOW_DATA_ATTR`). If it unexpectedly FAILS because the empty `<sup>` is dropped, set `KEEP_CONTENT: true` is not enough — instead add a non-breaking note: this would indicate DOMPurify drops empty `sup`; in that case the fix is to keep markers non-empty isn't an option (number is CSS). Resolve by adding `sup` to a `ADD_TAGS`-style allow with content kept — but this should not happen with default config; investigate before changing the node.

- [ ] **Step 3: Add a documenting comment in `sanitize.ts`**

In the header comment list (after the `wiki links:` bullet, around line 14), add:

```ts
//   - citations:      <sup data-citation data-target/data-text/data-locator/data-quote class="citation">
```

- [ ] **Step 4: Re-run and confirm**

Run: `npx vitest run src/sanitize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sanitize.ts src/sanitize.test.ts
git commit -m "test: pin citation markers surviving sanitization (#87)"
```

---

### Task 9: HTML export — numbered markers + References section

**Files:**
- Modify: `src/htmlExport.ts`
- Test: `src/htmlExport.test.ts`

**Interfaces:**
- Consumes: `parseCitations` from `src/citations.ts`; existing `titleToId` map in `buildHtmlSite`.
- Produces: exported pages contain numbered citation markers (counter CSS) and a per-page References section; page sources link to `./<id>.html`, free-text/broken sources render as text.

- [ ] **Step 1: Write the failing test**

Add to `src/htmlExport.test.ts` (inside `describe('buildHtmlSite', …)`):

```ts
  it('renders a References section with page links and free text', () => {
    const cite = (a: Record<string, string>) =>
      `<sup data-citation ${Object.entries(a).map(([k, v]) => `data-${k}="${v}"`).join(' ')}></sup>`
    const pages = [
      page('a', 'A', { content: `<p>x${cite({ target: 'B', locator: 'Ch.1' })} y${cite({ text: 'Ledger' })}</p>` }),
      page('b', 'B'),
    ]
    const files = buildHtmlSite(pages, [])
    const html = files['pages/a.html']
    expect(html).toContain('<section class="references">')
    expect(html).toContain('href="./b.html"') // page source linked
    expect(html).toContain('Ch.1')
    expect(html).toContain('Ledger')
    expect(files['style.css']).toContain('counter-increment: cite')
  })
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/htmlExport.test.ts -t "References section"`
Expected: FAIL — no `<section class="references">` in output.

- [ ] **Step 3: Add the references renderer and CSS**

In `src/htmlExport.ts`, add the import at the top:

```ts
import { parseCitations } from './citations'
```

Add a render function near `renderGallery`:

```ts
function renderReferences(page: LorePage, titleToId: Map<string, string>): string {
  const citations = parseCitations(page.content)
  if (citations.length === 0) return ''
  const items = citations.map((c) => {
    const id = c.target ? titleToId.get(c.target) : undefined
    const source = c.target
      ? (id ? `<a href="./${id}.html">${c.target}</a>` : `<span class="broken-link">${c.target}</span>`)
      : c.text
    const loc = c.locator ? `, ${c.locator}` : ''
    const quote = c.quote ? ` — “${c.quote}”` : ''
    return `<li>${source}${loc}${quote}</li>`
  }).join('\n')
  return `<section class="references"><h2>References</h2><ol>${items}</ol></section>`
}
```

Update `pageHtml`'s signature and body to take `titleToId` and emit references after the gallery. Change the signature line:

```ts
function pageHtml(page: LorePage, body: string, backlinks: LorePage[], images: PageImage[], titleToId: Map<string, string>): string {
```

and insert after `${renderGallery(images)}`:

```ts
  ${renderReferences(page, titleToId)}
```

Update the call site in `buildHtmlSite`:

```ts
    files[`pages/${page.id}.html`] = pageHtml(page, body, backlinks, imagesByPage.get(page.id) ?? [], titleToId)
```

Add to the `CSS` template string (before the closing backtick), so markers number in the export:

```css
sup[data-citation] { counter-increment: cite; font-size: 0.7em; }
sup[data-citation]::before { content: "[" counter(cite) "]"; }
.page-body { counter-reset: cite; }
.references { clear: both; margin-top: 32px; border-top: 1px solid var(--border); padding-top: 16px; }
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/htmlExport.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/htmlExport.ts src/htmlExport.test.ts
git commit -m "feat: citations in HTML export (markers + References) (#87)"
```

---

### Task 10: Full verification + PR

**Files:** none (verification + integration).

- [ ] **Step 1: Run the full CI gate**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all three pass with no errors.

- [ ] **Step 2: Manual smoke test** (`npm run dev`, http://localhost:5174)

- Insert a page citation and a free-text citation; confirm numbering, References list, marker↔reference scrolling, and edit-existing.
- Rename a cited page from its page; confirm the citing page's marker still resolves (References link points to the renamed page).
- Export HTML (Home → export) and open `pages/<id>.html`; confirm numbered markers and a References section.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/citations-in-pages
gh pr create --title "feat: citations in pages (#87)" --label "version:minor" \
  --body "$(cat <<'EOF'
Closes #87.

Adds in-world source citations to pages: inline superscript markers tied to an
auto-generated References section. Sources are a lore page (with optional locator
+ quote) or free text. Each marker is independent and numbered via a CSS counter.

- `Citation` Tiptap node (data in <sup data-citation> attrs)
- `parseCitations` helper + `References` component
- Cite dialog in the editor (insert + edit existing)
- `renamePage` rewrites citation page-targets
- Citations survive import sanitization; included in HTML export
- Citations are intentionally NOT in backlinks or the graph

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR created with the `version:minor` label (new feature, per CLAUDE.md).

---

## Self-Review notes

- **Spec coverage:** node (T2), numbering/nav (T2/T4/T5/T6), parsing (T1), References (T3), editor insert+edit (T4), rename (T7), sanitizer (T8), HTML export (T9), styles (T6). All spec sections mapped.
- **Type consistency:** `Citation` attrs `target/text/locator/quote` are identical across `citations.ts`, the node, `References`, rename, and export. `onCitationClick(index)` / `onBackref(index)` / `cite-ref-${i}` ids agree across T3–T5.
- **Backlinks/graph:** intentionally untouched (Q6) — no task modifies `linkedTitles`/`getBacklinks`/`graph.ts`.
