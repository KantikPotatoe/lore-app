import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import References from './References'

afterEach(cleanup)

const mark = (attrs: Record<string, string>) =>
  `<sup data-citation ${Object.entries(attrs).map(([k, v]) => `data-${k}="${v}"`).join(' ')}></sup>`

describe('References', () => {
  it('renders nothing when there are no citations', () => {
    const { container } = render(
      <References content="<p>no marks</p>" onWikiClick={() => {}} onBackref={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a numbered list with a page link and free text', () => {
    const content = `<p>a${mark({ target: 'Frodo', locator: 'p.2' })} b${mark({ text: 'Ledger' })}</p>`
    const onWikiClick = vi.fn()
    render(
      <References
        content={content}
        knownTitles={new Set(['frodo'])}
        onWikiClick={onWikiClick}
        onBackref={() => {}}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    fireEvent.click(screen.getByText('Frodo'))
    expect(onWikiClick).toHaveBeenCalledWith('Frodo')
    expect(screen.getByText(/Ledger/)).toBeTruthy()
    expect(screen.getByText(/p\.2/)).toBeTruthy()
  })

  it('marks a page link to a missing page as broken', () => {
    const content = `<p>a${mark({ target: 'Ghost' })}</p>`
    render(<References content={content} knownTitles={new Set()} onWikiClick={() => {}} onBackref={() => {}} />)
    expect(screen.getByText('Ghost').className).toContain('is-broken')
  })
})
