import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db, createChapter, createScene, applyStructure } from '../../db'
import StructureControls from './StructureControls'

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await Promise.all([db.chapters.clear(), db.scenes.clear(), db.plotlines.clear(), db.beats.clear()])
})

describe('StructureControls', () => {
  it('applies a structure when picked', async () => {
    render(<StructureControls bookId="b1" />)
    fireEvent.change(await screen.findByLabelText(/story structure/i), { target: { value: 'snowflake' } })
    await waitFor(async () =>
      expect(await db.plotlines.where('bookId').equals('b1').and((p) => p.kind === 'structure').count()).toBe(1),
    )
  })

  it('lists unplaced beats and assigns one to a scene', async () => {
    const ch = await createChapter('b1', 'C')
    const sc = await createScene('b1', ch.id, 'Opening')
    await applyStructure('b1', 'snowflake')
    render(<StructureControls bookId="b1" />)
    const selects = await screen.findAllByLabelText(/assign beat/i)
    fireEvent.change(selects[0], { target: { value: sc.id } })
    await waitFor(async () => expect(await db.beats.where('sceneId').equals(sc.id).count()).toBe(1))
  })
})
