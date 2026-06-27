# `@` as a Second Wiki-Link Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authors type `@Name` (in addition to `[[Name]]`) to open the existing wiki-link autocomplete and insert the same `wikiLink` node.

**Architecture:** The autocomplete pipeline (`computeSuggest` → `acceptSuggestion` in `LoreEditor.tsx`) is already trigger-agnostic — it deletes a `[from, to]` range and inserts a node. Only the pure detection helper `findOpenWikiQuery` in `src/wikiAutocomplete.ts` knows about `[[`. We generalize that one function to also recognize an open `@query`, returning the identical `{ query, matchLength }` shape. No storage, backlinks, or InputRule changes.

**Tech Stack:** TypeScript (strict), Vitest, React, Tiptap.

## Global Constraints

- TS `strict` — no `any`, no unused vars.
- `[[…]]` stays the canonical stored/typed form. `@` is input ergonomics only — no migration, no new InputRule, no change to backlinks / `html.ts` / import sanitize.
- Run `npm run lint`, `npm run build`, and `npm run test:run` before claiming done (CI runs all three).
- `@` rule must fire only at a word boundary (line start or after whitespace) and stop the query at the next whitespace.

---

### Task 1: `@` trigger detection in `findOpenWikiQuery`

**Files:**
- Modify: `src/wikiAutocomplete.ts` (the `findOpenWikiQuery` function, lines 4-13)
- Test: `src/wikiAutocomplete.test.ts` (extend the `findOpenWikiQuery` describe block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `findOpenWikiQuery(textBefore: string): { query: string; matchLength: number } | null` — unchanged signature. Now returns a match for an open `@query` as well as an open `[[query`. For `@`, `matchLength = query.length + 1` (the `@` plus the query), so the caller's `from = to - matchLength` lands on the `@`.

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `describe('findOpenWikiQuery', ...)` block in `src/wikiAutocomplete.test.ts`, after the last `[[` test (the "uses only the most recent open bracket" case):

```typescript
  it('detects an open @ at the start of the text', () => {
    expect(findOpenWikiQuery('@Gand')).toEqual({ query: 'Gand', matchLength: 5 })
  })

  it('detects an open @ after whitespace', () => {
    expect(findOpenWikiQuery('see @Gand')).toEqual({ query: 'Gand', matchLength: 5 })
  })

  it('detects an open @ with nothing typed yet', () => {
    expect(findOpenWikiQuery('intro @')).toEqual({ query: '', matchLength: 1 })
  })

  it('does not trigger @ mid-word (e.g. emails)', () => {
    expect(findOpenWikiQuery('mail foo@bar')).toBeNull()
  })

  it('ends the @ query at the next whitespace', () => {
    expect(findOpenWikiQuery('@Iron Gu')).toBeNull()
  })

  it('lets [[ take precedence over an inner @', () => {
    expect(findOpenWikiQuery('[[@foo')).toEqual({ query: '@foo', matchLength: 6 })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/wikiAutocomplete.test.ts`
Expected: FAIL — the new `@` cases fail (e.g. `'@Gand'` currently returns `null` instead of `{ query: 'Gand', matchLength: 5 }`).

- [ ] **Step 3: Implement the `@` branch**

In `src/wikiAutocomplete.ts`, replace the body of `findOpenWikiQuery` (currently the `[[`-only version) with the version below. Keep the existing doc comment but extend it to mention `@`:

```typescript
/** If the text immediately before the cursor has an open wiki-link trigger,
 *  return the partial query typed after it and the length of the matched slice
 *  (so the caller can map it back to a document range). Two triggers are
 *  recognized:
 *    - `[[query`  — an unclosed `[[` with no intervening `[` or `]`.
 *    - `@query`   — an `@` at a word boundary (line start or after whitespace),
 *                   query running until the next whitespace.
 *  `[[` is checked first, so `[[@foo` reads as a `[[` query. Returns null when
 *  there's no open trigger — e.g. brackets already closed (`[[Name]]`), or an
 *  `@` mid-word (`foo@bar`). */
export function findOpenWikiQuery(textBefore: string): { query: string; matchLength: number } | null {
  const brackets = /\[\[([^[\]]*)$/.exec(textBefore)
  if (brackets) return { query: brackets[1], matchLength: brackets[0].length }
  const at = /(?:^|\s)@([^\s@]*)$/.exec(textBefore)
  if (at) return { query: at[1], matchLength: at[1].length + 1 }
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/wikiAutocomplete.test.ts`
Expected: PASS — all `findOpenWikiQuery` and `rankWikiTitles` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/wikiAutocomplete.ts src/wikiAutocomplete.test.ts
git commit -m "feat: detect @ as a second wiki-link autocomplete trigger (#85)"
```

---

### Task 2: Update the editor toolbar hint

**Files:**
- Modify: `src/components/LoreEditor.tsx:292` (the `tb-hint` span)

**Interfaces:**
- Consumes: `findOpenWikiQuery` from Task 1 (already wired via `computeSuggest`/`acceptSuggestion` — no code change needed there).
- Produces: nothing for later tasks. UI copy only.

- [ ] **Step 1: Update the hint copy**

In `src/components/LoreEditor.tsx`, find the hint span (around line 292):

```tsx
          <span className="tb-hint">Type [[Name]] to link a page</span>
```

Replace it with:

```tsx
          <span className="tb-hint">Type [[Name]] or @Name to link a page</span>
```

- [ ] **Step 2: Verify the build and full test suite**

Run: `npm run lint && npm run build && npm run test:run`
Expected: lint clean, build succeeds, all tests pass.

- [ ] **Step 3: Manual smoke check (optional)**

Run `npm run dev`, open a page in edit mode, type `@` followed by a few letters of an existing page title. Expected: the same autocomplete menu appears; Enter/Tab/click inserts a `wiki-link` node identical to the `[[`-typed one. Typing a space without accepting dismisses the menu.

- [ ] **Step 4: Commit**

```bash
git add src/components/LoreEditor.tsx
git commit -m "docs: mention @Name in the editor link hint (#85)"
```

---

## Self-Review

**Spec coverage:**
- Spec §1 (`findOpenWikiQuery` `@` rule, word boundary, whitespace stop, `[[` precedence, empty `@`) → Task 1 (regex + all six tests).
- Spec §2 (no new InputRule) → honored; no InputRule task exists, `WikiLink.ts` untouched.
- Spec §3 (`LoreEditor.tsx` no logic change; optional hint polish) → Task 2 (copy only).
- Spec "Testing" bullets → Task 1 Step 1 covers boundary fire, mid-word non-fire, whitespace stop, empty `@`, `matchLength` (`@Gand` → 5), `[[` preserved (existing tests + `[[@foo`).
- Spec "Out of scope" → nothing in the plan touches storage, backlinks, graph, hover, or import.

**Placeholder scan:** No TBD/TODO; every code step shows complete code and exact commands.

**Type consistency:** `findOpenWikiQuery` signature and the `{ query, matchLength }` return shape are identical to the current code and used unchanged by `computeSuggest`. `matchLength = at[1].length + 1` matches the `@Gand → 5` test assertion.
