// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildEpub, compileBookHtml, toXhtml } from './manuscriptExport'
import type { Book, Chapter, Scene } from './db'

const book: Book = { id: 'b1', title: 'My Novel', synopsis: '', order: 0, createdAt: 1, updatedAt: 1 }
const chapters: Chapter[] = [
  { id: 'c1', bookId: 'b1', title: 'Chapter One', order: 0, createdAt: 1, updatedAt: 1 },
  { id: 'c2', bookId: 'b1', title: 'Chapter Two', order: 1, createdAt: 1, updatedAt: 1 },
]
const scene = (id: string, chapterId: string, order: number, content: string): Scene => ({
  id, bookId: 'b1', chapterId, title: id, content, synopsis: '', notes: '',
  status: 'draft', order, wordCount: 0, povPageId: null, castPageIds: [], locationPageIds: [],
  createdAt: 1, updatedAt: 1,
})
const scenes: Scene[] = [
  scene('s1', 'c1', 0, '<p>Opening line.</p>'),
  scene('s2', 'c2', 0, '<p>Second chapter.</p>'),
]

describe('toXhtml', () => {
  it('self-closes void elements and strips scripts', () => {
    expect(toXhtml('<p>a<br>b</p><script>x</script>')).toContain('<br />')
    expect(toXhtml('<p>a<br>b</p><script>x</script>')).not.toContain('<script>')
  })
})

describe('compileBookHtml', () => {
  it('includes the book title, chapters and scene prose in order', () => {
    const html = compileBookHtml(book, chapters, scenes)
    expect(html).toContain('My Novel')
    expect(html.indexOf('Chapter One')).toBeLessThan(html.indexOf('Chapter Two'))
    expect(html).toContain('Opening line.')
  })
})

describe('buildEpub', () => {
  it('emits the required EPUB files with mimetype first', () => {
    const files = buildEpub(book, chapters, scenes)
    expect(Object.keys(files)[0]).toBe('mimetype')
    expect(files['mimetype']).toBe('application/epub+zip')
    expect(files['META-INF/container.xml']).toContain('content.opf')
    expect(files['OEBPS/content.opf']).toContain('My Novel')
    expect(files['OEBPS/nav.xhtml']).toContain('Chapter One')
    expect(files['OEBPS/chapter-0.xhtml']).toContain('Opening line.')
    expect(files['OEBPS/chapter-1.xhtml']).toContain('Second chapter.')
  })

  it('orders the spine by chapter order', () => {
    const opf = buildEpub(book, chapters, scenes)['OEBPS/content.opf']
    expect(opf.indexOf('chapter-0')).toBeLessThan(opf.indexOf('chapter-1'))
  })
})
