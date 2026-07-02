import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** The persisted value (e.g. from a `useLiveQuery` read). */
  value: string
  /** Persist a changed value. Debounced while typing; flushed on blur/unmount. */
  onCommit: (value: string) => void
  /** Debounce window in ms before an edit is persisted (default 300). */
  delay?: number
}

/**
 * A text input whose displayed value is held in LOCAL state, decoupled from the
 * async persisted `value`. Fields that write to Dexie on every keystroke and read
 * the result back through `useLiveQuery` otherwise lose characters when you type
 * faster than the DB round-trip: a stale, shorter value lands mid-typing and
 * resets the controlled input (see issue #116). Holding the draft locally and
 * persisting on a debounce fixes that while staying reactive to external changes.
 */
export default function DraftInput({ value, onCommit, delay = 300, onFocus, onBlur, ...rest }: Props) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<string | null>(null)
  // Keep the latest onCommit reachable from the debounce timer / cleanup without
  // resetting the timer each render.
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })

  // Reflect external changes (rename cascades, imports, another tab) — but never
  // while the user is mid-edit, or we'd clobber their in-flight typing.
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])

  // Flush any pending write when the field unmounts (leaving edit mode, navigating).
  useEffect(() => {
    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current)
      if (pending.current !== null) {
        commit.current(pending.current)
        pending.current = null
      }
    }
  }, [])

  function flush() {
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
    if (pending.current !== null) {
      commit.current(pending.current)
      pending.current = null
    }
  }

  function schedule(next: string) {
    pending.current = next
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = undefined
      flush()
    }, delay)
  }

  return (
    <input
      {...rest}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        schedule(e.target.value)
      }}
      onFocus={(e) => {
        focused.current = true
        onFocus?.(e)
      }}
      onBlur={(e) => {
        focused.current = false
        flush()
        onBlur?.(e)
      }}
    />
  )
}
