import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db'
import BookRoute from './BookRoute'

afterEach(async () => {
  cleanup()
  await Promise.all([db.books.clear(), db.chapters.clear(), db.scenes.clear()])
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/book/:bookId" element={<BookRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BookRoute', () => {
  it('shows the book title and Write/Grid toggle', async () => {
    await db.books.add({ id: 'b1', title: 'My Novel', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 })
    renderAt('/book/b1')
    expect(await screen.findByText('My Novel')).toBeTruthy()
    expect(screen.getByRole('button', { name: /write/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /grid/i })).toBeTruthy()
  })

  it('switches to the grid view', async () => {
    await db.books.add({ id: 'b1', title: 'My Novel', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 })
    renderAt('/book/b1')
    fireEvent.click(await screen.findByRole('button', { name: /grid/i }))
    expect(await screen.findByText(/no plotlines yet/i)).toBeTruthy()
  })
})
