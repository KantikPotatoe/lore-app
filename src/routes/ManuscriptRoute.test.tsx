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
})
