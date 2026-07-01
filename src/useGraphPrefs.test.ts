import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { db, setMeta, getMeta } from './db'
import { useGraphPrefs } from './useGraphPrefs'

afterEach(cleanup)

beforeEach(async () => {
  await db.meta.clear()
})

describe('useGraphPrefs', () => {
  it('uses defaults when no meta row exists', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    // Wait past the hydration tick.
    await waitFor(() => expect(result.current).toBeTruthy())
    expect(result.current.showGhosts).toBe(true)
    expect(result.current.showArrows).toBe(false)
    expect(result.current.panelOpen).toBe(false)
    expect(result.current.tag).toBe('')
    expect(result.current.cam).toBeNull()
    expect(result.current.minDegree).toBe(0)
    expect(result.current.depth).toBe(0)
    expect([...result.current.hidden]).toEqual([])
    expect([...result.current.hiddenStatuses]).toEqual([])
    expect(result.current.threeD).toBe(false)
    expect(result.current.pins).toEqual({})
  })

  it('persists the min-degree and depth sliders to meta', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.setMinDegree(2))
    act(() => result.current.setDepth(3))
    await waitFor(() => expect(result.current.minDegree).toBe(2))
    expect(result.current.depth).toBe(3)
    const v = await getMeta<{ minDegree: number; depth: number }>('graph-view')
    expect(v?.minDegree).toBe(2)
    expect(v?.depth).toBe(3)
  })

  it('toggleStatus hides then reveals a status, persisting to meta', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.toggleStatus('Stub'))
    await waitFor(() => expect([...result.current.hiddenStatuses]).toEqual(['Stub']))
    const v = await getMeta<{ hiddenStatuses: string[] }>('graph-view')
    expect(v?.hiddenStatuses).toEqual(['Stub'])
    act(() => result.current.toggleStatus('Stub'))
    await waitFor(() => expect([...result.current.hiddenStatuses]).toEqual([]))
  })

  it('persists the 3D toggle to meta', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.setThreeD(true))
    await waitFor(() => expect(result.current.threeD).toBe(true))
    const v = await getMeta<{ threeD: boolean }>('graph-view')
    expect(v?.threeD).toBe(true)
  })

  it('backfills tag/cam defaults for older view rows missing them', async () => {
    // A row written before tag/cam existed must hydrate without throwing.
    await setMeta('graph-view', { hidden: [], showArrows: false, showGhosts: true, panelOpen: false })
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    expect(result.current.tag).toBe('')
    expect(result.current.cam).toBeNull()
  })

  it('persists the selected tag to meta', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.setTag('Faction'))
    await waitFor(() => expect(result.current.tag).toBe('Faction'))
    const v = await getMeta<{ tag: string }>('graph-view')
    expect(v?.tag).toBe('Faction')
  })

  it('persists the camera transform to meta', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.setCam({ k: 2, x: 100, y: -50 }))
    await waitFor(() => expect(result.current.cam).toEqual({ k: 2, x: 100, y: -50 }))
    const v = await getMeta<{ cam: { k: number } }>('graph-view')
    expect(v?.cam).toEqual({ k: 2, x: 100, y: -50 })
  })

  it('hydrates view + pins from existing meta rows', async () => {
    await setMeta('graph-view', { hidden: ['Character'], showArrows: true, showGhosts: false, panelOpen: true })
    await setMeta('graph-pins', { p1: { x: 10, y: 20 } })

    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current.showArrows).toBe(true))
    expect([...result.current.hidden]).toEqual(['Character'])
    expect(result.current.showGhosts).toBe(false)
    expect(result.current.panelOpen).toBe(true)
    expect(result.current.pins).toEqual({ p1: { x: 10, y: 20 } })
  })

  it('does not clobber a stored row with defaults on first load', async () => {
    await setMeta('graph-view', { hidden: ['Item'], showArrows: false, showGhosts: false, panelOpen: false })
    const { unmount } = renderHook(() => useGraphPrefs())
    // Give effects time to run; the stored row must survive untouched.
    await waitFor(async () => {
      const v = await getMeta<{ showGhosts: boolean }>('graph-view')
      expect(v?.showGhosts).toBe(false)
    })
    unmount()
  })

  it('persists a toggle change to meta', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.setShowArrows(true))
    await waitFor(async () => {
      const v = await getMeta<{ showArrows: boolean }>('graph-view')
      expect(v?.showArrows).toBe(true)
    })
  })

  it('pinNode adds a pin and clearPins empties them', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.pinNode('p1', 5, 6))
    await waitFor(() => expect(result.current.pins).toEqual({ p1: { x: 5, y: 6 } }))
    act(() => result.current.clearPins())
    await waitFor(() => expect(result.current.pins).toEqual({}))
  })

  it('prunePins drops pins whose id is not in the valid set', async () => {
    const { result } = renderHook(() => useGraphPrefs())
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.pinNode('keep', 1, 1))
    act(() => result.current.pinNode('drop', 2, 2))
    await waitFor(() => expect(Object.keys(result.current.pins)).toHaveLength(2))
    act(() => result.current.prunePins(new Set(['keep'])))
    await waitFor(() => expect(result.current.pins).toEqual({ keep: { x: 1, y: 1 } }))
  })
})
