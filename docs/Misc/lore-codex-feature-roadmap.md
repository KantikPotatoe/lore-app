# Lore Codex — Feature Roadmap

A build-ordered checklist of worldbuilding features, drawn from LegendKeeper, Fantasia Archive, World Anvil, Campfire, and LoreForge, filtered for a desktop app built on **Electron + React + JSON file storage**.

Effort tags reflect this specific stack:
- 🟢 easy — fits JSON-file storage directly, mostly UI work
- 🟡 medium — needs a library or non-trivial logic
- 🔴 hard — heavy lift, architectural cost, or conflicts with the local-first model

The phases assume a solo developer who can read and tweak code. Each phase should be shippable on its own.

---

## Phase 1 — MVP (the foundation)

The smallest version that is genuinely usable for worldbuilding. Everything here is 🟢 and plays to the local-first / JSON strengths.

- [ ] Predefined entry types: Characters, Locations, Items, Organizations, Events 🟢
- [ ] Structured fields per type (templates with prompt fields) 🟢
- [ ] Rich-text editor for entry bodies 🟡 — use TipTap or Lexical
- [ ] Hierarchical tree / folders / categories for navigation 🟢
- [ ] Tags on entries 🟢
- [ ] Full-text search and filtering across entries 🟢 — fuse.js over the JSON index
- [ ] Offline-first, fully local data (already in place) 🟢
- [ ] Import / export JSON 🟢
- [ ] Unlimited entries and projects, no asset cap 🟢

## Phase 2 — v1 (the differentiators)

Features that make Lore Codex competitive and lean on what offline JSON does well. The auto-create and backlink behaviors are cheap to build and are a real selling point versus heavier tools.

- [ ] Cross-linking between entries via @-mentions 🟡
- [ ] Auto-create a referenced entry if it doesn't exist yet 🟢 — Fantasia Archive's standout trick, trivial with JSON
- [ ] Backlinks panel ("what links here") 🟢 — cheap once entries are indexed
- [ ] Hover previews of linked entries 🟡
- [ ] Image / asset attachment per entry 🟡 — store files next to JSON, reference by relative path
- [ ] More entry types: Species, Cultures, Religions, Magic systems, Languages, Currencies 🟢
- [ ] Snapshot backups (versioned JSON copies) 🟡
- [ ] Export to HTML 🟢
- [ ] Static map upload with entry-linked pins (show/hide pins) 🟡 — leaflet.js works offline

## Phase 3 — Stretch (high value, high cost)

These close the gap with World Anvil and LegendKeeper but carry real engineering cost. Prioritize the relationship graph and timelines; they deliver the most per unit of effort.

- [ ] Relationship graph / family trees / faction webs 🔴 — react-flow or d3 + a layout algorithm
- [ ] Historical timelines (multiple, color-coded, per-character) 🟡
- [ ] Nested / layered maps 🟡
- [ ] Manuscript editor: chapters and scenes with drag-and-drop reorder 🟡
- [ ] Outlining with story structures (Hero's Journey, Save the Cat, Snowflake) 🟢 — just templates
- [ ] Multiple plotlines / arcs tracking 🟡
- [ ] Link manuscript text to worldbuilding entries 🟡
- [ ] Export to EPUB / PDF 🟡
- [ ] Custom in-world calendars 🔴 — custom date math is fiddly
- [ ] Infinite whiteboard / freeform canvas 🔴
- [ ] Git-style version history (beyond snapshots) 🔴

## Deliberately out of scope

These conflict with the local-first, single-user, file-based design. Skip unless the product direction changes toward a hosted service.

- Multi-user / real-time collaborative editing 🔴 — requires a backend
- Co-authors, subscribers, audience-facing showcase 🔴
- Publishing / monetizing a world 🔴
- Granular per-reader permissions (only partly relevant — spoiler controls on *export* are worth keeping, full multi-user permissions are not)

---

## Notes on positioning

The web tools (World Anvil, LegendKeeper) win on maps, timelines, and relationship graphs. The offline tools Lore Codex actually competes with (Fantasia Archive, LoreForge) win on structure and data ownership.

The realistic edge for Lore Codex is the combination of **true portability (plain JSON the user owns)**, **auto-create-on-link**, **backlinks**, and a **clean templated entry system** — all reachable in Phase 1–2. The relationship graph and interactive maps in Phase 3 are the items that would let it stand next to the web tools rather than only the offline ones.
