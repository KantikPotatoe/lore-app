import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, createChapter, createScene } from '../../db'
import BookWriteView from './BookWriteView'

// Stub LoreEditor (Tiptap) as in SceneEditor's test.
vi.mock('../LoreEditor', () => ({
  default: ({ content }: { content: string }) => <div data-testid="prose">{content}</div>,
}))

afterEach(async () => {
  cleanup()
  await Promise.all([db.chapters.clear(), db.scenes.clear()])
})

describe('BookWriteView', () => {
  it('shows an empty hint when no scene is selected', async () => {
    render(
      <MemoryRouter>
        <BookWriteView bookId="b1" selectedSceneId={null} onSelectScene={() => {}} />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/select a scene/i)).toBeTruthy()
  })

  it('renders the selected scene editor', async () => {
    const ch = await createChapter('b1', 'Ch')
    const sc = await createScene('b1', ch.id, 'Opening')
    render(
      <MemoryRouter>
        <BookWriteView bookId="b1" selectedSceneId={sc.id} onSelectScene={() => {}} />
      </MemoryRouter>,
    )
    expect(await screen.findByDisplayValue('Opening')).toBeTruthy()
  })
})
