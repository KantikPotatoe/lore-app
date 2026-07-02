import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import type { Scene } from '../../db'
import SceneMetaPanel from './SceneMetaPanel'

const updateScene = vi.hoisted(() => vi.fn())
vi.mock('../../db', async (orig) => ({ ...(await orig<typeof import('../../db')>()), updateScene }))

afterEach(() => { cleanup(); updateScene.mockClear() })

const scene: Scene = {
  id: 's1', bookId: 'b', chapterId: 'c', title: 'S', content: '', synopsis: '',
  notes: '', status: 'outline', order: 0, wordCount: 0, povPageId: null,
  castPageIds: [], locationPageIds: [], createdAt: 1, updatedAt: 1,
}

describe('SceneMetaPanel', () => {
  it('persists a status change', () => {
    render(<SceneMetaPanel scene={scene} />)
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'draft' } })
    expect(updateScene).toHaveBeenCalledWith('s1', { status: 'draft' })
  })

  it('persists a synopsis edit', () => {
    render(<SceneMetaPanel scene={scene} />)
    fireEvent.change(screen.getByLabelText(/synopsis/i), { target: { value: 'A duel at dawn' } })
    expect(updateScene).toHaveBeenCalledWith('s1', { synopsis: 'A duel at dawn' })
  })
})
