import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { WikiLink } from '../extensions/WikiLink'

interface Props {
  content: string
  editable: boolean
  onChange: (html: string) => void
  /** Called when a [[wiki link]] is clicked, with the linked page title. */
  onWikiClick: (title: string) => void
  /** Lowercased titles of existing pages; missing ones render as broken (view mode). */
  knownTitles?: Set<string>
}

/** Toolbar button helper. */
function Btn({ active, onClick, title, children }: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? ' is-active' : ''}`}
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep editor focus
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default function LoreEditor({ content, editable, onChange, onWikiClick, knownTitles }: Props) {
  const editor = useEditor({
    extensions: [StarterKit, WikiLink],
    content,
    editable,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Toggle edit/view without losing the editor instance.
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editable, editor])

  // In view mode, flag links whose target page no longer exists. Mirrors the
  // post-render DOM pass TableOfContents uses; edit mode is left untouched so
  // authoring isn't disrupted.
  useEffect(() => {
    if (!editor || editable || !knownTitles) return
    editor.view.dom.querySelectorAll('a.wiki-link').forEach((a) => {
      const t = a.getAttribute('data-title')?.trim().toLowerCase()
      a.classList.toggle('is-broken', !!t && !knownTitles.has(t))
    })
  }, [editor, editable, knownTitles, content])

  if (!editor) return null

  // Intercept clicks on wiki links and route them. In edit mode we leave them
  // alone so you can place the cursor; in view mode a click navigates.
  const handleClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('a.wiki-link')
    if (!target) return
    if (editable && !(e.metaKey || e.ctrlKey)) return // edit mode: Ctrl/Cmd-click to follow
    e.preventDefault()
    const title = target.getAttribute('data-title')
    if (title) onWikiClick(title)
  }

  return (
    <div className="lore-editor">
      {editable && (
        <div className="editor-toolbar">
          <Btn title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></Btn>
          <Btn title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Btn>
          <Btn title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Btn>
          <span className="tb-sep" />
          <Btn title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</Btn>
          <Btn title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
          <Btn title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn>
          <span className="tb-sep" />
          <Btn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</Btn>
          <Btn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</Btn>
          <Btn title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</Btn>
          <Btn title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</Btn>
          <span className="tb-spacer" />
          <span className="tb-hint">Type [[Name]] to link a page</span>
        </div>
      )}
      <EditorContent editor={editor} onClick={handleClick} />
    </div>
  )
}
