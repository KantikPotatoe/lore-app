import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'
import DraftInput from './DraftInput'

afterEach(cleanup)

// Faithful model of a keystroke against a CONTROLLED input: the browser appends
// one character to whatever the field currently shows, then fires `input`.
// Between fireEvent calls React re-renders and resets the DOM value to its
// controlled value — so if that controlled value lags behind, the append starts
// from a stale (shorter) string and characters are lost. This is exactly the
// mechanism behind issue #116.
function keystrokes(input: HTMLInputElement, text: string) {
  for (const ch of text) {
    fireEvent.change(input, { target: { value: input.value + ch } })
  }
}

describe('DraftInput — keystroke retention (issue #116)', () => {
  // Control: prove the harness actually detects the bug against a naive input
  // whose value round-trips through an async write (like updatePage + useLiveQuery).
  it('CONTROL: a naive async-controlled input loses characters', () => {
    function Naive() {
      const [value, setValue] = useState('')
      // The persisted value only catches up on a later tick.
      const onChange = (v: string) => { setTimeout(() => setValue(v), 0) }
      return <input aria-label="f" value={value} onChange={(e) => onChange(e.target.value)} />
    }
    render(<Naive />)
    const input = screen.getByLabelText('f') as HTMLInputElement

    keystrokes(input, 'Champion')

    expect(input.value).not.toBe('Champion') // characters were dropped
  })

  it('retains every character typed faster than the persist round-trip', () => {
    function Harness() {
      const [value, setValue] = useState('')
      // onCommit is the persist step; its result flows back into `value`.
      return <DraftInput aria-label="f" value={value} onCommit={setValue} delay={300} />
    }
    render(<Harness />)
    const input = screen.getByLabelText('f') as HTMLInputElement

    fireEvent.focus(input)
    keystrokes(input, 'Champion')

    expect(input.value).toBe('Champion')
  })
})
