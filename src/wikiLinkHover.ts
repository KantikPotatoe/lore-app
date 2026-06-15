import { useState, useEffect } from 'react'

export interface HoverTarget {
  title: string
  rect: DOMRect
}

type Listener = (t: HoverTarget | null) => void
const listeners = new Set<Listener>()

let openTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

function broadcast(target: HoverTarget | null) {
  for (const l of listeners) l(target)
}

/** Call on wiki-link mouseenter. Shows the popover after a 300ms delay. */
export function showWikiHover(title: string, rect: DOMRect): void {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
  if (openTimer) clearTimeout(openTimer)
  openTimer = setTimeout(() => { openTimer = null; broadcast({ title, rect }) }, 300)
}

/** Call on wiki-link mouseleave. Closes after 150ms (cancelable by the popover). */
export function scheduleWikiHoverClose(): void {
  if (openTimer) { clearTimeout(openTimer); openTimer = null }
  closeTimer = setTimeout(() => { closeTimer = null; broadcast(null) }, 150)
}

/** Call on popover mouseenter to keep it open when the cursor moves into it. */
export function cancelWikiHoverClose(): void {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
}

/** React hook: subscribe to hover state. Returns null when no link is hovered. */
export function useWikiHoverTarget(): HoverTarget | null {
  const [target, setTarget] = useState<HoverTarget | null>(null)
  useEffect(() => {
    listeners.add(setTarget)
    return () => { listeners.delete(setTarget) }
  }, [])
  return target
}
