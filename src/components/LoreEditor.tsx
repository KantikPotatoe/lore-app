import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { WikiLink } from '../extensions/WikiLink'
import { compressImage } from '../imageUtils'

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
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false, // we handle clicks ourselves so wiki vs external stay separate
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer', class: 'ext-link' },
        },
      }),
      WikiLink,
      Image.configure({ inline: false, allowBase64: true }),
      TableKit.configure({ table: { resizable: true } }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  const fileInput = useRef<HTMLInputElement>(null)
  const [showLinkBox, setShowLinkBox] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  // Insert an image into the body: downscale to a body-friendly 1600px and embed
  // as a data URL (local-first — no upload). Mirrors Infobox.pickImage.
  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || !editor) return
    const dataUrl = await compressImage(file, 1600)
    editor.chain().focus().setImage({ src: dataUrl }).run()
  }

  function openLinkBox() {
    setLinkUrl(editor?.getAttributes('link').href ?? '')
    setShowLinkBox(true)
  }

  function applyLink() {
    const url = linkUrl.trim()
    if (!url) {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      // Prefix https:// when the author types a bare domain (e.g. "example.com").
      const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`
      editor?.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    setShowLinkBox(false)
    setLinkUrl('')
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    setShowLinkBox(false)
    setLinkUrl('')
  }

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

  // Route clicks: wiki links navigate in-app; external href links open a new
  // tab. In edit mode both require Ctrl/Cmd-click so plain clicks place the cursor.
  const handleClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement

    const wiki = el.closest('a.wiki-link')
    if (wiki) {
      if (editable && !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      const title = wiki.getAttribute('data-title')
      if (title) onWikiClick(title)
      return
    }

    const ext = el.closest('a[href]:not(.wiki-link)') as HTMLAnchorElement | null
    if (ext) {
      if (editable && !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      const href = ext.getAttribute('href')
      if (href) window.open(href, '_blank', 'noopener,noreferrer')
    }
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
          <Btn title="Insert image" onClick={() => fileInput.current?.click()}>🖼</Btn>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={pickImage}
          />
          <Btn title="Link (external URL)" active={editor.isActive('link')} onClick={openLinkBox}>🔗</Btn>
          <span className="tb-sep" />
          <Btn title="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>⊞</Btn>
          {editor.isActive('table') && (<>
            <Btn title="Add row below" onClick={() => editor.chain().focus().addRowAfter().run()}>+Row</Btn>
            <Btn title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>−Row</Btn>
            <Btn title="Add column after" onClick={() => editor.chain().focus().addColumnAfter().run()}>+Col</Btn>
            <Btn title="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>−Col</Btn>
            <Btn title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>⌫ Tbl</Btn>
          </>)}
          <span className="tb-spacer" />
          <span className="tb-hint">Type [[Name]] to link a page</span>
        </div>
      )}
      {editable && showLinkBox && (
        <div className="link-popover">
          <input
            autoFocus
            type="text"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink() }
              if (e.key === 'Escape') { setShowLinkBox(false); setLinkUrl('') }
            }}
          />
          <Btn title="Apply link" onClick={applyLink}>Apply</Btn>
          {editor.isActive('link') && (
            <Btn title="Remove link" onClick={removeLink}>Remove</Btn>
          )}
        </div>
      )}
      <EditorContent editor={editor} onClick={handleClick} />
    </div>
  )
}
