import { Node, mergeAttributes, InputRule } from '@tiptap/core'

// ---------------------------------------------------------------------------
// WikiLink: an inline node that renders as a clickable link to another page.
//
// While editing, type  [[Some Page Title]]  and it turns into a link.
// Clicking it (in view mode) jumps to that page, creating it if it doesn't
// exist yet — just like Obsidian or World Anvil's article links.
//
// The actual navigation is handled by a click listener in LoreEditor, which
// reads the `data-title` attribute. This keeps the node itself simple.
// ---------------------------------------------------------------------------

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true, // treated as a single unit, not editable character-by-character
  selectable: true,

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title'),
        renderHTML: (attrs) => ({ 'data-title': attrs.title }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-wikilink]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, { 'data-wikilink': '', class: 'wiki-link' }),
      node.attrs.title,
    ]
  },

  // Lets you copy/paste the page as plain text and keep the [[...]] syntax.
  renderText({ node }) {
    return `[[${node.attrs.title}]]`
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ range, match, chain }) => {
          const title = match[1].trim()
          if (!title) return
          chain()
            .deleteRange(range)
            .insertContent([
              { type: this.name, attrs: { title } },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
      }),
    ]
  },
})
