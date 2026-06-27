# Lore Codex — Improvement Roadmap

A living list of ideas, grouped by theme and tagged by effort. This is a
planning doc, not a commitment — items move up/down as priorities shift.

**Effort key:** 🟢 small (hours) · 🟡 medium (a day or few) · 🔴 large (multi-session feature)
**Status key:** `parked` = deliberately deferred · `blocked` = waiting on the desktop-app move

---

## Suggested sequencing

1. **Quick win to build momentum** → Clickable tags (🟢).
2. **The link-system arc** (highest leverage, do in order):
   Flavor/alias links → `@` input trigger → Autolinker.
3. Pick from medium features as appetite allows.

---

## Pages & wiki text

### Quick wins
- 🟢 **Clickable tags** — tags are already stored on pages; add a filtered
  route (`/tag/:tag` or reuse browse) so clicking a tag lists its pages.
- 🟢 **TOC includes H1** — `TableOfContents.tsx` currently scans only `h2`/`h3`.
  Trivial to add level 1 *if* article bodies actually use H1 (the page **title**
  is a separate field, so H2+ may be the right convention). _Decide first._
- 🟢 **Rework default infobox fields** — curate `BUILTIN_TEMPLATES`: better
  starter rows, ensure each page type has the right fields. Mostly content work.
- 🟢→🟡 **Infobox updates in real time** — reads go through `useLiveQuery`, so
  this *should* already be reactive. Likely a local edit-state staleness bug,
  not a feature. Needs a quick repro to pin down the actual cause.

### The link-system arc (do in order — each builds on the last)
- 🟡 **Flavor / alias links** *(foundation)* — link to a page but show different
  text, e.g. "The stranger" → `Odrian Borinor`. Add a `display` attribute to the
  `WikiLink` node + `[[Target|shown text]]` syntax. _Originally item #29._
- 🟢 **`@` as a second link trigger** — **do not replace** `[[]]`; it's the
  stored canonical form in many places (infobox ref tokens, `renderText`,
  backlinks scan, `html.ts`, autocomplete, import sanitize). Just add `@`-typing
  as an extra input rule that produces the *same* node. Ergonomics, no migration.
  _Originally item #2._
- 🔴 **Autolinker** — auto-detect known page titles in body text and wrap them as
  links (cf. World Anvil's autolinker). Depends on alias links for overrides/skips.
  _Originally item #35._

### Document / codex features
> A **Document** page type already exists (`builtin-document`). These items make
> documents richer rather than adding the primitive.
- 🟡 **Citations in pages** — _#6._
- 🟡 **Linked documents on pages** — attach/relate documents to a page. _#7._
- 🔴 **Manuscripts** — in-world books/long-form documents. _#34, parked._

### Structure
- 🟡 **Optional default sections** — addable starter sections per page type
  (e.g. Profile / Background / Appearance on Characters). Extends the templates
  system. _#4._

---

## Maps
- 🔴 `blocked` **Maps resolution** — quality is limited by browser-storage
  compression; revisit once data lives on disk in the desktop app. _#13._
- 🟡 **Pins inside regions** — currently can't add a pin within a region. _#14._
- 🟡 **Preview-before-edit** — clicking a pin/region should show a preview card
  (reuse the `WikiLinkPopover` pattern) with an explicit "Edit" action, instead
  of jumping straight into edit mode. _#15._

---

## Graph
> The graph feature will likely be reworked wholesale, so treat these as inputs
> to that rework rather than standalone tasks.
- 🟡 `parked` **Infobox image inside nodes** — render the page's infobox image in
  its graph circle for recognizability. _#19._
- 🔴 `parked` **Graph rework** — broader redesign. _#20._

---

## Timeline
- 🟡 **Readability pass** — especially the axis view: too small, hard to
  navigate, text can be tiny. Improve zoom/pan ergonomics and typographic scale
  in `TimelineHorizontal`. _#25._

---

## Big / later (parked)
Deliberately deferred — large features or post-desktop-app ideas.
- 🔴 **Spoilers** — hide spoiler info (e.g. a character's alive/dead Status field)
  until revealed. _#30._
- 🔴 **Secrets / reader-advancement gating** — show different info depending on how
  far a reader has progressed through the books. _#31, "much later."_
- 🔴 **Family trees** — _#32._
- 🔴 **Diplomacy webs** — relationship/diplomacy graphs between factions. _#33._
