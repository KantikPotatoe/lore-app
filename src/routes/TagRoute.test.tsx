import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db, createPage } from '../db'
import TagRoute from './TagRoute'

afterEach(cleanup)

function renderAt(tag: string) {
  return render(
    <MemoryRouter initialEntries={[`/tag/${tag}`]}>
      <Routes>
        <Route path="/tag/:tag" element={<TagRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TagRoute', () => {
  beforeEach(async () => {
    await db.pages.clear()
  })

  it('lists pages carrying the tag and excludes others', async () => {
    await createPage({ title: 'Fireball', tags: ['magic'] })
    await createPage({ title: 'Wizard Tower', tags: ['magic', 'places'] })
    await createPage({ title: 'Tavern', tags: ['places'] })

    renderAt('magic')

    expect(await screen.findByText('Fireball')).toBeTruthy()
    expect(screen.getByText('Wizard Tower')).toBeTruthy()
    expect(screen.queryByText('Tavern')).toBeNull()
  })

  it('shows the empty state for a tag no page uses', async () => {
    await createPage({ title: 'Fireball', tags: ['magic'] })

    renderAt('nonexistent')

    expect(await screen.findByText(/no pages tagged/i)).toBeTruthy()
  })
})
