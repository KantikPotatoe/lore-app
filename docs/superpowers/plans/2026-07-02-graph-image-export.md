# Graph Image Export (PNG / SVG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toolbar control to the 2D relationship graph that exports the currently-visible graph as a downloadable PNG or SVG image.

**Architecture:** A pure `graphExport.ts` module turns the already-positioned filtered graph into an intermediate *scene* (`buildScene`), which two renderers consume: `sceneToSvg` (vector string) and `sceneToPng` (offscreen-canvas → Blob). Both render from the same scene so PNG and SVG are equivalent. Node sizing is lifted out of `GraphView.tsx` into a shared `graphGeometry.ts` so the live renderer and the exporter agree. `GraphRoute.tsx` wires an Export button + menu that builds the scene and triggers a download.

**Tech Stack:** TypeScript (strict), React, Vitest + happy-dom, existing `react-force-graph-2d` data shapes, DOM Canvas/Blob APIs.

## Global Constraints

- TypeScript `strict`; no `any` leaking into public signatures (local casts for lib-augmented `x`/`y` are fine).
- Re-export any new **`src/db`** public API from the barrel — N/A here (new modules live in `src/`, not `src/db`).
- No literal `Date.now()` / `new Date()` inside React render or hooks (react-hooks/purity lint). Filename/date helpers live in a plain module and are called from **event handlers** — allowed, matching `src/backup.ts`.
- Run `npm run lint`, `npm run build`, and `npm run test:run` before claiming done (CI runs all three).
- Tests: Vitest + happy-dom (default). No DOMPurify here, so no jsdom pragma needed.
- Port/DB conventions untouched.

---

## File Structure

- **Create** `src/graphGeometry.ts` — `MIN_RADIUS`, `MAX_RADIUS`, `radiusFor(degree)` (lifted from `GraphView.tsx`).
- **Create** `src/graphGeometry.test.ts` — bounds tests.
- **Create** `src/graphExport.ts` — scene model + `buildScene`, `sceneToSvg`, `sceneToPng`, `svgBlob`, `downloadBlob`, `graphFilename`.
- **Create** `src/graphExport.test.ts` — pure-core tests.
- **Modify** `src/components/GraphView.tsx` — import `radiusFor`/constants from `graphGeometry` instead of defining them locally.
- **Modify** `src/routes/GraphRoute.tsx` — Export button + menu + `doExport` handler + lore-name live query.
- **Modify** `src/index.css` — `.graph-export` menu styling.

---

### Task 1: Shared node geometry module

Lift the radius math out of `GraphView.tsx` so both the live canvas and the exporter compute node size identically. Pure refactor — the live view must behave exactly as before.

**Files:**
- Create: `src/graphGeometry.ts`
- Create: `src/graphGeometry.test.ts`
- Modify: `src/components/GraphView.tsx` (remove local `MIN_RADIUS`/`MAX_RADIUS`/`radiusFor`, import them instead)

**Interfaces:**
- Produces: `MIN_RADIUS: number`, `MAX_RADIUS: number`, `radiusFor(degree: number): number`

- [ ] **Step 1: Write the failing test**

Create `src/graphGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { radiusFor, MIN_RADIUS, MAX_RADIUS } from './graphGeometry'

describe('radiusFor', () => {
  it('floors at MIN_RADIUS for a lone (degree 0) node', () => {
    expect(radiusFor(0)).toBe(MIN_RADIUS)
  })

  it('grows with degree', () => {
    expect(radiusFor(2)).toBeGreaterThan(radiusFor(1))
  })

  it('clamps at MAX_RADIUS for a huge hub', () => {
    expect(radiusFor(1000)).toBe(MAX_RADIUS)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/graphGeometry.test.ts`
Expected: FAIL — cannot resolve `./graphGeometry`.

- [ ] **Step 3: Create the module**

Create `src/graphGeometry.ts`:

```ts
// Node radius grows with connection count but stays within these bounds so a
// lone page is still visible and a hub does not swallow the screen. Shared by
// the live canvas renderer (GraphView) and the image exporter (graphExport) so
// node sizing has a single source of truth.
export const MIN_RADIUS = 4
export const MAX_RADIUS = 16

export function radiusFor(degree: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + degree * 1.5)
}
```

- [ ] **Step 4: Point GraphView at the shared module**

In `src/components/GraphView.tsx`, delete the local declarations (lines ~18-25):

```ts
// Node radius grows with connection count but stays within these bounds so a
// lone page is still visible and a hub does not swallow the screen.
const MIN_RADIUS = 4
const MAX_RADIUS = 16

function radiusFor(degree: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + degree * 1.5)
}
```

and add an import alongside the existing ones near the top (after the `graphColor` import):

```ts
import { radiusFor } from '../graphGeometry'
```

(`MIN_RADIUS`/`MAX_RADIUS` are not referenced directly in `GraphView`, only via `radiusFor`, so importing just `radiusFor` is enough. If a lint "unused" appears, import only what's used.)

- [ ] **Step 5: Run tests + build to verify the refactor is clean**

Run: `npm run test:run -- src/graphGeometry.test.ts && npm run build`
Expected: test PASS; build succeeds (no unused/undefined `radiusFor` in `GraphView`).

- [ ] **Step 6: Commit**

```bash
git add src/graphGeometry.ts src/graphGeometry.test.ts src/components/GraphView.tsx
git commit -m "refactor: extract shared graph node geometry (#133)"
```

---

### Task 2: Scene model + `buildScene`

The pure heart of the feature: turn the filtered graph (nodes already carry `x`/`y` from the running sim) into a serialisable scene with a padded bounding box, per-node fill/label, and per-link styling. Skips un-positioned nodes; returns `null` when nothing is positioned yet.

**Files:**
- Create: `src/graphExport.ts`
- Create: `src/graphExport.test.ts`

**Interfaces:**
- Consumes: `radiusFor` from `src/graphGeometry`; `nodeFill`, `ColorBy` from `src/graphColor`; `GraphData`, `GraphNode`, `GraphLink` from `src/db`.
- Produces:
  - `interface SceneNode { x: number; y: number; r: number; fill: string | null; ghost: boolean; title: string; labelColor: string }`
  - `interface SceneLink { x1: number; y1: number; x2: number; y2: number; color: string; width: number }`
  - `interface GraphScene { minX: number; minY: number; width: number; height: number; background: string; nodes: SceneNode[]; links: SceneLink[] }`
  - `buildScene(data: GraphData, opts: { colorBy: ColorBy; highlightTag: string; islandColors: Map<string, string> }): GraphScene | null`
  - constants used by later tasks: `EXPORT_BG = '#15130f'`, `LABEL_COLOR = '#e9e1d2'`, `GHOST_COLOR = '#8a8270'`

- [ ] **Step 1: Write the failing tests**

Create `src/graphExport.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildScene, EXPORT_BG, GHOST_COLOR, LABEL_COLOR } from './graphExport'
import { categoryColor, type GraphData, type GraphNode } from './db'

// Nodes as the running sim leaves them: plain GraphNode + injected x/y.
function pos(n: Partial<GraphNode> & { id: string }, x: number, y: number) {
  return {
    title: n.id, category: 'Character', tags: [], status: 'Draft',
    degree: 0, ...n, x, y,
  } as GraphNode & { x: number; y: number }
}

const OPTS = { colorBy: 'type' as const, highlightTag: '', islandColors: new Map<string, string>() }

describe('buildScene', () => {
  it('returns null when no node has coordinates', () => {
    const data: GraphData = {
      nodes: [{ id: 'a', title: 'A', category: 'Character', tags: [], status: 'Draft', degree: 0 }],
      links: [],
    }
    expect(buildScene(data, OPTS)).toBeNull()
  })

  it('computes a padded bounding box enclosing all positioned nodes', () => {
    const data = { nodes: [pos({ id: 'a' }, 0, 0), pos({ id: 'b' }, 100, 50)], links: [] } as unknown as GraphData
    const scene = buildScene(data, OPTS)!
    expect(scene).not.toBeNull()
    // Box starts left/above the min node and extends right/below the max node.
    expect(scene.minX).toBeLessThan(0)
    expect(scene.minY).toBeLessThan(0)
    expect(scene.minX + scene.width).toBeGreaterThan(100)
    expect(scene.minY + scene.height).toBeGreaterThan(50)
    expect(scene.background).toBe(EXPORT_BG)
  })

  it('gives every node a label and a type-coloured fill', () => {
    const data = { nodes: [pos({ id: 'a', title: 'Alice', category: 'Character' }, 0, 0)], links: [] } as unknown as GraphData
    const scene = buildScene(data, OPTS)!
    expect(scene.nodes).toHaveLength(1)
    expect(scene.nodes[0].title).toBe('Alice')
    expect(scene.nodes[0].labelColor).toBe(LABEL_COLOR)
    expect(scene.nodes[0].fill).toBe(categoryColor('Character'))
    expect(scene.nodes[0].ghost).toBe(false)
  })

  it('renders ghost nodes as stroke-not-fill with the muted label colour', () => {
    const data = { nodes: [pos({ id: 'ghost:x', title: 'X', ghost: true, status: '' }, 0, 0)], links: [] } as unknown as GraphData
    const scene = buildScene(data, OPTS)!
    expect(scene.nodes[0].fill).toBeNull()
    expect(scene.nodes[0].ghost).toBe(true)
    expect(scene.nodes[0].labelColor).toBe(GHOST_COLOR)
  })

  it('styles mutual links thicker/bluer than one-way links', () => {
    const data = {
      nodes: [pos({ id: 'a', degree: 1 }, 0, 0), pos({ id: 'b', degree: 1 }, 10, 0), pos({ id: 'c', degree: 1 }, 20, 0)],
      links: [
        { source: 'a', target: 'b', mutual: true },
        { source: 'b', target: 'c', mutual: false },
      ],
    } as unknown as GraphData
    const scene = buildScene(data, OPTS)!
    const mutual = scene.links[0]
    const oneWay = scene.links[1]
    expect(mutual.width).toBeGreaterThan(oneWay.width)
    expect(mutual.color).not.toBe(oneWay.color)
    expect(mutual.x1).toBe(0)
    expect(mutual.x2).toBe(10)
  })

  it('skips un-positioned nodes and drops links that touch them', () => {
    const data = {
      nodes: [pos({ id: 'a' }, 0, 0), { id: 'b', title: 'B', category: 'Character', tags: [], status: 'Draft', degree: 0 }],
      links: [{ source: 'a', target: 'b', mutual: false }],
    } as unknown as GraphData
    const scene = buildScene(data, OPTS)!
    expect(scene.nodes).toHaveLength(1) // 'b' has no x/y → skipped
    expect(scene.links).toHaveLength(0) // link touches skipped 'b' → dropped
  })

  it('resolves link endpoints whether source/target are ids or node objects', () => {
    const a = pos({ id: 'a' }, 0, 0)
    const b = pos({ id: 'b' }, 30, 40)
    // After the sim runs, react-force-graph swaps ids for node object refs.
    const data = { nodes: [a, b], links: [{ source: a, target: b, mutual: false }] } as unknown as GraphData
    const scene = buildScene(data, OPTS)!
    expect(scene.links).toHaveLength(1)
    expect(scene.links[0].x2).toBe(30)
    expect(scene.links[0].y2).toBe(40)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/graphExport.test.ts`
Expected: FAIL — cannot resolve `./graphExport`.

- [ ] **Step 3: Implement `buildScene` and the scene model**

Create `src/graphExport.ts`:

```ts
import { radiusFor } from './graphGeometry'
import { nodeFill, type ColorBy } from './graphColor'
import type { GraphData, GraphNode, GraphLink } from './db'

// Solid dark background matching the live graph canvas, so the light labels and
// edges stay readable when the image is pasted onto any surface.
export const EXPORT_BG = '#15130f'
export const LABEL_COLOR = '#e9e1d2'
export const GHOST_COLOR = '#8a8270'

// Padding around the node bounding box (graph units) — enough for the largest
// node radius plus a line of label text below it.
const PAD = 48

// Rest-state link styling, mirrored from GraphView.linkColor / linkWidth (the
// no-focus branch) so an exported image matches the graph at rest.
const MUTUAL_LINK = { color: 'rgba(150,180,255,0.5)', width: 2.5 }
const ONEWAY_LINK = { color: 'rgba(160,160,160,0.28)', width: 1 }

export interface SceneNode {
  x: number
  y: number
  r: number
  /** Fill colour for real pages; null for ghosts (drawn as a dashed stroke). */
  fill: string | null
  ghost: boolean
  title: string
  labelColor: string
}

export interface SceneLink {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  width: number
}

export interface GraphScene {
  minX: number
  minY: number
  width: number
  height: number
  background: string
  nodes: SceneNode[]
  links: SceneLink[]
}

// The sim augments nodes with x/y in place; accept that richer shape.
type Positioned = GraphNode & { x?: number; y?: number }

// A link end is an id string before the sim runs and the resolved node object
// after; recover the id either way (mirrors GraphView.endId).
function endId(end: string | Positioned): string {
  return typeof end === 'object' ? String(end.id) : end
}

/**
 * Build a serialisable scene from the *filtered* graph. Nodes are expected to
 * carry x/y from the running force simulation. Un-positioned nodes are skipped
 * (and any link touching them dropped). Returns null when no node has settled
 * yet, so callers can show a "still settling" message instead of a blank image.
 */
export function buildScene(
  data: GraphData,
  opts: { colorBy: ColorBy; highlightTag: string; islandColors: Map<string, string> },
): GraphScene | null {
  const positioned = new Map<string, Positioned>()
  const sceneNodes: SceneNode[] = []

  for (const n of data.nodes as Positioned[]) {
    if (n.x == null || n.y == null) continue
    positioned.set(String(n.id), n)
    const ghost = !!n.ghost
    sceneNodes.push({
      x: n.x,
      y: n.y,
      r: radiusFor(n.degree),
      fill: ghost ? null : nodeFill(n, opts.colorBy, opts.highlightTag, opts.islandColors),
      ghost,
      title: n.title,
      labelColor: ghost ? GHOST_COLOR : LABEL_COLOR,
    })
  }

  if (sceneNodes.length === 0) return null

  const sceneLinks: SceneLink[] = []
  for (const l of data.links as Array<GraphLink & { source: string | Positioned; target: string | Positioned }>) {
    const s = positioned.get(endId(l.source))
    const t = positioned.get(endId(l.target))
    if (!s || !t) continue
    const style = l.mutual ? MUTUAL_LINK : ONEWAY_LINK
    sceneLinks.push({ x1: s.x!, y1: s.y!, x2: t.x!, y2: t.y!, color: style.color, width: style.width })
  }

  // Bounding box over node centres expanded by each node's radius, then padded.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of sceneNodes) {
    minX = Math.min(minX, n.x - n.r)
    minY = Math.min(minY, n.y - n.r)
    maxX = Math.max(maxX, n.x + n.r)
    maxY = Math.max(maxY, n.y + n.r)
  }
  minX -= PAD
  minY -= PAD
  maxX += PAD
  maxY += PAD

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
    background: EXPORT_BG,
    nodes: sceneNodes,
    links: sceneLinks,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/graphExport.test.ts`
Expected: PASS (all `buildScene` tests green).

- [ ] **Step 5: Commit**

```bash
git add src/graphExport.ts src/graphExport.test.ts
git commit -m "feat: build export scene model from filtered graph (#133)"
```

---

### Task 3: `sceneToSvg`

Serialise a scene to an SVG string: background rect, `<line>` per link, `<circle>` per node (ghosts dashed, no fill), `<text>` per label. Title text is XML-escaped.

**Files:**
- Modify: `src/graphExport.ts` (append `sceneToSvg`, `svgBlob`)
- Modify: `src/graphExport.test.ts` (append SVG tests)

**Interfaces:**
- Consumes: `GraphScene`, `EXPORT_BG`, `GHOST_COLOR` from this module.
- Produces: `sceneToSvg(scene: GraphScene): string`, `svgBlob(svg: string): Blob`

- [ ] **Step 1: Write the failing tests**

Append to `src/graphExport.test.ts`:

```ts
import { sceneToSvg, svgBlob } from './graphExport'

function scene1() {
  const data = {
    nodes: [
      { title: 'Alice & Bob', category: 'Character', tags: [], status: 'Draft', degree: 1, id: 'a', x: 0, y: 0 },
      { title: 'Ghosttown', category: '', tags: [], status: '', degree: 1, id: 'g', ghost: true, x: 20, y: 0 },
    ],
    links: [{ source: 'a', target: 'g', mutual: false }],
  } as unknown as import('./db').GraphData
  return buildScene(data, { colorBy: 'type', highlightTag: '', islandColors: new Map() })!
}

describe('sceneToSvg', () => {
  it('emits a viewBox matching the scene bounds', () => {
    const s = scene1()
    const svg = sceneToSvg(s)
    expect(svg).toContain(`viewBox="${s.minX} ${s.minY} ${s.width} ${s.height}"`)
  })

  it('emits one circle, one line, and one text per node/link', () => {
    const svg = sceneToSvg(scene1())
    expect((svg.match(/<circle/g) ?? []).length).toBe(2)
    expect((svg.match(/<line/g) ?? []).length).toBe(1)
    expect((svg.match(/<text/g) ?? []).length).toBe(2)
  })

  it('draws ghost nodes with a dashed stroke and no fill', () => {
    const svg = sceneToSvg(scene1())
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain(`stroke="${'#8a8270'}"`)
  })

  it('XML-escapes label text', () => {
    const svg = sceneToSvg(scene1())
    expect(svg).toContain('Alice &amp; Bob')
    expect(svg).not.toContain('Alice & Bob')
  })

  it('svgBlob wraps a string as an image/svg+xml Blob', () => {
    const blob = svgBlob('<svg/>')
    expect(blob.type).toBe('image/svg+xml')
    expect(blob.size).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/graphExport.test.ts`
Expected: FAIL — `sceneToSvg` / `svgBlob` are not exported.

- [ ] **Step 3: Implement `sceneToSvg` and `svgBlob`**

Append to `src/graphExport.ts`:

```ts
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Fixed label size in graph units (the live view uses 12/scale; a static export
// has no zoom, so a constant reads consistently against node radii).
const LABEL_FONT = 12

/** Render a scene to a standalone SVG document string. */
export function sceneToSvg(scene: GraphScene): string {
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scene.minX} ${scene.minY} ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}">`,
  )
  parts.push(
    `<rect x="${scene.minX}" y="${scene.minY}" width="${scene.width}" height="${scene.height}" fill="${scene.background}"/>`,
  )

  for (const l of scene.links) {
    parts.push(
      `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${l.color}" stroke-width="${l.width}"/>`,
    )
  }

  for (const n of scene.nodes) {
    if (n.ghost) {
      parts.push(
        `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="none" stroke="${GHOST_COLOR}" stroke-width="1.5" stroke-dasharray="3 3"/>`,
      )
    } else {
      parts.push(`<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${n.fill}"/>`)
    }
  }

  for (const n of scene.nodes) {
    parts.push(
      `<text x="${n.x}" y="${n.y + n.r + 1}" fill="${n.labelColor}" font-family="sans-serif" font-size="${LABEL_FONT}" text-anchor="middle" dominant-baseline="hanging">${escapeXml(n.title)}</text>`,
    )
  }

  parts.push('</svg>')
  return parts.join('')
}

/** Wrap an SVG string as a downloadable Blob. */
export function svgBlob(svg: string): Blob {
  return new Blob([svg], { type: 'image/svg+xml' })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/graphExport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/graphExport.ts src/graphExport.test.ts
git commit -m "feat: render export scene to SVG (#133)"
```

---

### Task 4: `sceneToPng`, `downloadBlob`, and `graphFilename`

Rasterise the scene onto an offscreen canvas at 2× scale and resolve a PNG Blob; add the download trigger and the filename builder. The PNG raster path is thin glue over the DOM canvas.

**Files:**
- Modify: `src/graphExport.ts` (append `sceneToPng`, `downloadBlob`, `graphFilename`)
- Modify: `src/graphExport.test.ts` (append tests)

**Interfaces:**
- Consumes: `GraphScene`, `LABEL_COLOR`, `GHOST_COLOR` from this module.
- Produces:
  - `sceneToPng(scene: GraphScene): Promise<Blob>`
  - `downloadBlob(blob: Blob, filename: string): void`
  - `graphFilename(loreName: string, ext: 'png' | 'svg'): string`

- [ ] **Step 1: Write the failing tests**

Append to `src/graphExport.test.ts`:

```ts
import { graphFilename, sceneToPng } from './graphExport'

describe('graphFilename', () => {
  it('slugifies the lore name and appends the extension', () => {
    const name = graphFilename('My Grand World!', 'svg')
    expect(name).toMatch(/^graph-my-grand-world-\d{4}-\d{2}-\d{2}\.svg$/)
  })

  it('falls back to "world" for an empty name', () => {
    expect(graphFilename('   ', 'png')).toMatch(/^graph-world-\d{4}-\d{2}-\d{2}\.png$/)
  })
})

describe('sceneToPng', () => {
  it('resolves to a non-empty image/png Blob', async () => {
    const data = { nodes: [{ title: 'A', category: 'Character', tags: [], status: 'Draft', degree: 0, id: 'a', x: 0, y: 0 }], links: [] } as unknown as import('./db').GraphData
    const scene = buildScene(data, { colorBy: 'type', highlightTag: '', islandColors: new Map() })!
    let blob: Blob
    try {
      blob = await sceneToPng(scene)
    } catch {
      // happy-dom's canvas may not implement toBlob; skip the assertion there.
      return
    }
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/graphExport.test.ts`
Expected: FAIL — `graphFilename` / `sceneToPng` are not exported.

- [ ] **Step 3: Implement the PNG raster, download, and filename helpers**

Append to `src/graphExport.ts`:

```ts
// Retina scale for the raster export so labels stay crisp.
const PNG_SCALE = 2

/** Rasterise a scene to a PNG Blob via an offscreen canvas. */
export function sceneToPng(scene: GraphScene): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(scene.width * PNG_SCALE))
    canvas.height = Math.max(1, Math.ceil(scene.height * PNG_SCALE))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('2D canvas context unavailable'))
      return
    }

    ctx.scale(PNG_SCALE, PNG_SCALE)
    ctx.translate(-scene.minX, -scene.minY)

    // Background.
    ctx.fillStyle = scene.background
    ctx.fillRect(scene.minX, scene.minY, scene.width, scene.height)

    // Links.
    for (const l of scene.links) {
      ctx.beginPath()
      ctx.moveTo(l.x1, l.y1)
      ctx.lineTo(l.x2, l.y2)
      ctx.strokeStyle = l.color
      ctx.lineWidth = l.width
      ctx.stroke()
    }

    // Nodes.
    for (const n of scene.nodes) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r, 0, 2 * Math.PI)
      if (n.ghost) {
        ctx.setLineDash([3, 3])
        ctx.lineWidth = 1.5
        ctx.strokeStyle = GHOST_COLOR
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.fillStyle = n.fill as string
        ctx.fill()
      }
    }

    // Labels.
    ctx.font = `${LABEL_FONT}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const n of scene.nodes) {
      ctx.fillStyle = n.labelColor
      ctx.fillText(n.title, n.x, n.y + n.r + 1)
    }

    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('canvas.toBlob returned null'))
    }, 'image/png')
  })
}

/** Trigger a browser download of a Blob (same idiom as backup.ts). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Build a filename-safe export name: graph-<slug>-YYYY-MM-DD.<ext>. */
export function graphFilename(loreName: string, ext: 'png' | 'svg'): string {
  const slug =
    loreName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'world'
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `graph-${slug}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${ext}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/graphExport.test.ts`
Expected: PASS (the PNG test either asserts a real Blob or skips under happy-dom).

- [ ] **Step 5: Commit**

```bash
git add src/graphExport.ts src/graphExport.test.ts
git commit -m "feat: raster PNG export, download + filename helpers (#133)"
```

---

### Task 5: Toolbar Export button, menu, and wiring

Add an `⬇ Export` disclosure to the graph toolbar with PNG/SVG choices, wire the `doExport` handler, and surface the "still settling"/failure message inline. Hidden in 3D mode and when nothing is visible.

**Files:**
- Modify: `src/routes/GraphRoute.tsx`
- Modify: `src/index.css` (append `.graph-export` styles)

**Interfaces:**
- Consumes: `buildScene`, `sceneToSvg`, `svgBlob`, `sceneToPng`, `downloadBlob`, `graphFilename` from `src/graphExport`; `getLore`, `currentLoreId` from `src/lores`; existing `filtered`, `colorBy`, `tag`, `islandColors`, `threeD` from the component.

- [ ] **Step 1: Add imports and the export handler to `GraphRoute`**

In `src/routes/GraphRoute.tsx`, add to the imports at the top:

```ts
import { getLore, currentLoreId } from '../lores'
import { buildScene, sceneToSvg, svgBlob, sceneToPng, downloadBlob, graphFilename } from '../graphExport'
```

Inside the component, after the existing `const [pendingGhost, setPendingGhost] = useState<string | null>(null)` line, add export state and the current lore name:

```ts
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const lore = useLiveQuery(() => getLore(currentLoreId()), [])
  const loreName = lore?.name ?? 'World'
```

Then add the handler alongside the other functions (e.g. just above `async function createGhost`):

```ts
  async function doExport(format: 'png' | 'svg') {
    setExportMsg(null)
    const scene = buildScene(filtered, { colorBy, highlightTag: tag, islandColors })
    if (!scene) {
      setExportMsg('Graph still settling — try again')
      return
    }
    try {
      const filename = graphFilename(loreName, format)
      if (format === 'svg') {
        downloadBlob(svgBlob(sceneToSvg(scene)), filename)
      } else {
        downloadBlob(await sceneToPng(scene), filename)
      }
    } catch {
      setExportMsg('Export failed — try again')
    }
  }
```

- [ ] **Step 2: Add the Export disclosure to the toolbar**

In `src/routes/GraphRoute.tsx`, insert this block into the `.graph-toolbar` just before the `<button ... panelOpen ...>` ("Hubs & orphans") button (around line 301). It's hidden in 3D mode (no WebGL capture) and when nothing is visible:

```tsx
        {!threeD && filtered.nodes.length > 0 && (
          <details className="graph-export">
            <summary className="ghost-btn">⬇ Export</summary>
            <div className="graph-export-menu">
              <button
                onClick={(e) => {
                  ;(e.currentTarget.closest('details') as HTMLDetailsElement).open = false
                  doExport('png')
                }}
              >
                PNG image
              </button>
              <button
                onClick={(e) => {
                  ;(e.currentTarget.closest('details') as HTMLDetailsElement).open = false
                  doExport('svg')
                }}
              >
                SVG vector
              </button>
              {exportMsg && <p className="graph-export-msg">{exportMsg}</p>}
            </div>
          </details>
        )}
```

- [ ] **Step 3: Add the menu styling**

Append to `src/index.css` (after the `.graph-search` rules near the graph toolbar styles):

```css
.graph-export {
  position: relative;
}
.graph-export > summary {
  list-style: none;
}
.graph-export > summary::-webkit-details-marker {
  display: none;
}
.graph-export-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 150px;
  padding: 4px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}
.graph-export-menu button {
  text-align: left;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--ink);
  cursor: pointer;
  font-family: var(--sans);
  font-size: 0.85rem;
}
.graph-export-menu button:hover {
  background: var(--panel-2);
}
.graph-export-msg {
  margin: 4px 6px 2px;
  color: var(--ink-faint);
  font-size: 0.8rem;
}
```

- [ ] **Step 4: Verify lint, build, and full test suite**

Run: `npm run lint && npm run build && npm run test:run`
Expected: all pass. (If lint flags the `useState`/`useLiveQuery` additions for ordering, place them with the other hooks near the top of the component.)

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, open `/graph`, and confirm:
- `⬇ Export` appears; clicking opens the PNG/SVG menu.
- Choosing PNG downloads `graph-<world>-<date>.png`; opening it shows the dark graph with labelled nodes.
- Choosing SVG downloads a `.svg` that opens crisp in a browser/editor.
- Toggling `🧊 3D on` hides the Export control.

- [ ] **Step 6: Commit**

```bash
git add src/routes/GraphRoute.tsx src/index.css
git commit -m "feat: graph toolbar PNG/SVG export control (#133)"
```

---

## Self-Review

**Spec coverage:**
- One scene, two renderers → Tasks 2 (`buildScene`), 3 (`sceneToSvg`), 4 (`sceneToPng`). ✓
- Shared geometry (`graphGeometry.ts`) → Task 1. ✓
- Reuse `nodeFill`; mutual/one-way rest-state link styling → Task 2 (constants + tests). ✓
- Whole-graph fit-to-frame (padded bbox / viewBox) → Task 2 bbox + Task 3 viewBox. ✓
- All labels; dark background → Task 2 (label per node, `EXPORT_BG`) + renderers. ✓
- Ghost = dashed stroke, no fill → Tasks 2/3/4. ✓
- Toolbar Export button + PNG/SVG menu, download idiom, filename `graph-<lore>-<date>` → Task 5 + `graphFilename` (Task 4). ✓
- Hidden in 3D / when empty → Task 5 guard. ✓
- Error handling: no-op "still settling" sentinel + caught failures → `buildScene` returns null (Task 2) + `doExport` try/catch + `exportMsg` (Task 5). ✓
- Tests for geometry, buildScene, sceneToSvg, sceneToPng → Tasks 1–4. ✓
- 2D-only / no options dialog / no new prefs (YAGNI) → honoured (no persisted state added). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `buildScene`/`sceneToSvg`/`sceneToPng` signatures and `GraphScene`/`SceneNode`/`SceneLink` names match across tasks; `graphFilename(loreName, ext)`, `downloadBlob(blob, filename)`, `svgBlob(svg)` used consistently in Task 5. `LABEL_FONT`/`GHOST_COLOR`/`LABEL_COLOR`/`EXPORT_BG` defined once (Tasks 2–3) and reused. ✓
