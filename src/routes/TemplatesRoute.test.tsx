import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, createPage, defaultInfobox } from '../db'
import TemplatesRoute from './TemplatesRoute'

afterEach(cleanup)

describe('TemplatesRoute — apply-changes prompt', () => {
  beforeEach(async () => {
    await db.pages.clear()
    await db.templates.clear()
    // One custom template used by two pages.
    await db.templates.add({
      id: 'tpl-hero', name: 'Hero', color: '#888', builtin: false,
      items: [{ label: 'Title' }],
    })
    await createPage({ title: 'Alice', category: 'Hero', infobox: await defaultInfobox('Hero') })
    await createPage({ title: 'Bob', category: 'Hero', infobox: await defaultInfobox('Hero') })
  })

  it('hides the prompt until a row is edited, then applies and collapses it', async () => {
    render(<MemoryRouter><TemplatesRoute /></MemoryRouter>)

    // The "Hero" template is auto-selected (only one). Wait for it to render.
    await screen.findByDisplayValue('Hero')

    // Initially quiet: no "you changed this type's rows" message.
    expect(screen.queryByText(/you changed this type’s rows/i)).toBeNull()

    // Edit a row: add a field. The prompt should appear with the page count.
    fireEvent.click(screen.getByText('＋ Add field'))
    expect(await screen.findByText(/you changed this type’s rows/i)).toBeTruthy()
    const applyBtn = screen.getByRole('button', { name: /apply to 2 existing pages/i })

    // Apply: prompt collapses and a success note appears.
    fireEvent.click(applyBtn)
    await waitFor(() =>
      expect(screen.queryByText(/you changed this type’s rows/i)).toBeNull(),
    )
    expect(screen.getByText(/updated 2 pages/i)).toBeTruthy()
  })
})
