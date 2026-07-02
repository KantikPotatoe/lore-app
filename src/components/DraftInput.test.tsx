import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import DraftInput from './DraftInput'

afterEach(cleanup)

describe('DraftInput', () => {
  it('keeps typed text when the value prop lags behind while focused', () => {
    // Reproduces the infobox/summary keystroke-loss bug: the field's value
    // round-trips through an async write, so the prop briefly holds a stale,
    // shorter value. The input must not reset to that stale value mid-typing.
    const { rerender } = render(<DraftInput value="" onCommit={() => {}} />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Hello' } })

    // The async round-trip lands with only the first character committed.
    rerender(<DraftInput value="H" onCommit={() => {}} />)

    expect(input.value).toBe('Hello')
  })

  it('debounces onCommit and commits the latest value once', () => {
    vi.useFakeTimers()
    try {
      const onCommit = vi.fn()
      render(<DraftInput value="" onCommit={onCommit} delay={300} />)
      const input = screen.getByRole('textbox') as HTMLInputElement

      fireEvent.change(input, { target: { value: 'a' } })
      fireEvent.change(input, { target: { value: 'ab' } })
      fireEvent.change(input, { target: { value: 'abc' } })
      expect(onCommit).not.toHaveBeenCalled()

      act(() => { vi.advanceTimersByTime(300) })

      expect(onCommit).toHaveBeenCalledTimes(1)
      expect(onCommit).toHaveBeenCalledWith('abc')
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes the pending commit immediately on blur', () => {
    const onCommit = vi.fn()
    render(<DraftInput value="" onCommit={onCommit} delay={300} />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('x')
  })

  it('adopts external value changes when the field is not focused', () => {
    const { rerender } = render(<DraftInput value="one" onCommit={() => {}} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('one')

    rerender(<DraftInput value="two" onCommit={() => {}} />)

    expect(input.value).toBe('two')
  })

  it('flushes the pending commit on unmount', () => {
    const onCommit = vi.fn()
    const { unmount } = render(<DraftInput value="" onCommit={onCommit} delay={300} />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'y' } })
    unmount()

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('y')
  })
})
