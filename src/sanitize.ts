// src/sanitize.ts
// XSS defence for stored rich-text HTML.
//
// Page bodies and timeline-event descriptions are stored as raw HTML strings and
// re-rendered — the body through Tiptap (which rebuilds from its schema and so is
// inherently safe), but the event description straight through
// `dangerouslySetInnerHTML`. For self-authored content that is fine, but the
// moment a user imports someone else's backup that HTML is untrusted and an XSS
// vector. This module runs it through DOMPurify, whitelisting exactly the tags
// and attributes Tiptap actually produces (see LoreEditor):
//   - StarterKit blocks/marks: p, headings, lists, blockquote, code/pre, hr, br,
//     strong/em/s/code, etc.
//   - external links: <a href target rel class="ext-link">
//   - wiki links:     <a data-wikilink data-title class="wiki-link">
//   - inline images embedded as data: URLs (allowBase64)
//   - tables from TableKit: table/tr/th/td/colgroup/col with col/rowspan + widths
//
// Where it runs: on **import** (see db/backup.ts) — the boundary where untrusted
// HTML enters the DB, so every render path downstream gets clean data — and again
// as defence-in-depth at the one raw render sink (TimelineVertical's
// dangerouslySetInnerHTML). See docs/futureproofing-roadmap.md item #8.

import DOMPurify from 'dompurify'

/** Tags Tiptap emits. Anything not here (script, iframe, object, …) is dropped. */
const ALLOWED_TAGS = [
  // structure & blocks
  'p', 'br', 'hr', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code',
  'ul', 'ol', 'li',
  // inline marks
  'strong', 'b', 'em', 'i', 's', 'del', 'u', 'mark', 'sub', 'sup',
  // links & media
  'a', 'img',
  // tables (TableKit)
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
]

/** Attributes Tiptap emits. `data-*` (data-wikilink/data-title/data-colwidth) are
 *  allowed separately via ALLOW_DATA_ATTR. `style` is kept for table column widths
 *  — DOMPurify scrubs dangerous CSS (expression(), url(javascript:), …). */
const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'class', 'title',
  'src', 'alt', 'width', 'height',
  'colspan', 'rowspan', 'colwidth', 'start', 'type', 'style',
]

/**
 * Sanitize a stored rich-text HTML string, keeping only the markup Tiptap
 * produces and stripping any scripting (script tags, on* handlers, javascript:
 * URLs, etc.). Idempotent — safe to run on already-clean content. Inline images
 * as `data:` URLs survive (DOMPurify permits data: URIs on img by default).
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
  })
}
