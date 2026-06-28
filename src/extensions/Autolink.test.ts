import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { WikiLink } from './WikiLink'
import { Autolink, autolinkKey } from './Autolink'

// Headless integration check: mount a real Tiptap editor in view mode with the
// Autolink plugin, feed it titles via the meta transaction, and assert the
// decoration pipeline (doc walk → planAutolinks → Decoration.inline) renders.

function makeEditor(content: string, editable: boolean): Editor {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({ element, extensions: [StarterKit, WikiLink, Autolink], content, editable })
}

function setTitles(editor: Editor, titles: string[], enabled: boolean) {
  editor.view.dispatch(editor.state.tr.setMeta(autolinkKey, { enabled, titles }))
}

let editors: Editor[] = []
function track(e: Editor): Editor { editors.push(e); return e }
afterEach(() => { editors.forEach((e) => e.destroy()); editors = [] })

describe('Autolink extension (view mode)', () => {
  it('wraps the first mention of a known title in an autolink span', () => {
    const editor = track(makeEditor('<p>The Iron Guard marched.</p>', false))
    setTitles(editor, ['Iron Guard'], true)
    const spans = editor.view.dom.querySelectorAll('.wiki-link.autolink')
    expect(spans.length).toBe(1)
    expect(spans[0].getAttribute('data-title')).toBe('Iron Guard')
    expect(spans[0].textContent).toBe('Iron Guard')
  })

  it('links only the first occurrence per page', () => {
    const editor = track(makeEditor('<p>Iron Guard, then Iron Guard again.</p>', false))
    setTitles(editor, ['Iron Guard'], true)
    expect(editor.view.dom.querySelectorAll('.autolink').length).toBe(1)
  })

  it('produces no autolinks while editing', () => {
    const editor = track(makeEditor('<p>The Iron Guard marched.</p>', true))
    setTitles(editor, ['Iron Guard'], true)
    expect(editor.view.dom.querySelectorAll('.autolink').length).toBe(0)
  })

  it('produces no autolinks when disabled', () => {
    const editor = track(makeEditor('<p>The Iron Guard marched.</p>', false))
    setTitles(editor, ['Iron Guard'], false)
    expect(editor.view.dom.querySelectorAll('.autolink').length).toBe(0)
  })

  it('does not autolink text already inside a manual wiki link', () => {
    const editor = track(makeEditor(
      '<p>See <a data-wikilink data-title="Iron Guard">Iron Guard</a> and Iron Guard.</p>',
      false,
    ))
    setTitles(editor, ['Iron Guard'], true)
    // The manual link stays; the later plain mention is not auto-linked (preSeen).
    expect(editor.view.dom.querySelectorAll('.autolink').length).toBe(0)
  })

  it('does not autolink inside a heading', () => {
    const editor = track(makeEditor('<h2>Iron Guard</h2><p>plain</p>', false))
    setTitles(editor, ['Iron Guard'], true)
    expect(editor.view.dom.querySelectorAll('.autolink').length).toBe(0)
  })

  it('skips building the matcher while disabled (no wasted regex work)', () => {
    const editor = track(makeEditor('<p>The Iron Guard marched.</p>', false))
    setTitles(editor, ['Iron Guard'], false)
    expect(autolinkKey.getState(editor.state)!.matcher).toBeNull()
  })

  it('builds the matcher when enabled', () => {
    const editor = track(makeEditor('<p>The Iron Guard marched.</p>', false))
    setTitles(editor, ['Iron Guard'], true)
    expect(autolinkKey.getState(editor.state)!.matcher).not.toBeNull()
  })
})
