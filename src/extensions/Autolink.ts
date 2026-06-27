import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { buildTitleMatcher, planAutolinks, type TitleMatcher } from '../autolink'

// ---------------------------------------------------------------------------
// Autolink: a view-only ProseMirror decoration plugin. It scans the rendered
// body for mentions of known page titles and wraps the FIRST mention of each as
// a wiki-link span. Decorations never enter getHTML(), so nothing is written to
// storage — renaming/creating a page just re-links every body on next render.
//
// Driven from React via a meta transaction:
//   editor.view.dispatch(tr.setMeta(autolinkKey, { enabled, titles }))
// ---------------------------------------------------------------------------

export const autolinkKey = new PluginKey<AutolinkState>('autolink')

interface AutolinkState {
  enabled: boolean
  matcher: TitleMatcher | null
}

interface AutolinkMeta {
  enabled: boolean
  titles: string[]
}

/** Build the decoration set for the current doc. Skips heading/codeBlock
 *  subtrees and link/code-marked text; pre-seeds existing wikiLink titles so
 *  manual links win and titles aren't double-linked. */
function buildDecorations(doc: PMNode, matcher: TitleMatcher): DecorationSet {
  const segments: { text: string; pos: number }[] = []
  const preSeen: string[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading' || node.type.name === 'codeBlock') return false
    if (node.type.name === 'wikiLink' && node.attrs.title) {
      preSeen.push(String(node.attrs.title))
      return
    }
    if (!node.isText || !node.text) return
    if (node.marks.some((mk) => mk.type.name === 'link' || mk.type.name === 'code')) return
    segments.push({ text: node.text, pos })
  })
  const decorations = planAutolinks(segments, preSeen, matcher).map((m) =>
    Decoration.inline(m.from, m.to, {
      class: 'wiki-link autolink',
      'data-title': m.title,
      'data-wikilink': '',
    }),
  )
  return DecorationSet.create(doc, decorations)
}

export const Autolink = Extension.create({
  name: 'autolink',

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<AutolinkState>({
        key: autolinkKey,
        state: {
          init: () => ({ enabled: false, matcher: null }),
          apply(tr, value) {
            const meta = tr.getMeta(autolinkKey) as AutolinkMeta | undefined
            if (!meta) return value
            return {
              enabled: meta.enabled,
              matcher: meta.titles.length ? buildTitleMatcher(meta.titles) : null,
            }
          },
        },
        props: {
          decorations(state) {
            const ps = autolinkKey.getState(state)
            if (!ps || !ps.enabled || !ps.matcher || editor.isEditable) return null
            return buildDecorations(state.doc, ps.matcher)
          },
        },
      }),
    ]
  },
})
