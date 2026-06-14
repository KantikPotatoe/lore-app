# Relationship Graph — Design

**Issue:** #16 — Relationship graph: visual node map of page connections
**Date:** 2026-06-14
**Status:** Approved

## Summary

Add an interactive, force-directed graph view that shows every lore page as a
node and every resolved link between pages as an edge — similar to Obsidian's
graph view. The graph makes the structure of the world visible at a glance:
clusters of tightly linked pages emerge naturally and isolated pages become
obvious.

## Goals (acceptance criteria from #16)

- Accessible from a **Graph** button in the sidebar.
- Nodes colored by category.
- Node size scales with number of connections (more links = larger node).
- Clicking a node navigates to that page.
- Hovering a node highlights its direct connections.
- Graph can be filtered by category or tag.
- Zoom and pan are supported.

## Non-goals (YAGNI)

- No persisted graph layout / saved node positions.
- No editing of links from within the graph.
- No hard maximum node cap — filtering is the culling mechanism.
- No "ghost" nodes for links to pages that do not yet exist.

## Rendering approach

Use **`react-force-graph-2d`** (Canvas + `d3-force`). It provides zoom, pan,
hover, click, node sizing, and performant rendering out of the box, which covers
all acceptance criteria with the least custom code. It is a single new
dependency.

**Risk:** the package may emit a peer-dependency warning against React 19 and
need `npm install react-force-graph-2d --legacy-peer-deps`. Verify during
implementation that it mounts and renders under React 19.

## Data model

A pure helper added to `src/db.ts`, alongside the existing `linkedTitles()` /
`getBacklinks()` link logic (keeping link computation in one place):

```ts
interface GraphNode {
  id: string        // page id
  title: string
  category: string
  tags: string[]
  degree: number    // count of distinct connected pages
}

interface GraphLink {
  source: string    // page id (link origin)
  target: string    // page id (link destination)
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

function buildGraphData(pages: LorePage[]): GraphData
```

Rules:

- **Nodes:** one per existing page. *All* pages are included, so pages with no
  connections render as lone floating dots (this is desirable — it surfaces
  isolated pages).
- **Edges:** for each page, resolve its `linkedTitles()` against a
  `title (lowercased) → id` map built from all pages. A link counts only when
  the target page exists; links to not-yet-created titles are skipped (no ghost
  nodes).
- **De-duplication:** A↔B collapses to a single edge regardless of direction.
  The retained edge keeps a `source`/`target` so directional arrows can be
  toggled on in the view. Self-links (a page linking to itself) are dropped.
- **degree:** number of *distinct* pages a node is connected to (in either
  direction). Drives node radius.

## Components

### `src/routes/GraphRoute.tsx`

Owns the toolbar and filter state; computes the filtered node/link set and feeds
it to `GraphView`.

- Reads all pages via `useLiveQuery` and computes `buildGraphData(pages)`
  (memoized).
- **Toolbar:**
  - Category **chips** — one per category present in the data, colored via
    `categoryColor()`. Click to toggle visibility. Default: all on.
  - **Tag** dropdown — narrows to nodes carrying the selected tag(s).
  - **Arrows** on/off toggle — controls directional arrowheads.
  - Live **count** of visible nodes / edges.
  - Above ~300 visible nodes, a gentle hint suggesting the user filter.
- **Filtering:** derive `visibleNodes` from selected categories + tags, then keep
  only edges whose both endpoints are visible. Passing a new dataset lets the
  force layout re-settle.

### `src/components/GraphView.tsx`

Wraps `ForceGraph2D` and handles presentation/interaction.

- **Color:** node fill = `categoryColor(node.category)`.
- **Size:** radius scales with `degree`, clamped to a min/max so isolated nodes
  stay visible and hubs do not dominate.
- **Paint:** custom `nodeCanvasObject` draws the circle plus the page title
  label (Obsidian-style).
- **Hover:** on `onNodeHover`, compute the hovered node's direct neighbors;
  highlight the node, its neighbors, and connecting edges while dimming the rest.
- **Click:** `onNodeClick` → `navigate('/page/:id')`.
- **Zoom/pan:** built in.
- **Arrows:** when enabled, set `linkDirectionalArrowLength` (and relative
  position) so each edge shows source→target direction.

## Routing & navigation

- `src/App.tsx`: add `<Route path="/graph" element={<GraphRoute />} />`.
- `src/components/Sidebar.tsx`: add a **Graph** link in `top-nav`, active when
  `location.pathname.startsWith('/graph')`.

## Styling

Add graph-page styles (full-height canvas area + toolbar, filter chips) to the
existing stylesheet, following the visual language of the map toolbar and
sidebar chips.

## Performance

Canvas rendering handles a few hundred nodes comfortably. The category/tag
filters are the primary culling mechanism. No hard cap; the visible-count hint
nudges users with very large worlds to filter. If profiling later shows a need,
a max-visible-node guard can be added — out of scope for now.

## Testing

This project has no automated tests. Verify manually by running the dev server
(`npm run dev`, port 5174) and confirming:

- The Graph link appears in the sidebar and routes to `/graph`.
- Nodes are colored by category and sized by connection count.
- Hovering a node highlights its direct connections and dims the rest.
- Clicking a node opens that page.
- Category chips and the tag dropdown add/remove nodes correctly.
- The arrows toggle shows/hides directional arrowheads.
- Zoom and pan work.
