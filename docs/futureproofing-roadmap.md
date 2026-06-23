# Futureproofing Roadmap

**Status:** living document

Lore Codex is in good structural shape — clean module boundaries, a sensible Dexie
migration ladder (`db.ts` v1→v5), well-guarded backup/import (`parseBackup()` before
any `clear()`), and current dependencies (React 19 / Vite 8 / TS 6). Futureproofing
here is therefore **less about fixing rot and more about adding the safety rails** that
let the project keep moving fast as worlds get larger and the feature set grows.

This document captures the full plan so any session can pick up where the last left off.
Work the tiers in order — Tier 1 is the highest leverage and unblocks confidence in
everything after it. Check items off (`- [x]`) as they ship and note the PR.

---

## Tier 1 — Safety rails (highest leverage, low effort)

The theme: convert "hope it still works" into "the machine tells me if it doesn't."

### 1. Turn on `strict` TypeScript ✅ *(branch `chore/strict-typescript`)*

**Why:** `tsconfig.app.json` enables `noUnusedLocals`/`noUnusedParameters` but is
**missing `"strict": true`** — so there is no `strictNullChecks` or `noImplicitAny`.
In a data-heavy app where `db.pages.get()` returns `T | undefined` and many infobox
fields are optional, every "possibly undefined" bug is currently invisible to the
compiler. This is the single biggest correctness gap.

**Plan:**
- Add `"strict": true` to `tsconfig.app.json` (and `tsconfig.node.json` for parity).
- Run `npm run build` and fix the fallout once. Expect most errors in `db.ts`,
  `Infobox.tsx`, `PageRoute.tsx`, and anywhere `db.*.get()` / array `.find()` results
  are used without a guard.
- Prefer real null-handling (early returns, defaults) over `!` non-null assertions.

**Done when:** `npm run build` passes with `strict: true`, no new `!` assertions added
except where genuinely provably non-null with a comment.

**Outcome:** `strict: true` added to both `tsconfig.app.json` and `tsconfig.node.json`.
**Zero code fallout** — `npm run build` + `npm run lint` both passed with no changes
needed; the codebase was already written null-safely. (Verified strict is genuinely
active with a throwaway `strictNullChecks` probe.) The gain is forward-looking: future
"possibly undefined" bugs are now caught at compile time.

### 2. Add a test harness — there are currently none ✅ *(branch `chore/strict-typescript`)*

**Why:** CLAUDE.md states "There are no automated tests." The purest, highest-risk
logic is also the easiest to cover, so the payoff is immediate.

**Plan:**
- Add **Vitest** + **happy-dom** (near-zero config with Vite). Add `"test": "vitest"`
  and `"test:run": "vitest run"` to `package.json` scripts.
- First targets, in priority order:
  - `src/calendar.ts` — pure date math, no React/Dexie. Test `dateToAbsolute()` /
    `absoluteToDate()` round-trips, `eraForYear()` boundaries, `yearLength()`, and
    `formatDate()`. **Best possible first suite.**
  - `src/db.ts` helpers: `parseBackup()` (valid + malformed input), `renamePage()`
    reference-rewriting across body anchors + infobox `[[…]]` tokens, `getBacklinks()`
    / `linkedTitles()`, `buildGraphData()` (self-link drop, A↔B collapse, degree).
  - `src/html.ts` (`stripHtml`, `wikiLinkTitles`) and `src/search.ts`.
- Note: Dexie-touching tests need `fake-indexeddb` (add as devDep) or refactor the
  pure helpers to take data as arguments so they need no DB.

**Done when:** `npm run test:run` is green with meaningful coverage of `calendar.ts`
and `parseBackup()` at minimum (the two paths most likely to silently corrupt a world).

**Outcome (shipped):** Vitest 3 + happy-dom + fake-indexeddb installed. Config in
`vitest.config.ts` (kept separate from the pinned `vite.config.ts`); `src/setup-tests.ts`
installs fake-indexeddb so importing `db.ts` works under Node. Scripts `test` (watch) and
`test:run` (CI) added. **32 tests, all green:**
- `src/calendar.test.ts` (23) — `yearLength`, `dateToAbsolute`/`absoluteToDate` incl. a
  −300…300 round-trip identity sweep, negative-year floor division, weekday wrap, empty
  calendar, `eraForYear` boundaries + unsorted input, `formatDate` incl. the 11–13 ordinal
  exception.
- `src/db.test.ts` (9) — `parseBackup` rejection paths (non-JSON, null, no/`non-array`
  pages, bare array) and count accuracy incl. defaulting missing/non-array optional kinds.

**Still open (next test targets, per the plan):** `renamePage()` reference-rewriting,
`getBacklinks()`/`linkedTitles()`, `buildGraphData()`, `html.ts`, `search.ts`. These touch
Dexie data, so they need either seeded fake-indexeddb fixtures or pulling the pure helpers
out to take data as arguments.

### 3. Add CI ✅ *(branch `chore/strict-typescript`)*

**Why:** Work already ships via PRs (#54, #55) but nothing runs `tsc` / `eslint` /
tests automatically, so a type error or lint break can merge to `main`.

**Plan:**
- Add `.github/workflows/ci.yml` running on PR + push to `main`: `npm ci`,
  `npm run lint`, `npm run build`, `npm run test:run`.
- Node 20+ to match local. Cache npm.

**Done when:** the workflow is green on a test PR and required before merge.

**Outcome (shipped):** `.github/workflows/ci.yml` runs on PRs + pushes to `main`:
`npm ci` → `npm run lint` → `npm run build` → `npm run test:run`, on Node 24 (matches the
dev environment) with npm caching. All four gates verified green locally and the lockfile
is in sync so `npm ci` won't drift. **Follow-up:** mark the `verify` check as a required
status check in the GitHub branch-protection settings for `main` (repo admin action).

---

## Tier 2 — Structural (medium effort)

### 4. Split `db.ts` (currently 1,103 lines) ⬜

**Why:** It's a true god-module — types + Dexie schema + CRUD for
pages/maps/pins/templates/calendars/events + backlinks + graph + export/import. It
works, but it's the file *everything* imports and the most likely source of merge
conflicts as features land.

**Plan:**
- Move to a `src/db/` folder with a **barrel `index.ts` that re-exports the existing
  public surface**, so no call sites change (verify with a build + grep for imports).
- Suggested split: `schema.ts` (the `LoreDB` class + version ladder + `db` singleton),
  `types.ts` (interfaces), `pages.ts`, `templates.ts`, `calendar.ts` (CRUD, distinct
  from the pure `src/calendar.ts`), `graph.ts`, `backup.ts` (`exportAll`/`importAll`).
- Do this **after** Tier 1 — strict mode + tests make the refactor safe.

**Done when:** `db.ts` is decomposed, `npm run build` passes, and no module imports
anything but the barrel.

### 5. Version-stamp exports for forward-compatible import ⬜

**Why:** The Dexie *schema* migrations are clean, but `exportAll()` JSON carries **no
`schemaVersion`**. As the schema evolves again, today's backups *and the auto-snapshots*
become ambiguous to import — risking the one thing the whole app exists to protect.

**Plan:**
- Add a `schemaVersion` (and `appVersion`) field to the `exportAll()` payload.
- In `importAll()` / `parseBackup()`, read the version and run a small **migration
  ladder** (no version ⇒ treat as legacy, as today). Keep existing re-seed behaviour
  for older backups lacking templates/calendars.
- Add a test per migration step.

**Done when:** a current export contains a version field and `importAll()` round-trips
both versioned and legacy (unversioned) backups, covered by tests.

---

## Tier 3 — Scale & resilience

### 6. Incremental search / graph indexing ⬜

**Why:** `App.tsx` rebuilds the **entire** FlexSearch index on every `db.pages` change
(`liveQuery` → `buildIndex()`). Fine at ~50 pages; at a 500-page world with frequent
saves it's an O(n) rebuild per edit. Graph rebuild has similar characteristics.

**Plan:** move `src/search.ts` to per-page `index.update()/remove()` driven by Dexie
change deltas rather than a full rebuild. Defer until it actually bites — measure first.

**Done when:** index updates are incremental and a large-world (hundreds of pages) save
is visibly snappy.

### 7. Top-level `ErrorBoundary` + IndexedDB quota/eviction surfacing ⬜

**Why:** Local-first means failures are silent. `requestPersistentStorage()` is already
called (good) — but a render crash currently blanks the whole app with no recovery path,
and storage-quota / eviction errors aren't surfaced.

**Plan:** add a React `ErrorBoundary` at the app root with a recovery action (and a
"download a backup" escape hatch). Catch and surface IndexedDB write failures
(quota exceeded) with a user-visible message.

**Done when:** a thrown render error shows a recovery UI instead of a blank page, and a
simulated quota error is reported to the user.

### 8. Sanitize stored HTML on import ⬜

**Why:** Tiptap HTML is stored as strings and re-rendered via `dangerouslySetInnerHTML`.
Single-user local use is low-risk, but the moment a user imports a **shared** backup,
that HTML is an XSS vector — relevant before any future world-sharing feature.

**Plan:** add a DOMPurify pass on import (and/or render) in `backup.ts` / the render
path. Whitelist the tags Tiptap actually produces (incl. tables, images as data URLs,
`data-wikilink` anchors).

**Done when:** an imported backup containing a `<script>`/`onerror` payload is rendered
inert, covered by a test.

---

## Suggested order of attack

1. **#1 strict mode** → see and fix the null-safety fallout.
2. **#2 Vitest + `calendar.ts` suite** → first green tests.
3. **#3 CI** → lock in #1 and #2 so they can't regress.
4. Then Tier 2 (#4 split `db.ts`, #5 versioned exports), which the safety rails now
   make safe to do aggressively.
5. Tier 3 as the app scales / before world-sharing.

Tier 1 is roughly a weekend and is what "futureproofing" actually means in practice:
the project gets a tripwire so future changes can't silently break the data or the build.
