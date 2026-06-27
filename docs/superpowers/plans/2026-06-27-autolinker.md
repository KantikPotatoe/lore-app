# Autolinker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-detect mentions of known page titles in body text and render them as clickable links at view time, without modifying stored content.

**Architecture:** A pure matching/planning core (`src/autolink.ts`) feeds a Tiptap/ProseMirror decoration plugin (`src/extensions/Autolink.ts`) that wraps the first mention of each known title in a `<span class="wiki-link autolink" data-title>` — view-mode only, never entering `getHTML()`. A global per-world setting toggles it. Manual `[[links]]` always win.

**Tech Stack:** TypeScript (strict), Tiptap (`@tiptap/core`, `@tiptap/pm/state`, `@tiptap/pm/view`), React, Dexie, Vitest.

## Global Constraints

- TS `strict` — no `any`, no unused vars.
- **Render-time only:** autolinks are decorations; stored HTML is never modified; they must not appear in `getHTML()`.
- **First occurrence per page**; **case-insensitive, whole-word**; **longest title wins**; never link the page's own title, text already inside a manual link / `wikiLink` node / `code` mark, or inside `heading` / `codeBlock` blocks.
- **Global toggle** `autolinkEnabled`, default **true**. **Visual only** — no backlinks/graph/broken-link changes.
- Body-only (Infobox uses `WikiText`, not `LoreEditor` — leave untouched).
- Run `npm run lint && npm run build && npm run test:run` before claiming done (CI gate).
- Tiptap import paths in this repo: `Extension` from `@tiptap/core`; `Plugin, PluginKey` from `@tiptap/pm/state`; `Decoration, DecorationSet` from `@tiptap/pm/view`.

---

### Task 1: Pure matching core — `buildTitleMatcher` + `findAutolinkMatches`

**Files:**
- Create: `src/autolink.ts`
- Test: `src/autolink.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface TitleMatcher { regex: RegExp; byLower: Map<string, string> }`
  - `interface AutolinkMatch { from: number; to: number; title: string }`
  - `buildTitleMatcher(titles: string[]): TitleMatcher | null`
  - `findAutolinkMatches(text: string, matcher: TitleMatcher): AutolinkMatch[]`

- [ ] **Step 1: Write the failing test**

Create `src/autolink.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildTitleMatcher, findAutolinkMatches } from './autolink'

describe('buildTitleMatcher', () => {
  it('returns null for an empty or all-whitespace title set', () => {
    expect(buildTitleMatcher([])).toBeNull()
    expect(buildTitleMatcher(['', '   '])).toBeNull()
  })
})

describe('findAutolinkMatches', () => {
  const matcher = (titles: string[]) => buildTitleMatcher(titles)!

  it('matches a known title, case-insensitively, with canonical casing', () => {
    const out = findAutolinkMatches('the iron gate stood', matcher(['Iron']))
    expect(out).toEqual([{ from: 4, to: 8, title: 'Iron' }])
  })

  it('matches whole words only (not inside a larger word)', () => {
    expect(findAutolinkMatches('an Ironclad hull', matcher(['Iron']))).toEqual([])
  })

  it('prefers the longest title on overlap', () => {
    const out = findAutolinkMatches('the Iron Guard fell', matcher(['Iron', 'Iron Guard']))
    expect(out).toEqual([{ from: 4, to: 14, title: 'Iron Guard' }])
  })

  it('returns multiple matches in document order', () => {
    const out = findAutolinkMatches('Arn met Bel', matcher(['Arn', 'Bel']))
    expect(out.map((m) => m.title)).toEqual(['Arn', 'Bel'])
  })

  it('respects Unicode word boundaries for accented titles', () => {
    const out = findAutolinkMatches('met Élan today', matcher(['Élan']))
    expect(out).toEqual([{ from: 4, to: 8, title: 'Élan' }])
  })

  it('escapes regex-special characters in titles', () => {
    const out = findAutolinkMatches('the C.H.U.D. came', matcher(['C.H.U.D.']))
    expect(out).toEqual([{ from: 4, to: 12, title: 'C.H.U.D.' }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/autolink.test.ts`
Expected: FAIL — module `./autolink` not found / functions undefined.

- [ ] **Step 3: Implement `src/autolink.ts` (matcher + finder)**

Create `src/autolink.ts`:

```typescript
// Pure core for the body autolinker. No React/Tiptap, so the title matching and
// first-occurrence planning are unit-testable on their own. The extension in
// src/extensions/Autolink.ts turns the planned ranges into ProseMirror decorations.

/** A compiled matcher over the set of known page titles. */
export interface TitleMatcher {
  /** Global, case-insensitive, Unicode, whole-word; alternatives ordered
   *  longest-first so the longer title wins on overlap. */
  regex: RegExp
  /** Lowercased title -> canonical casing, for resolving a hit back to its page. */
  byLower: Map<string, string>
}

/** A match within a single string: [from, to) offsets and the canonical title. */
export interface AutolinkMatch {
  from: number
  to: number
  title: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Compile known titles into one matcher. Returns null when there is nothing to
 *  match (empty / all-whitespace input). */
export function buildTitleMatcher(titles: string[]): TitleMatcher | null {
  const cleaned = [...new Set(titles.map((t) => t.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length) // longest-first → longest-match-wins
  if (cleaned.length === 0) return null
  const byLower = new Map<string, string>()
  for (const t of cleaned) {
    const lc = t.toLowerCase()
    if (!byLower.has(lc)) byLower.set(lc, t)
  }
  const alt = cleaned.map(escapeRegExp).join('|')
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'giu')
  return { regex, byLower }
}

/** Every whole-word match of a known title in `text`, in order, with offsets. */
export function findAutolinkMatches(text: string, matcher: TitleMatcher): AutolinkMatch[] {
  const out: AutolinkMatch[] = []
  matcher.regex.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = matcher.regex.exec(text)) !== null) {
    const title = matcher.byLower.get(m[0].toLowerCase())
    if (title) out.push({ from: m.index, to: m.index + m[0].length, title })
    if (m.index === matcher.regex.lastIndex) matcher.regex.lastIndex++ // zero-length guard
  }
  return out
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/autolink.test.ts`
Expected: PASS — all matcher/finder tests green.

- [ ] **Step 5: Commit**

```bash
git add src/autolink.ts src/autolink.test.ts
git commit -m "feat: pure title matcher for autolinker (#86)"
```

---

### Task 2: Document-level policy — `planAutolinks`

**Files:**
- Modify: `src/autolink.ts` (append `planAutolinks`)
- Test: `src/autolink.test.ts` (add a `planAutolinks` describe block)

**Interfaces:**
- Consumes: `TitleMatcher`, `AutolinkMatch`, `findAutolinkMatches` from Task 1.
- Produces: `planAutolinks(segments: { text: string; pos: number }[], preSeen: Iterable<string>, matcher: TitleMatcher): AutolinkMatch[]` — first-occurrence-per-title across all segments, skipping any title in `preSeen` (lowercased), with `from`/`to` mapped to absolute doc positions (`seg.pos + offset`).

- [ ] **Step 1: Write the failing test**

Append to `src/autolink.test.ts`:

```typescript
import { planAutolinks } from './autolink'

describe('planAutolinks', () => {
  const matcher = buildTitleMatcher(['Arn', 'Bel'])!

  it('links only the first occurrence of each title', () => {
    const segs = [{ text: 'Arn and Arn and Bel', pos: 1 }]
    const out = planAutolinks(segs, [], matcher)
    expect(out).toEqual([
      { from: 1, to: 4, title: 'Arn' },
      { from: 17, to: 20, title: 'Bel' },
    ])
  })

  it('maps offsets to absolute positions across segments', () => {
    const segs = [
      { text: 'Arn here', pos: 1 },
      { text: 'Bel there', pos: 50 },
    ]
    const out = planAutolinks(segs, [], matcher)
    expect(out).toEqual([
      { from: 1, to: 4, title: 'Arn' },
      { from: 50, to: 53, title: 'Bel' },
    ])
  })

  it('skips titles already seen (manual links / self), case-insensitively', () => {
    const segs = [{ text: 'Arn meets Bel', pos: 1 }]
    const out = planAutolinks(segs, ['arn'], matcher)
    expect(out).toEqual([{ from: 11, to: 14, title: 'Bel' }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/autolink.test.ts`
Expected: FAIL — `planAutolinks` is not exported.

- [ ] **Step 3: Implement `planAutolinks`**

Append to `src/autolink.ts`:

```typescript
/** Plan body autolinks for a whole document. `segments` are the linkable text
 *  runs in document order, each tagged with its absolute start position `pos`.
 *  `preSeen` lists titles already handled (existing wiki links, the page's own
 *  title) so they are never auto-linked. Returns the first unseen match per
 *  title, with absolute [from, to) positions. */
export function planAutolinks(
  segments: { text: string; pos: number }[],
  preSeen: Iterable<string>,
  matcher: TitleMatcher,
): AutolinkMatch[] {
  const seen = new Set<string>()
  for (const t of preSeen) seen.add(t.toLowerCase())
  const out: AutolinkMatch[] = []
  for (const seg of segments) {
    for (const m of findAutolinkMatches(seg.text, matcher)) {
      const lc = m.title.toLowerCase()
      if (seen.has(lc)) continue
      seen.add(lc)
      out.push({ from: seg.pos + m.from, to: seg.pos + m.to, title: m.title })
    }
  }
  return out
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/autolink.test.ts`
Expected: PASS — matcher, finder, and planner tests all green.

- [ ] **Step 5: Commit**

```bash
git add src/autolink.ts src/autolink.test.ts
git commit -m "feat: first-occurrence planning for autolinker (#86)"
```

---

### Task 3: Settings — `autolinkEnabled` boolean

**Files:**
- Modify: `src/settings.ts` (interface, defaults, `updateSettings`)
- Test: `src/settings.test.ts` (add boolean cases)

**Interfaces:**
- Consumes: nothing new.
- Produces: `LoreSettings.autolinkEnabled: boolean` (default `true`); `updateSettings` now passes boolean fields through unchanged while still clamping numbers.

- [ ] **Step 1: Write the failing test**

Add these tests inside the `describe('settings', …)` block in `src/settings.test.ts`, after the existing tests:

```typescript
  it('defaults autolinkEnabled to true', async () => {
    expect((await getSettings()).autolinkEnabled).toBe(true)
  })

  it('round-trips a boolean without clamping it to a number', async () => {
    await updateSettings({ autolinkEnabled: false })
    expect((await getSettings()).autolinkEnabled).toBe(false)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/settings.test.ts`
Expected: FAIL — `autolinkEnabled` is `undefined`; and after `updateSettings({ autolinkEnabled: false })` the value is dropped (current `clamp` rejects non-numbers), so `getSettings` returns the default `true` instead of `false`.

- [ ] **Step 3: Add the field and fix `updateSettings`**

In `src/settings.ts`, add the field to the interface:

```typescript
export interface LoreSettings {
  snapshotChangeThreshold: number
  snapshotTimeHours: number
  snapshotRetention: number
  backupOverdueDays: number
  autolinkEnabled: boolean
}
```

Add the default:

```typescript
export const DEFAULT_SETTINGS: LoreSettings = {
  snapshotChangeThreshold: 50,
  snapshotTimeHours: 24,
  snapshotRetention: 10,
  backupOverdueDays: 7,
  autolinkEnabled: true,
}
```

Replace the body of `updateSettings` so boolean fields pass through and only numbers are clamped:

```typescript
export async function updateSettings(patch: Partial<LoreSettings>): Promise<void> {
  const current = await getSettings()
  const next: LoreSettings = { ...current }
  for (const key of Object.keys(patch) as (keyof LoreSettings)[]) {
    const value = patch[key]
    if (typeof value === 'boolean') {
      next[key] = value as never
    } else {
      const clamped = clamp(value)
      if (clamped !== null) next[key] = clamped as never
    }
  }
  await setMeta(SETTINGS_KEY, next)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/settings.test.ts`
Expected: PASS — including the existing clamp tests (numbers still clamp) and the two new boolean tests.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/settings.test.ts
git commit -m "feat: add autolinkEnabled setting (#86)"
```

---

### Task 4: Tiptap decoration extension — `Autolink`

**Files:**
- Create: `src/extensions/Autolink.ts`

**Interfaces:**
- Consumes: `buildTitleMatcher`, `planAutolinks`, `TitleMatcher` from `src/autolink.ts`.
- Produces:
  - `export const autolinkKey: PluginKey`
  - `export const Autolink` (Tiptap `Extension`). Reads plugin state set via `tr.setMeta(autolinkKey, { enabled: boolean; titles: string[] })`. Emits inline decorations `class="wiki-link autolink"`, `data-title`, `data-wikilink=""` for first-occurrence title mentions, only when enabled and `!editor.isEditable`.

- [ ] **Step 1: Create the extension**

Create `src/extensions/Autolink.ts`:

```typescript
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { buildTitleMatcher, planAutolinks, type TitleMatcher } from '../autolink'

// ---------------------------------------------------------------------------
// Autolink: a view-only ProseMirror decoration plugin. It scans the rendered
// body for mentions of known page titles and wraps the FIRST mention of each as
// a wiki-link span. Decorations never enter getHTML(), so nothing is written to
// storage — renaming/creating a page just re-links every body on next render.
//
// Driven from React via a meta transaction:
//   editor.view.dispatch(tr.setMeta(autolinkKey, { enabled, titles }))
// ---------------------------------------------------------------------------

export const autolinkKey = new PluginKey<AutolinkState>('autolink')

interface AutolinkState {
  enabled: boolean
  matcher: TitleMatcher | null
}

interface AutolinkMeta {
  enabled: boolean
  titles: string[]
}

/** Build the decoration set for the current doc. Skips heading/codeBlock
 *  subtrees and link/code-marked text; pre-seeds existing wikiLink titles so
 *  manual links win and titles aren't double-linked. */
function buildDecorations(doc: PMNode, matcher: TitleMatcher): DecorationSet {
  const segments: { text: string; pos: number }[] = []
  const preSeen: string[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading' || node.type.name === 'codeBlock') return false
    if (node.type.name === 'wikiLink' && node.attrs.title) {
      preSeen.push(String(node.attrs.title))
      return
    }
    if (!node.isText || !node.text) return
    if (node.marks.some((mk) => mk.type.name === 'link' || mk.type.name === 'code')) return
    segments.push({ text: node.text, pos })
  })
  const decorations = planAutolinks(segments, preSeen, matcher).map((m) =>
    Decoration.inline(m.from, m.to, {
      class: 'wiki-link autolink',
      'data-title': m.title,
      'data-wikilink': '',
    }),
  )
  return DecorationSet.create(doc, decorations)
}

export const Autolink = Extension.create({
  name: 'autolink',

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<AutolinkState>({
        key: autolinkKey,
        state: {
          init: () => ({ enabled: false, matcher: null }),
          apply(tr, value) {
            const meta = tr.getMeta(autolinkKey) as AutolinkMeta | undefined
            if (!meta) return value
            return {
              enabled: meta.enabled,
              matcher: meta.titles.length ? buildTitleMatcher(meta.titles) : null,
            }
          },
        },
        props: {
          decorations(state) {
            const ps = autolinkKey.getState(state)
            if (!ps || !ps.enabled || !ps.matcher || editor.isEditable) return null
            return buildDecorations(state.doc, ps.matcher)
          },
        },
      }),
    ]
  },
})
```

- [ ] **Step 2: Verify it type-checks and the suite still passes**

Run: `npm run build && npm run test:run`
Expected: build succeeds (no TS errors in the new file); all existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/extensions/Autolink.ts
git commit -m "feat: Autolink decoration extension (#86)"
```

---

### Task 5: Wire the extension into the editor

**Files:**
- Modify: `src/components/LoreEditor.tsx`

**Interfaces:**
- Consumes: `Autolink`, `autolinkKey` from `src/extensions/Autolink.ts`.
- Produces: `LoreEditor` accepts `autolinkTitles?: string[]` and `autolinkEnabled?: boolean`; broadened click/hover selectors recognise autolink `<span>`s.

- [ ] **Step 1: Import the extension**

In `src/components/LoreEditor.tsx`, add to the imports near the other extension imports (the file already imports `WikiLink` from `'../extensions/WikiLink'`):

```typescript
import { Autolink, autolinkKey } from '../extensions/Autolink'
```

- [ ] **Step 2: Add the two new props**

In the `Props` interface (currently ends with `knownTitles?: Set<string>`), add:

```typescript
  /** Canonical page titles (excluding the current page) for body autolinking. */
  autolinkTitles?: string[]
  /** Whether the autolinker is enabled for this world. */
  autolinkEnabled?: boolean
```

And destructure them in the component signature:

```typescript
export default function LoreEditor({ content, editable, onChange, onWikiClick, knownTitles, autolinkTitles, autolinkEnabled }: Props) {
```

- [ ] **Step 3: Register the extension**

In the `useEditor({ extensions: [ … ] })` array, add `Autolink` right after `WikiLink`:

```typescript
      WikiLink,
      Autolink,
```

- [ ] **Step 4: Dispatch the autolink config**

Add this effect alongside the other `useEffect`s (e.g. just after the `editor?.setEditable(editable)` effect):

```typescript
  // Feed the autolinker its title set + on/off state. Disabled while editing so
  // authoring sees plain text; the plugin also self-gates on editor.isEditable.
  useEffect(() => {
    if (!editor) return
    editor.view.dispatch(
      editor.state.tr.setMeta(autolinkKey, {
        enabled: !!autolinkEnabled && !editable,
        titles: autolinkTitles ?? [],
      }),
    )
  }, [editor, autolinkEnabled, autolinkTitles, editable])
```

- [ ] **Step 5: Broaden the click and hover selectors**

In `handleClick`, change the wiki selector so it also matches autolink `<span>`s:

```typescript
    const wiki = el.closest('.wiki-link')
```

In the `onMouseOver` and `onMouseOut` handlers on the `EditorContent` wrapper, change both `closest('a[data-wikilink]')` calls to:

```typescript
          const anchor = (e.target as Element).closest('[data-wikilink]')
```

(There are two occurrences — one in `onMouseOver`, one in `onMouseOut`. Update both.)

- [ ] **Step 6: Verify build + suite**

Run: `npm run lint && npm run build && npm run test:run`
Expected: lint clean, build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/LoreEditor.tsx
git commit -m "feat: wire Autolink extension into LoreEditor (#86)"
```

---

### Task 6: Supply titles + toggle from PageRoute; settings UI; CSS

**Files:**
- Modify: `src/routes/PageRoute.tsx`
- Modify: `src/routes/SettingsRoute.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `LoreEditor`'s `autolinkTitles` / `autolinkEnabled` props (Task 5); `getSettings` (Task 3).
- Produces: end-to-end working autolinker with a settings toggle and view-mode styling.

- [ ] **Step 1: Provide autolink data in PageRoute**

In `src/routes/PageRoute.tsx`, add `getSettings` to the `'../settings'`/`'../db'` imports. `getSettings` lives in `src/settings.ts`, so add at top:

```typescript
import { getSettings } from '../settings'
```

After the existing `knownTitles` live query (around line 33), add:

```typescript
  // Canonical titles of every OTHER page — the autolinker's vocabulary. Excluding
  // this page's own title is the self-link skip.
  const autolinkTitles = useLiveQuery(
    async () => (await db.pages.toArray()).filter((p) => p.id !== id).map((p) => p.title),
    [id],
  )
  // Global per-world toggle (default on when settings haven't loaded yet).
  const settings = useLiveQuery(() => getSettings(), [])
  const autolinkEnabled = settings?.autolinkEnabled ?? true
```

Then pass them to the body `<LoreEditor>` (the one rendered in `.page-main`, currently passing `knownTitles={knownTitles}`):

```typescript
          <LoreEditor
            key={id}
            content={page.content}
            editable={editing}
            onChange={(html) => updatePage(id, { content: html })}
            onWikiClick={followWikiLink}
            knownTitles={knownTitles}
            autolinkTitles={autolinkTitles}
            autolinkEnabled={autolinkEnabled}
          />
```

- [ ] **Step 2: Add the settings toggle**

In `src/routes/SettingsRoute.tsx`, add a new section. Place it right after the `Auto-snapshots` `</section>` and before the `Backup & data` section:

```tsx
      {/* Linking */}
      <section className="home-section">
        <h2>Linking</h2>
        <label className="settings-field settings-field-check">
          <input
            type="checkbox"
            checked={s.autolinkEnabled}
            onChange={(e) => setField({ autolinkEnabled: e.target.checked })}
          />
          <span>Auto-link page titles in body text</span>
        </label>
        <p className="empty-hint">
          Links the first mention of another page's title in each page's body. Your own
          [[links]] always take precedence.
        </p>
      </section>
```

(`s`, `setField`, and the draft persistence already exist in this component and handle the boolean via the Task 3 `updateSettings` fix.)

- [ ] **Step 3: Add the autolink styling**

In `src/index.css`, add immediately after the `.wiki-link.is-broken:hover { … }` rule (around line 452):

```css
.wiki-link.autolink { border-bottom-color: transparent; }
.wiki-link.autolink:hover { border-bottom-color: var(--accent-soft); }
.settings-field-check { flex-direction: row; align-items: center; gap: 8px; }
```

- [ ] **Step 4: Verify build + full suite**

Run: `npm run lint && npm run build && npm run test:run`
Expected: lint clean, build succeeds, all tests pass.

- [ ] **Step 5: Manual smoke check**

Run `npm run dev`. With two pages where page A's body mentions page B's title in prose:
- In **view** mode, the first mention of B in A is an underline-on-hover link that navigates to B; later mentions stay plain; a manual `[[B]]` is not doubled; mentions in headings/code are not linked; A's own title is not linked.
- In **edit** mode, the body shows plain text (no autolinks).
- Toggle the setting off in Settings → the autolinks disappear on next view.

- [ ] **Step 6: Commit**

```bash
git add src/routes/PageRoute.tsx src/routes/SettingsRoute.tsx src/index.css
git commit -m "feat: enable autolinker in pages + settings toggle (#86)"
```

---

## Self-Review

**Spec coverage:**
- Render-time decorations, never in `getHTML()` → Tasks 4 (plugin, view-only) + 5 (wiring).
- First occurrence / longest-wins / whole-word / case-insensitive / Unicode boundaries / regex-escape → Tasks 1–2 (+ tests).
- Skip self / manual links / wikiLink nodes / code marks / heading & codeBlock → Task 4 `buildDecorations` (preSeen + subtree skip + mark skip) and Task 6 Step 1 (self via title exclusion); tested in Task 2 (`preSeen`).
- Global toggle, default true, boolean passthrough → Task 3 (+ tests); UI in Task 6 Step 2.
- Visual-only (no backlinks/graph/broken changes) → no task touches those modules; decorations are out of `getHTML()`.
- Underline-on-hover distinction → Task 6 Step 3.
- Body-only → only the `.page-main` `LoreEditor` gets the props; Infobox/`WikiText` untouched.

**Placeholder scan:** No TBD/TODO; every code step shows complete code and exact commands.

**Type consistency:** `TitleMatcher` / `AutolinkMatch` / `planAutolinks(segments, preSeen, matcher)` signatures match across Tasks 1, 2, and 4. The meta shape `{ enabled, titles }` set in Task 5 matches `AutolinkMeta` consumed in Task 4. `autolinkTitles?: string[]` / `autolinkEnabled?: boolean` props defined in Task 5 match the values passed in Task 6. `autolinkEnabled: boolean` field defined in Task 3 matches its reads in Tasks 5–6.
