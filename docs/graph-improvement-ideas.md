# Relationship Graph — Improvement Ideas

A backlog of enhancements for the relationship graph (`src/components/GraphView.tsx`,
`src/routes/GraphRoute.tsx`). The first slice being built now is **node search +
focus/ego mode + an orphans/hubs panel** — those are tracked separately. Everything
below is parked here for later.

## Navigation & interaction
- **Pin / drag nodes.** Let users drag a node and have it stay put (`fx`/`fy`) so they
  can hand-arrange their world; the layout currently reshuffles on every visit.
- **Persist view state.** Remember zoom/pan, hidden categories, and selected tag across
  visits, stored as a `meta` row (same pattern as `home-config`).

## Visual encoding & readability
- **Color by status or tag, not just type.** Toggle node color between page type,
  status (Stub/Draft/WIP/Complete), or a chosen tag. A "status" view instantly shows
  which corners of the world are unfinished.
- **Curved + bundled links and collision force.** Reduces hairball overlap once the
  graph passes a few hundred nodes.
- **Show broken / missing links as ghost nodes.** `buildGraphData` skips `[[links]]`
  to non-existent pages today. Surface them as dashed-outline ghost nodes — a built-in
  worldbuilding to-do list ("I referenced 'The Sundering' but never wrote it").
- **Distinguish reciprocity.** Style mutual links (A↔B) differently from one-way links;
  mutual relationships are usually the strong ones.

## Insight & analysis
- **Connected-components / "islands" detection.** Highlight disconnected subgraphs —
  often a sub-region of the world that isn't tied to the rest.
- **Shortest path between two pages.** Pick two nodes, highlight the chain of links
  connecting them ("how is this villain connected to that city?").
- **Mini-map / overview** for large graphs.

## Filtering
- **Multi-tag filtering with AND/OR**, replacing the single-tag dropdown.
- **Degree / depth slider.** Hide weakly-connected nodes to declutter, or show only the
  neighbourhood within N hops of a focused node.
- **Filter by status** alongside type and tag.

## New features
- **Timeline / chronology axis.** If pages carry date-like infobox fields, lay the graph
  out left-to-right by in-world time.
- **Export the graph** as PNG/SVG for sharing or pasting into notes — fits the
  local-first, off-device-backup ethos.
- **3D toggle** via `react-force-graph-3d` (sibling lib). More "wow" than utility, but
  cheap to add.
