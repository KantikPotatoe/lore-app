import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db'
import ManuscriptRoute from './ManuscriptRoute'

afterEach(async () => {
  cleanup()
  await Promise.all([db.books.clear(), db.chapters.clear(), db.scenes.clear()])
})

describe('ManuscriptRoute', () => {
  it('renders the Manuscript heading', () => {
    render(
      <MemoryRouter>
        <ManuscriptRoute />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /manuscript/i })).toBeTruthy()
  })

  it('lists existing books', async () => {
    await db.books.add({ id: 'b1', title: 'The Long Road', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 })
    render(
      <MemoryRouter>
        <ManuscriptRoute />
      </MemoryRouter>,
    )
    expect(await screen.findByText('The Long Road')).toBeTruthy()
  })

  it('shows an empty hint when there are no books', async () => {
    render(
      <MemoryRouter>
        <ManuscriptRoute />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/no books yet/i)).toBeTruthy()
  })
})
