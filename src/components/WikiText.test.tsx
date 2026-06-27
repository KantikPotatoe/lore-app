import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import WikiText from './WikiText'

afterEach(cleanup)

describe('WikiText', () => {
  it('renders alias display text but links the target', () => {
    const onWikiClick = vi.fn()
    render(
      <WikiText
        value="Met [[Odrian Borinor|the stranger]] today"
        onWikiClick={onWikiClick}
        knownTitles={new Set(['odrian borinor'])}
      />,
    )
    const link = screen.getByText('the stranger')
    expect(link.className).toBe('wiki-link') // not broken — target is known
    fireEvent.click(link)
    expect(onWikiClick).toHaveBeenCalledWith('Odrian Borinor')
  })

  it('renders a plain link with its title', () => {
    const onWikiClick = vi.fn()
    render(<WikiText value="See [[Veldhaven]]." onWikiClick={onWikiClick} knownTitles={new Set(['veldhaven'])} />)
    fireEvent.click(screen.getByText('Veldhaven'))
    expect(onWikiClick).toHaveBeenCalledWith('Veldhaven')
  })

  it('marks an alias broken when the target is unknown', () => {
    render(
      <WikiText
        value="[[Nowhere|somewhere]]"
        onWikiClick={() => {}}
        knownTitles={new Set(['veldhaven'])}
      />,
    )
    expect(screen.getByText('somewhere').className).toBe('wiki-link is-broken')
  })
})
