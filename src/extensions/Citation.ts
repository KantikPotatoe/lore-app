import { Node, mergeAttributes } from '@tiptap/core'

// ---------------------------------------------------------------------------
// Citation: an inline atom rendered as a superscript marker that cites a claim
// to an in-world source — either a lore page (`target`, the page title) or free
// text (`text`), with an optional `locator` ("Ch. 3") and `quote`. The visible
// number is NOT stored: it comes from a CSS counter over document order (see
// index.css), so markers renumber automatically. The References component
// (src/components/References.tsx) lists the sources in the same order.
//
// Insertion/editing is driven by a dialog in LoreEditor; view-mode clicks scroll
// to the matching reference (handled in LoreEditor.handleClick).
// ---------------------------------------------------------------------------

const attr = (name: string) => ({
  default: '',
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? '',
  // Only emit the attribute when non-empty, so plain markers stay compact.
  renderHTML: (attrs: Record<string, string>) =>
    attrs[name] ? { [`data-${name}`]: attrs[name] } : {},
})

export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { target: attr('target'), text: attr('text'), locator: attr('locator'), quote: attr('quote') }
  },

  parseHTML() {
    return [{ tag: 'sup[data-citation]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes, { 'data-citation': '', class: 'citation' })]
  },

  // Plain-text copy/paste: [^Source] or [^Source, locator].
  renderText({ node }) {
    const { target, text, locator } = node.attrs
    const source = target || text
    return locator ? `[^${source}, ${locator}]` : `[^${source}]`
  },
})
