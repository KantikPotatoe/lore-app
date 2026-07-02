# Manuscript Authoring — Phase 6: EPUB / PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile a book into a shareable file — a valid-enough EPUB (JSZip) and a print-to-PDF path — reachable from the book workspace.

**Architecture:** `src/manuscriptExport.ts` mirrors `htmlExport.ts`: pure builders (`buildEpub`, `compileBookHtml`) return path→content maps / an HTML string so the compile logic is unit-tested; thin `exportBookEpub`/`printBook` wrappers do the DB reads + download/print side effects. `BookRoute` gets Compile buttons.

**Tech Stack:** TypeScript strict, JSZip (already a dependency), Vitest + @testing-library/react + happy-dom.

**Spec:** `docs/superpowers/specs/2026-07-02-manuscript-authoring-design.md`
**Depends on:** Phases 1–5. Branch `feat/manuscript-export` (stacked).

## Global Constraints

- TypeScript `strict`; no `any`. `new Date()` is allowed here (event-triggered async, not React render — same as `htmlExport.ts`).
- Reuse `sanitizeHtml` for scene bodies and an `escapeHtml` helper for plain-text fields (titles), mirroring `htmlExport.ts`.
- EPUB `mimetype` entry must be the first file and stored uncompressed.
- Run `npm run lint`, `npm run build`, `npm run test:run` green before done.

---

### Task 1: Pure compile builders (`buildEpub`, `compileBookHtml`)

**Files:**
- Create: `src/manuscriptExport.ts`
- Test: `src/manuscriptExport.test.ts`

**Interfaces:**
- Consumes: `sanitizeHtml` from `./sanitize`; `Book`, `Chapter`, `Scene` types from `./db`.
- Produces:
  ```ts
  export function toXhtml(html: string): string           // sanitized + void-elements self-closed
  export function compileBookHtml(book: Book, chapters: Chapter[], scenes: Scene[]): string
  export function buildEpub(book: Book, chapters: Chapter[], scenes: Scene[]): Record<string, string>
  ```
  `buildEpub` keys: `mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/nav.xhtml`, one `OEBPS/chapter-<n>.xhtml` per chapter (in order). Chapters ordered by `order`; scenes grouped by `chapterId`, ordered by `order`.

- [ ] **Step 1: Write the failing test**

Create `src/manuscriptExport.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildEpub, compileBookHtml, toXhtml } from './manuscriptExport'
import type { Book, Chapter, Scene } from './db'

const book: Book = { id: 'b1', title: 'My Novel', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 }
const chapters: Chapter[] = [
  { id: 'c1', bookId: 'b1', title: 'Chapter One', order: 0, createdAt: 1, updatedAt: 1 },
  { id: 'c2', bookId: 'b1', title: 'Chapter Two', order: 1, createdAt: 1, updatedAt: 1 },
]
const scene = (id: string, chapterId: string, order: number, content: string): Scene => ({
  id, bookId: 'b1', chapterId, title: id, content, synopsis: '', notes: '',
  status: 'draft', order, wordCount: 0, povPageId: null, castPageIds: [], locationPageIds: [],
  createdAt: 1, updatedAt: 1,
})
const scenes: Scene[] = [
  scene('s1', 'c1', 0, '<p>Opening line.</p>'),
  scene('s2', 'c2', 0, '<p>Second chapter.</p>'),
]

describe('toXhtml', () => {
  it('self-closes void elements and strips scripts', () => {
    expect(toXhtml('<p>a<br>b</p><script>x</script>')).toContain('<br />')
    expect(toXhtml('<p>a<br>b</p><script>x</script>')).not.toContain('<script>')
  })
})

describe('compileBookHtml', () => {
  it('includes the book title, chapters and scene prose in order', () => {
    const html = compileBookHtml(book, chapters, scenes)
    expect(html).toContain('My Novel')
    expect(html.indexOf('Chapter One')).toBeLessThan(html.indexOf('Chapter Two'))
    expect(html).toContain('Opening line.')
  })
})

describe('buildEpub', () => {
  it('emits the required EPUB files with mimetype first', () => {
    const files = buildEpub(book, chapters, scenes)
    expect(Object.keys(files)[0]).toBe('mimetype')
    expect(files['mimetype']).toBe('application/epub+zip')
    expect(files['META-INF/container.xml']).toContain('content.opf')
    expect(files['OEBPS/content.opf']).toContain('My Novel')
    expect(files['OEBPS/nav.xhtml']).toContain('Chapter One')
    expect(files['OEBPS/chapter-0.xhtml']).toContain('Opening line.')
    expect(files['OEBPS/chapter-1.xhtml']).toContain('Second chapter.')
  })

  it('orders the spine by chapter order', () => {
    const opf = buildEpub(book, chapters, scenes)['OEBPS/content.opf']
    expect(opf.indexOf('chapter-0')).toBeLessThan(opf.indexOf('chapter-1'))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/manuscriptExport.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

Create `src/manuscriptExport.ts`:

```ts
import { sanitizeHtml } from './sanitize'
import type { Book, Chapter, Scene } from './db'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Sanitize body HTML and self-close the void elements Tiptap emits, so the
 *  result is XHTML-friendly for EPUB readers. Not a full XML validator — good
 *  enough for common readers; the print path is the fidelity fallback. */
export function toXhtml(html: string): string {
  return sanitizeHtml(html).replace(/<(br|hr|img)((?:[^>]*?))\s*\/?>/g, '<$1$2 />')
}

function scenesFor(chapterId: string, scenes: Scene[]): Scene[] {
  return scenes.filter((s) => s.chapterId === chapterId).sort((a, b) => a.order - b.order)
}

function orderedChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => a.order - b.order)
}

function chapterBody(chapter: Chapter, scenes: Scene[]): string {
  const body = scenesFor(chapter.id, scenes)
    .map((s) => toXhtml(s.content))
    .join('\n')
  return `<h1>${escapeHtml(chapter.title)}</h1>\n${body}`
}

function chapterXhtml(chapter: Chapter, scenes: Scene[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head><meta charset="UTF-8" /><title>${escapeHtml(chapter.title)}</title></head>
<body>
${chapterBody(chapter, scenes)}
</body>
</html>`
}

/** A single self-contained HTML document for browser print / Save-as-PDF. */
export function compileBookHtml(book: Book, chapters: Chapter[], scenes: Scene[]): string {
  const chaptersHtml = orderedChapters(chapters)
    .map((c) => `<section class="chapter">${chapterBody(c, scenes)}</section>`)
    .join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(book.title)}</title>
<style>
  @media print { .chapter { page-break-before: always; } .chapter:first-child { page-break-before: avoid; } }
  body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.6rem; margin-top: 2rem; }
</style>
</head>
<body>
<h1 class="book-title">${escapeHtml(book.title)}</h1>
${chaptersHtml}
</body>
</html>`
}

/** Build the EPUB as a path→content map (no DB, no download) so the structure is
 *  unit-testable. `mimetype` MUST be emitted (and later zipped) first & stored. */
export function buildEpub(book: Book, chapters: Chapter[], scenes: Scene[]): Record<string, string> {
  const ordered = orderedChapters(chapters)
  const files: Record<string, string> = {}
  files['mimetype'] = 'application/epub+zip'
  files['META-INF/container.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" /></rootfiles>
</container>`

  ordered.forEach((c, i) => {
    files[`OEBPS/chapter-${i}.xhtml`] = chapterXhtml(c, scenes)
  })

  const manifestItems = ordered
    .map((_, i) => `<item id="chapter-${i}" href="chapter-${i}.xhtml" media-type="application/xhtml+xml" />`)
    .join('\n    ')
  const spineItems = ordered.map((_, i) => `<itemref idref="chapter-${i}" />`).join('\n    ')

  files['OEBPS/content.opf'] = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${book.id}</dc:identifier>
    <dc:title>${escapeHtml(book.title)}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`

  const navItems = ordered
    .map((c, i) => `<li><a href="chapter-${i}.xhtml">${escapeHtml(c.title)}</a></li>`)
    .join('\n      ')
  files['OEBPS/nav.xhtml'] = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head><meta charset="UTF-8" /><title>${escapeHtml(book.title)}</title></head>
<body>
  <nav epub:type="toc"><ol>
      ${navItems}
  </ol></nav>
</body>
</html>`

  return files
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/manuscriptExport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/manuscriptExport.ts src/manuscriptExport.test.ts
git commit -m "feat(manuscript): pure EPUB + print-HTML compile builders"
```

---

### Task 2: DB + download/print wrappers

**Files:**
- Modify: `src/manuscriptExport.ts`

**Interfaces:**
- Consumes: `db` from `./db`; JSZip; `buildEpub`, `compileBookHtml`.
- Produces:
  ```ts
  export async function exportBookEpub(bookId: string): Promise<void>
  export async function printBook(bookId: string): Promise<void>
  ```
  Side-effect wrappers (not unit-tested, like `exportAsHtml`): read the book/chapters/scenes, then download `.epub` (mimetype stored first) or open a print window.

- [ ] **Step 1: Implement (no separate test — logic lives in the tested pure builders)**

Add to `src/manuscriptExport.ts` (extend the top import with `db` + JSZip):

```ts
import JSZip from 'jszip'
import { db } from './db'
```

Append:

```ts
async function loadBook(bookId: string) {
  const [book, chapters, scenes] = await Promise.all([
    db.books.get(bookId),
    db.chapters.where('bookId').equals(bookId).toArray(),
    db.scenes.where('bookId').equals(bookId).toArray(),
  ])
  return { book, chapters, scenes }
}

export async function exportBookEpub(bookId: string): Promise<void> {
  const { book, chapters, scenes } = await loadBook(bookId)
  if (!book) return
  const files = buildEpub(book, chapters, scenes)

  const zip = new JSZip()
  // mimetype first and stored (uncompressed), per the EPUB OCF spec.
  zip.file('mimetype', files['mimetype'], { compression: 'STORE' })
  for (const [path, content] of Object.entries(files)) {
    if (path === 'mimetype') continue
    zip.file(path, content)
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${book.title.replace(/[^\w.-]+/g, '_') || 'book'}.epub`
  a.click()
  URL.revokeObjectURL(url)
}

export async function printBook(bookId: string): Promise<void> {
  const { book, chapters, scenes } = await loadBook(bookId)
  if (!book) return
  const html = compileBookHtml(book, chapters, scenes)
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc -b` — Expected: no errors.
Run: `npx eslint src/manuscriptExport.ts` — Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/manuscriptExport.ts
git commit -m "feat(manuscript): exportBookEpub + printBook wrappers"
```

---

### Task 3: Compile buttons in the book workspace + green gate

**Files:**
- Modify: `src/routes/BookRoute.tsx` (header actions)
- Modify: `src/index.css` (append `.book-compile` rules)
- Test: `src/routes/BookRoute.test.tsx` (extend)

**Interfaces:**
- Consumes: `exportBookEpub`, `printBook`.
- Produces: an "EPUB" and a "Print / PDF" button in `.book-head`.

- [ ] **Step 1: Write the failing test**

Append to `src/routes/BookRoute.test.tsx`:

```tsx
it('shows compile buttons (EPUB + Print)', async () => {
  await db.books.add({ id: 'b1', title: 'My Novel', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 })
  renderAt('/book/b1')
  expect(await screen.findByRole('button', { name: /epub/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: /print|pdf/i })).toBeTruthy()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/routes/BookRoute.test.tsx`
Expected: FAIL — no EPUB/Print buttons.

- [ ] **Step 3: Implement**

In `src/routes/BookRoute.tsx`, add the import:

```ts
import { exportBookEpub, printBook } from '../manuscriptExport'
```

Add a compile cluster in `.book-head`, after the `.seg-control` div:

```tsx
        <div className="book-compile">
          <button className="ghost-btn" onClick={() => exportBookEpub(bookId)}>EPUB</button>
          <button className="ghost-btn" onClick={() => printBook(bookId)}>Print / PDF</button>
        </div>
```

- [ ] **Step 4: Add styles**

Append to `src/index.css`:

```css
.book-compile {
  display: inline-flex;
  gap: 0.4rem;
  margin-left: auto;
}
```

- [ ] **Step 5: Green gate**

Run: `npm run lint` → clean · `npm run build` → succeeds · `npm run test:run` → all pass.

- [ ] **Step 6: Commit**

```bash
git add src/routes/BookRoute.tsx src/routes/BookRoute.test.tsx src/index.css
git commit -m "feat(manuscript): Compile (EPUB / Print-PDF) buttons in book workspace; phase 6 green"
```

---

## Self-Review

**Spec coverage (Phase 6):**
- EPUB via JSZip (mimetype-first, container/opf/nav/chapters) → Tasks 1, 2. ✓
- Scene HTML sanitized into EPUB-safe XHTML; wiki-links flattened by `sanitizeHtml` keeping anchor text → Task 1 (`toXhtml`). ✓
- Print-to-PDF via a compiled HTML doc + `window.print()` → Tasks 1, 2. ✓
- Compile action in the book workspace → Task 3. ✓

**Flagged limitation:** the EPUB is reader-friendly but not guaranteed to pass strict `epubcheck` (Tiptap HTML isn't fully XML-normalized beyond void-element self-closing). The print/PDF path is the fidelity fallback; a stricter XHTML normalizer or a `pdf-lib` true-PDF is a noted follow-up, not built now.

**Placeholder scan:** none. Pure builders fully coded; wrappers fully coded; Task 3 CSS is a one-rule addition shown inline.

**Type consistency:** `buildEpub`/`compileBookHtml` take `(Book, Chapter[], Scene[])`; `loadBook` returns exactly those from Dexie; `exportBookEpub`/`printBook` take `bookId` matching the `BookRoute` param. `mimetype` is emitted first in `buildEpub` and zipped first (STORE) in `exportBookEpub`. ✓
