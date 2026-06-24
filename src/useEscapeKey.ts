import { useEffect, useRef } from 'react'

/** Call `handler` whenever Escape is pressed while `active` is true.
 *  Used by modals and pop-out panels so Esc always backs out of the UI.
 *  The handler is kept in a ref so passing an inline arrow doesn't re-subscribe
 *  the listener on every render. Disable (`active = false`) when a nested
 *  overlay (e.g. a ConfirmDialog) should own Escape instead. */
export function useEscapeKey(handler: () => void, active = true): void {
  const ref = useRef(handler)
  useEffect(() => { ref.current = handler })

  useEffect(() => {
    if (!active) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') ref.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}
