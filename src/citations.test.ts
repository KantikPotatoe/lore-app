import { describe, it, expect } from 'vitest'
import { parseCitations } from './citations'

const mark = (attrs: Record<string, string>) =>
  `<sup data-citation ${Object.entries(attrs).map(([k, v]) => `data-${k}="${v}"`).join(' ')}></sup>`

describe('parseCitations', () => {
  it('returns page + free-text citations in document order', () => {
    const html = `<p>A${mark({ target: 'Chronicle of the Vale', locator: 'Ch. 3', quote: 'founded 312' })}` +
      ` B${mark({ text: "Merchant's Ledger" })}</p>`
    expect(parseCitations(html)).toEqual([
      { target: 'Chronicle of the Vale', text: '', locator: 'Ch. 3', quote: 'founded 312' },
      { target: '', text: "Merchant's Ledger", locator: '', quote: '' },
    ])
  })

  it('skips a marker with neither target nor text', () => {
    expect(parseCitations(`<p>x${mark({ locator: 'p.1' })}</p>`)).toEqual([])
  })

  it('returns [] for empty or marker-free html', () => {
    expect(parseCitations('')).toEqual([])
    expect(parseCitations('<p>nothing here</p>')).toEqual([])
  })
})
