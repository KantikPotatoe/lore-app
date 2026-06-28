import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import MapPreviewCard from './MapPreviewCard'
import type { LorePage } from '../db'

afterEach(cleanup)

const page: LorePage = {
  id: 'p1',
  title: 'Riverford',
  category: 'Place',
  content: '',
  summary: 'A trade town on the delta.',
  tags: [],
  status: 'draft',
  createdAt: 1,
  updatedAt: 1,
}

describe('MapPreviewCard', () => {
  it('renders the linked page preview: title, summary, category chip', () => {
    render(
      <MapPreviewCard label="Riverford pin" page={page} isPortal={false}
        onEdit={() => {}} onOpenPage={() => {}} onClose={() => {}} />,
    )
    expect(screen.getByText('Riverford')).toBeTruthy()
    expect(screen.getByText('A trade town on the delta.')).toBeTruthy()
    expect(screen.getByText('Place')).toBeTruthy()
    expect(screen.getByText('Riverford pin')).toBeTruthy()
  })

  it('shows an unlinked hint and no Open page button when page is null', () => {
    render(
      <MapPreviewCard label="Unknown spot" page={null} isPortal={false}
        onEdit={() => {}} onClose={() => {}} />,
    )
    expect(screen.getByText('Unknown spot')).toBeTruthy()
    expect(screen.getByText(/not linked/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /open page/i })).toBeNull()
  })

  it('always offers Edit and fires onEdit', () => {
    const onEdit = vi.fn()
    render(
      <MapPreviewCard label="x" page={null} isPortal={false}
        onEdit={onEdit} onClose={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('offers Open page only when linked and fires onOpenPage', () => {
    const onOpenPage = vi.fn()
    render(
      <MapPreviewCard label="x" page={page} isPortal={false}
        onEdit={() => {}} onOpenPage={onOpenPage} onClose={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /open page/i }))
    expect(onOpenPage).toHaveBeenCalledOnce()
  })

  it('offers Enter map only when a portal and fires onEnterMap', () => {
    const onEnterMap = vi.fn()
    const { rerender } = render(
      <MapPreviewCard label="x" page={null} isPortal={false}
        onEdit={() => {}} onClose={() => {}} />,
    )
    expect(screen.queryByRole('button', { name: /enter map/i })).toBeNull()
    rerender(
      <MapPreviewCard label="x" page={null} isPortal={true}
        onEdit={() => {}} onEnterMap={onEnterMap} onClose={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /enter map/i }))
    expect(onEnterMap).toHaveBeenCalledOnce()
  })

  it('fires onClose from the × button', () => {
    const onClose = vi.fn()
    render(
      <MapPreviewCard label="x" page={null} isPortal={false}
        onEdit={() => {}} onClose={onClose} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
