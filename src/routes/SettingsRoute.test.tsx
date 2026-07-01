import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db'
import SettingsRoute from './SettingsRoute'

afterEach(cleanup)

describe('SettingsRoute', () => {
  beforeEach(async () => {
    await db.meta.clear()
    await db.snapshots.clear()
  })

  it('renders the sections and the snapshot policy control', async () => {
    render(<MemoryRouter><SettingsRoute /></MemoryRouter>)
    expect(await screen.findByText('Auto-snapshots')).toBeTruthy()
    expect(screen.getByText('Linking')).toBeTruthy()
    expect(screen.getByText('Backup & data')).toBeTruthy()
    expect(screen.getByText('Danger zone')).toBeTruthy()
    // snapshot retention input seeded from defaults (10)
    expect(await screen.findByLabelText(/keep newest/i)).toBeTruthy()
  })

  it('shows the autolink toggle checked by default', async () => {
    render(<MemoryRouter><SettingsRoute /></MemoryRouter>)
    const toggle = await screen.findByLabelText(/auto-link page titles/i)
    expect((toggle as HTMLInputElement).checked).toBe(true)
  })

  it('ignores a cleared (NaN) numeric input instead of persisting NaN', async () => {
    // Clearing a number input yields NaN from valueAsNumber; a NaN threshold breaks
    // snapshot logic (changed < NaN is always false), so it must be dropped.
    render(<MemoryRouter><SettingsRoute /></MemoryRouter>)
    const input = (await screen.findByLabelText(/Snapshot after this many changes/)) as HTMLInputElement
    fireEvent.change(input, { target: { value: '7' } })
    expect(input.value).toBe('7')
    fireEvent.change(input, { target: { value: '' } })
    // The NaN write is dropped, so the field keeps its last valid value.
    expect(input.value).toBe('7')
  })
})
