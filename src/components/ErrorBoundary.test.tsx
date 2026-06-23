import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

// A child that throws during render, to trip the boundary on demand.
function Boom({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) throw new Error('kaboom')
  return <div>all good</div>
}

afterEach(cleanup)

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('all good')).toBeTruthy()
    expect(screen.queryByText('Something went wrong')).toBeNull()
  })

  it('renders the recovery UI when a child throws during render', () => {
    // React logs the caught error to console.error; silence it for clean output.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(
        <ErrorBoundary>
          <Boom explode={true} />
        </ErrorBoundary>,
      )
    } finally {
      spy.mockRestore()
    }

    // Fallback is shown instead of a blank page...
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.queryByText('all good')).toBeNull()
    // ...and the recovery escape hatch (download a backup) is present.
    expect(screen.getByRole('button', { name: /download a backup/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reload the app/i })).toBeTruthy()
  })
})
