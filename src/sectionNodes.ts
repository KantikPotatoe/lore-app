import type { JSONContent } from '@tiptap/core'

/** Turn starter-section names into Tiptap nodes: each non-empty (trimmed) name
 *  becomes an <h2> heading followed by an empty paragraph, so the author can
 *  drop a type's whole section skeleton into a page body and start typing under
 *  each heading. Names go in as text nodes — never raw HTML. */
export function sectionNodes(names: string[]): JSONContent[] {
  return names
    .map((n) => n.trim())
    .filter(Boolean)
    .flatMap((name) => [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: name }] },
      { type: 'paragraph' },
    ])
}
