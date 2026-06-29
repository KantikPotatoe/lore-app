import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta, setMeta } from './db'

const VIEW_KEY = 'graph-view'
const PINS_KEY = 'graph-pins'

interface SavedView {
  hidden: string[]
  showArrows: boolean
  showGhosts: boolean
  panelOpen: boolean
}

type Pins = Record<string, { x: number; y: number }>

export interface GraphPrefs {
  hidden: Set<string>
  toggleCategory: (cat: string) => void
  showArrows: boolean
  setShowArrows: (v: boolean) => void
  showGhosts: boolean
  setShowGhosts: (v: boolean) => void
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void
  pins: Pins
  pinNode: (id: string, x: number, y: number) => void
  clearPins: () => void
  prunePins: (validIds: Set<string>) => void
}

export function useGraphPrefs(): GraphPrefs {
  // Wrap the read so "still loading" (outer undefined) is distinguishable from
  // "loaded, no row" (inner undefined) — otherwise defaults could clobber a row.
  const savedView = useLiveQuery(async () => ({ v: await getMeta<SavedView>(VIEW_KEY) }), [])
  const savedPins = useLiveQuery(async () => ({ v: await getMeta<Pins>(PINS_KEY) }), [])

  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showArrows, setShowArrows] = useState(false)
  const [showGhosts, setShowGhosts] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pins, setPins] = useState<Pins>({})

  // State (not ref) so that viewHydrated/pinsHydrated can be deps of the persist
  // effects. When hydration completes, the persist effect re-runs and captures
  // any state mutations that happened before the liveQuery resolved.
  const [viewHydrated, setViewHydrated] = useState(false)
  const [pinsHydrated, setPinsHydrated] = useState(false)

  useEffect(() => {
    if (viewHydrated || savedView === undefined) return
    setViewHydrated(true)
    const v = savedView.v
    if (v) {
      setHidden(new Set(v.hidden ?? []))
      setShowArrows(v.showArrows ?? false)
      setShowGhosts(v.showGhosts ?? true)
      setPanelOpen(v.panelOpen ?? false)
    }
  }, [savedView, viewHydrated])

  useEffect(() => {
    if (pinsHydrated || savedPins === undefined) return
    setPinsHydrated(true)
    if (savedPins.v) setPins(savedPins.v)
  }, [savedPins, pinsHydrated])

  // Persist only after hydration, so initial defaults never overwrite a stored row.
  // viewHydrated is in the dep array so the effect fires once hydration completes,
  // picking up any state changes that occurred before the liveQuery resolved.
  useEffect(() => {
    if (!viewHydrated) return
    setMeta(VIEW_KEY, { hidden: [...hidden], showArrows, showGhosts, panelOpen } satisfies SavedView)
  }, [hidden, showArrows, showGhosts, panelOpen, viewHydrated])

  useEffect(() => {
    if (!pinsHydrated) return
    setMeta(PINS_KEY, pins)
  }, [pins, pinsHydrated])

  const toggleCategory = useCallback((cat: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  const pinNode = useCallback((id: string, x: number, y: number) => {
    setPins((prev) => ({ ...prev, [id]: { x, y } }))
  }, [])

  const clearPins = useCallback(() => setPins({}), [])

  const prunePins = useCallback((validIds: Set<string>) => {
    setPins((prev) => {
      const next: Pins = {}
      let changed = false
      for (const [id, pos] of Object.entries(prev)) {
        if (validIds.has(id)) next[id] = pos
        else changed = true
      }
      return changed ? next : prev
    })
  }, [])

  return {
    hidden, toggleCategory,
    showArrows, setShowArrows,
    showGhosts, setShowGhosts,
    panelOpen, setPanelOpen,
    pins, pinNode, clearPins, prunePins,
  }
}
