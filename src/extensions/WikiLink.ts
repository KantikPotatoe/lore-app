import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { parseWikiToken } from '../wikiLink'

// ---------------------------------------------------------------------------
// WikiLink: an inline node that renders as a clickable link to another page.
//
// While editing, type  [[Some Page Title]]  and it turns into a link. Use
// [[Target|shown text]] to link to Target but display "shown text" (an alias /
// flavor link). The canonical target lives in `data-title`; the alias is purely
// cosmetic, so backlinks/graph/hover all keep resolving by title.
//
// Navigation is handled by a click listener in LoreEditor (reads `data-title`).
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
      // Optional alias text. Emitted as data-display only when it differs from
      // title (handled in renderHTML below), so plain links stay byte-identical.
      display: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-display') ?? '',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-wikilink]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { title, display } = node.attrs
    const aliased = display && display !== title
    return [
      'a',
      mergeAttributes(
        HTMLAttributes,
        aliased ? { 'data-display': display } : {},
        { 'data-wikilink': '', class: 'wiki-link' },
      ),
      aliased ? display : title,
    ]
  },

  // Lets you copy/paste the page as plain text and keep the [[...]] syntax.
  renderText({ node }) {
    const { title, display } = node.attrs
    return display && display !== title ? `[[${title}|${display}]]` : `[[${title}]]`
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ range, match, chain }) => {
          const parsed = parseWikiToken(match[1])
          if (!parsed) return
          chain()
            .deleteRange(range)
            .insertContent([
              { type: this.name, attrs: { title: parsed.target, display: parsed.display } },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
      }),
    ]
  },
})
