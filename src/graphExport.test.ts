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
