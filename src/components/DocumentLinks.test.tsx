import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, createPage, attachDocument } from '../db'
import DocumentLinks from './DocumentLinks'

afterEach(cleanup)

async function getPage(id: string) {
  const p = await db.pages.get(id)
  if (!p) throw new Error('missing page')
  return p
}

function renderLinks(page: Parameters<typeof DocumentLinks>[0]['page'], editable = false) {
  return render(
    <MemoryRouter>
      <DocumentLinks page={page} editable={editable} />
    </MemoryRouter>,
  )
}

describe('DocumentLinks', () => {
  beforeEach(async () => {
    await db.pages.clear()
    await db.docLinks.clear()
  })

  it('renders nothing in view mode when there are no attachments', async () => {
    const s = await createPage({ title: 'Alice' })
    const { container } = renderLinks(await getPage(s), false)
    // Wait a tick for useLiveQuery, then assert empty.
    await new Promise((r) => setTimeout(r, 0))
    expect(container.textContent).toBe('')
  })

  it('lists attached documents in view mode', async () => {
    const s = await createPage({ title: 'Alice' })
    const d = await createPage({ title: 'The Letter', category: 'Document' })
    await attachDocument(s, d)
    renderLinks(await getPage(s), false)
    expect(await screen.findByText('The Letter')).toBeTruthy()
  })

  it('shows "Attached to" on a document that has inbound edges', async () => {
    const s = await createPage({ title: 'Alice' })
    const d = await createPage({ title: 'The Letter', category: 'Document' })
    await attachDocument(s, d)
    renderLinks(await getPage(d), false)
    expect(await screen.findByText(/attached to/i)).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
  })

  it('removes an attachment when the × button is clicked in edit mode', async () => {
    const s = await createPage({ title: 'Alice' })
    const d = await createPage({ title: 'The Letter', category: 'Document' })
    await attachDocument(s, d)
    renderLinks(await getPage(s), true)
    fireEvent.click(await screen.findByTitle('Remove attachment'))
    // NOTE: deviation from the brief's exact test code — a single 0ms tick was
    // not enough for the dexie-react-hooks liveQuery observable to propagate
    // the delete through fake-indexeddb in this environment (verified: 0ms
    // failed deterministically, 50ms/300ms passed reliably across repeats).
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByText('The Letter')).toBeNull()
    expect(await db.docLinks.count()).toBe(0)
  })
})
