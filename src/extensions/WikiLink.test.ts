import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { WikiLink } from './WikiLink'

let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })

function mount(inner: { title: string; display?: string }) {
  editor = new Editor({
    extensions: [StarterKit, WikiLink],
    content: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'wikiLink', attrs: { title: inner.title, display: inner.display ?? '' } }],
      }],
    },
  })
  return editor
}

describe('WikiLink node', () => {
  it('renders an alias: display text as content, data-display attribute', () => {
    const html = mount({ title: 'Odrian Borinor', display: 'the stranger' }).getHTML()
    expect(html).toContain('data-title="Odrian Borinor"')
    expect(html).toContain('data-display="the stranger"')
    expect(html).toContain('>the stranger</a>')
  })

  it('omits data-display for a plain link (display empty or equal to title)', () => {
    expect(mount({ title: 'Veldhaven' }).getHTML()).not.toContain('data-display')
    expect(mount({ title: 'Veldhaven', display: 'Veldhaven' }).getHTML()).not.toContain('data-display')
  })

  it('serializes to [[title|display]] and [[title]] via renderText', () => {
    expect(mount({ title: 'Odrian Borinor', display: 'the stranger' }).getText())
      .toBe('[[Odrian Borinor|the stranger]]')
    expect(mount({ title: 'Veldhaven' }).getText()).toBe('[[Veldhaven]]')
  })

  it('parses data-display back into the display attribute', () => {
    editor = new Editor({
      extensions: [StarterKit, WikiLink],
      content: '<p><a data-wikilink data-title="Odrian Borinor" data-display="the stranger">the stranger</a></p>',
    })
    expect(editor.getText()).toBe('[[Odrian Borinor|the stranger]]')
  })
})
