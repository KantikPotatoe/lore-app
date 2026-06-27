// src/extensions/Citation.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Citation } from './Citation'

let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })

function mount(attrs: { target?: string; text?: string; locator?: string; quote?: string }) {
  editor = new Editor({
    extensions: [StarterKit, Citation],
    content: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'citation', attrs: { target: '', text: '', locator: '', quote: '', ...attrs } }],
      }],
    },
  })
  return editor
}

describe('Citation node', () => {
  it('renders a <sup data-citation> with the source data-* attributes', () => {
    const html = mount({ target: 'Chronicle of the Vale', locator: 'Ch. 3' }).getHTML()
    expect(html).toContain('data-citation')
    expect(html).toContain('data-target="Chronicle of the Vale"')
    expect(html).toContain('data-locator="Ch. 3"')
    expect(html).toContain('class="citation"')
  })

  it('omits empty data-* attributes', () => {
    const html = mount({ text: 'Oral tradition' }).getHTML()
    expect(html).toContain('data-text="Oral tradition"')
    expect(html).not.toContain('data-target')
    expect(html).not.toContain('data-quote')
  })

  it('serializes to plain text via renderText', () => {
    expect(mount({ target: 'Frodo', locator: 'p.2' }).getText()).toBe('[^Frodo, p.2]')
    expect(mount({ text: 'Ledger' }).getText()).toBe('[^Ledger]')
  })

  it('parses an existing <sup data-citation> back into a node', () => {
    editor = new Editor({
      extensions: [StarterKit, Citation],
      content: '<p>x<sup data-citation data-target="Frodo" data-locator="p.2" class="citation"></sup></p>',
    })
    expect(editor.getText()).toBe('x[^Frodo, p.2]')
  })
})
