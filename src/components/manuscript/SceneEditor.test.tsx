import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Scene } from '../../db'
import SceneEditor from './SceneEditor'

const updateScene = vi.hoisted(() => vi.fn())
vi.mock('../../db', async (orig) => ({ ...(await orig<typeof import('../../db')>()), updateScene }))
// LoreEditor is heavy (Tiptap); stub it to a textarea that calls onChange.
vi.mock('../LoreEditor', () => ({
  default: ({ content, onChange }: { content: string; onChange: (h: string) => void }) => (
    <textarea aria-label="Prose" value={content} onChange={(e) => onChange(e.target.value)} />
  ),
}))

afterEach(() => { cleanup(); updateScene.mockClear() })

const scene: Scene = {
  id: 's1', bookId: 'b', chapterId: 'c', title: 'Opening', content: '<p>hi</p>',
  synopsis: '', notes: '', status: 'outline', order: 0, wordCount: 1, povPageId: null,
  castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: 1,
}

describe('SceneEditor', () => {
  it('persists a title edit', () => {
    render(<MemoryRouter><SceneEditor scene={scene} /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/scene title/i), { target: { value: 'Prologue' } })
    expect(updateScene).toHaveBeenCalledWith('s1', { title: 'Prologue' })
  })

  it('persists a prose edit', () => {
    render(<MemoryRouter><SceneEditor scene={scene} /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/prose/i), { target: { value: '<p>new</p>' } })
    expect(updateScene).toHaveBeenCalledWith('s1', { content: '<p>new</p>' })
  })
})
