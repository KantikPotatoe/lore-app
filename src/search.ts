import { Index } from 'flexsearch'
import type { LorePage } from './db'

export interface SearchResult {
  id: string
  title: string
  category: string
  snippet: string
}

// FlexSearch Index has no .clear(); we swap the reference on each rebuild.
let activeIdx: Index | null = null
const store = new Map<string, { title: string; category: string; body: string; summary: string }>()

function stripHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}

function extractSnippet(text: string, query: string, maxLen = 160): string {
  if (!text) return ''
  const q = query.trim().toLowerCase().split(/\s+/)[0] ?? ''
  const lower = text.toLowerCase()
  const pos = q ? lower.indexOf(q) : -1
  if (pos === -1) return text.slice(0, maxLen) + (text.length > maxLen ? '…' : '')
  const start = Math.max(0, pos - 60)
  const end = Math.min(text.length, start + maxLen)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

export function highlightSnippet(snippet: string, query: string): string {
  const q = query.trim().split(/\s+/)[0] ?? ''
  if (!q) return snippet
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return snippet.replace(re, '<mark>$1</mark>')
}

export function buildIndex(pages: LorePage[]): void {
  activeIdx = new Index({ tokenize: 'forward', resolution: 5 })
  store.clear()
  for (const page of pages) {
    const body = stripHtml(page.content)
    const text = [page.title, page.summary, page.tags.join(' '), body].join(' ')
    activeIdx.add(page.id, text)
    store.set(page.id, { title: page.title, category: page.category, body, summary: page.summary })
  }
}

export function searchPages(query: string): SearchResult[] {
  if (!query.trim() || !activeIdx) return []
  const ids = activeIdx.search(query, 20) as string[]
  return ids
    .map((id) => {
      const entry = store.get(id)
      if (!entry) return null
      return { id, title: entry.title, category: entry.category, snippet: extractSnippet(entry.body || entry.summary, query) }
    })
    .filter((r): r is SearchResult => r !== null)
}
