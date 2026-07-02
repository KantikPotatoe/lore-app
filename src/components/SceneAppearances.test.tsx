import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, createBook, createChapter, createScene, updateScene } from '../db'
import SceneAppearances from './SceneAppearances'

afterEach(async () => {
  cleanup()
  await Promise.all([db.pages.clear(), db.books.clear(), db.chapters.clear(), db.scenes.clear()])
})

async function seedPage(id: string, title: string) {
  await db.pages.add({
    id, title, category: 'Character', content: '', summary: '', tags: [],
    createdAt: 1, updatedAt: 1,
  } as never)
}

describe('SceneAppearances', () => {
  it('lists the scenes a page appears in', async () => {
    await seedPage('alice', 'Alice')
    const book = await createBook('The Saga')
    const ch = await createChapter(book.id, 'Chapter One')
    const sc = await createScene(book.id, ch.id, 'The Meeting')
    await updateScene(sc.id, { povPageId: 'alice' })
    render(<MemoryRouter><SceneAppearances pageId="alice" /></MemoryRouter>)
    expect(await screen.findByText('The Meeting')).toBeTruthy()
    expect(screen.getByText(/appears in/i)).toBeTruthy()
    expect(screen.getByText(/pov/i)).toBeTruthy()
  })

  it('renders nothing when the page has no appearances', async () => {
    await seedPage('nobody', 'Nobody')
    const { container } = render(<MemoryRouter><SceneAppearances pageId="nobody" /></MemoryRouter>)
    await new Promise((r) => setTimeout(r, 0))
    expect(container.textContent).toBe('')
  })
})
