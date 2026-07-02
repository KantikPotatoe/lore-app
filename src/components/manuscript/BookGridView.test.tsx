import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db, createChapter, createScene, createPlotline, createBeat, applyStructure } from '../../db'
import BookGridView from './BookGridView'

afterEach(async () => {
  cleanup()
  await Promise.all([db.chapters.clear(), db.scenes.clear(), db.plotlines.clear(), db.beats.clear()])
})

describe('BookGridView', () => {
  it('renders plotline lanes, scene columns and beat notes', async () => {
    const ch = await createChapter('b1', 'Chapter One')
    const sc = await createScene('b1', ch.id, 'Opening')
    const pl = await createPlotline('b1', 'Main Arc')
    await createBeat('b1', pl.id, sc.id, 'hero departs')
    render(<BookGridView bookId="b1" />)
    expect(await screen.findByDisplayValue('Main Arc')).toBeTruthy()
    expect(await screen.findByText('Opening')).toBeTruthy()
    expect(await screen.findByText('hero departs')).toBeTruthy()
  })

  it('shows an empty hint when there are no plotlines', async () => {
    render(<BookGridView bookId="b1" />)
    expect(await screen.findByText(/no plotlines yet/i)).toBeTruthy()
  })

  it('creates a beat by typing in an empty cell', async () => {
    const ch = await createChapter('b1', 'C')
    const sc = await createScene('b1', ch.id, 'Opening')
    const pl = await createPlotline('b1', 'Main')
    render(<BookGridView bookId="b1" />)
    const cell = await screen.findByLabelText(`beat ${pl.id}:${sc.id}`)
    fireEvent.click(cell)
    const editor = await screen.findByRole('textbox', { name: /beat note/i })
    fireEvent.change(editor, { target: { value: 'inciting incident' } })
    fireEvent.blur(editor)
    await waitFor(async () => expect(await db.beats.where('bookId').equals('b1').count()).toBe(1))
  })

  it('renames a lane', async () => {
    const pl = await createPlotline('b1', 'Main')
    render(<BookGridView bookId="b1" />)
    const input = await screen.findByDisplayValue('Main')
    fireEvent.change(input, { target: { value: 'Central Arc' } })
    await waitFor(async () => expect((await db.plotlines.get(pl.id))?.name).toBe('Central Arc'))
  })

  it('deletes a lane', async () => {
    const pl = await createPlotline('b1', 'Doomed')
    render(<BookGridView bookId="b1" />)
    fireEvent.click(await screen.findByRole('button', { name: `delete lane ${pl.id}` }))
    await waitFor(async () => expect(await db.plotlines.get(pl.id)).toBeUndefined())
  })

  it('renders a placed structure beat with its label in the structure lane', async () => {
    const ch = await createChapter('b1', 'C')
    const sc = await createScene('b1', ch.id, 'Opening')
    await applyStructure('b1', 'save-the-cat')
    const lane = await db.plotlines.where('bookId').equals('b1').and((p) => p.kind === 'structure').first()
    const catalyst = (await db.beats.where('plotlineId').equals(lane!.id).toArray()).find((b) => b.label === 'Catalyst')!
    await db.beats.update(catalyst.id, { sceneId: sc.id })
    render(<BookGridView bookId="b1" />)
    expect(await screen.findByText('Catalyst')).toBeTruthy()
  })

  it('unplaces a structure beat back to the tray', async () => {
    const ch = await createChapter('b1', 'C')
    const sc = await createScene('b1', ch.id, 'Opening')
    await applyStructure('b1', 'snowflake')
    const lane = await db.plotlines.where('bookId').equals('b1').and((p) => p.kind === 'structure').first()
    const beat = (await db.beats.where('plotlineId').equals(lane!.id).toArray())[0]
    await db.beats.update(beat.id, { sceneId: sc.id })
    render(<BookGridView bookId="b1" />)
    fireEvent.click(await screen.findByRole('button', { name: `unplace beat ${beat.id}` }))
    await waitFor(async () => expect((await db.beats.get(beat.id))?.sceneId).toBeNull())
  })
})
