import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import EmptyState from './EmptyState'

afterEach(cleanup)

describe('EmptyState', () => {
  it('renders the ornament, title, message, and CTA children', () => {
    render(
      <EmptyState icon="📜" title="Your world is unwritten" message="Begin with a page.">
        <button>Create</button>
      </EmptyState>,
    )
    expect(screen.getByText('Your world is unwritten')).toBeTruthy()
    expect(screen.getByText('Begin with a page.')).toBeTruthy()
    expect(screen.getByText('📜')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
  })

  it('omits the message and actions when not provided', () => {
    const { container } = render(<EmptyState icon="🗺️" title="No map yet" />)
    expect(screen.getByText('No map yet')).toBeTruthy()
    expect(container.querySelector('.empty-state-msg')).toBeNull()
    expect(container.querySelector('.empty-state-actions')).toBeNull()
  })
})
