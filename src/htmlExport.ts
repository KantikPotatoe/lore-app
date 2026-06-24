import JSZip from 'jszip'
import { db } from './db'
import type { LorePage, PageImage } from './db'

function rewriteWikiLinks(html: string, titleToId: Map<string, string>): string {
  return html.replace(
    /<a\s+data-wikilink[^>]*data-title="([^"]*)"[^>]*>(.*?)<\/a>/gs,
    (_, title, inner) => {
      const id = titleToId.get(title)
      return id
        ? `<a href="./${id}.html">${inner}</a>`
        : `<span class="broken-link">${inner}</span>`
    }
  )
}

function renderInfobox(page: LorePage): string {
  if (!page.infobox) return ''
  const rows = page.infobox.fields
    .filter(f => f.kind !== 'separator' || page.infobox!.fields.some((g, i) => i > page.infobox!.fields.indexOf(f) && g.value?.trim()))
    .map(f => {
      if (f.kind === 'separator') return `<tr><th colspan="2" class="infobox-sep">${f.label}</th></tr>`
      if (!f.value?.trim()) return ''
      return `<tr><th>${f.label}</th><td>${f.value}</td></tr>`
    })
    .filter(Boolean)
    .join('\n')
  if (!rows) return ''
  const img = page.infobox.image
    ? `<tr><td colspan="2" class="infobox-img"><img src="${page.infobox.image}" alt=""></td></tr>`
    : ''
  return `<table class="infobox">\n${img}${rows}\n</table>`
}

function renderGallery(images: PageImage[]): string {
  if (images.length === 0) return ''
  const items = images
    .map((img) => {
      const cap = img.caption ? `<figcaption>${img.caption}</figcaption>` : ''
      return `<figure class="gallery-item"><img src="${img.dataUrl}" alt="">${cap}</figure>`
    })
    .join('\n')
  return `<section class="gallery"><h2>Images</h2><div class="gallery-grid">${items}</div></section>`
}

function pageHtml(page: LorePage, body: string, backlinks: LorePage[], images: PageImage[]): string {
  const bl = backlinks.length
    ? `<section class="backlinks"><h2>What links here</h2><ul>${backlinks.map(b => `<li><a href="./${b.id}.html">${b.title}</a></li>`).join('')}</ul></section>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${page.title}</title>
<link rel="stylesheet" href="../style.css">
</head>
<body>
<article class="page">
  <header class="page-header">
    <h1>${page.title}</h1>
    <span class="category-chip">${page.category}</span>
  </header>
  ${renderInfobox(page)}
  <div class="page-body">${body}</div>
  ${renderGallery(images)}
  ${bl}
</article>
</body>
</html>`
}

function indexHtml(pages: LorePage[]): string {
  const byCategory = new Map<string, LorePage[]>()
  for (const p of pages) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, [])
    byCategory.get(p.category)!.push(p)
  }
  const sections = [...byCategory.entries()]
    .map(([cat, ps]) => `<section><h2>${cat}</h2><ul>${ps.map(p => `<li><a href="pages/${p.id}.html">${p.title}</a></li>`).join('')}</ul></section>`)
    .join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lore Codex Export</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<main class="index">
  <h1>Lore Codex Export</h1>
  ${sections}
</main>
</body>
</html>`
}

const CSS = `
:root { --bg: #1a1a2e; --panel: #16213e; --border: #2a2a4a; --ink: #e0e0e0; --ink-dim: #a0a0c0; --accent: #7c6af4; }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 24px; background: var(--bg); color: var(--ink); font-family: system-ui, sans-serif; line-height: 1.6; }
a { color: var(--accent); }
.broken-link { color: #888; text-decoration: line-through; }
.category-chip { font-size: 0.75rem; background: var(--accent); color: #fff; padding: 2px 8px; border-radius: 10px; }
.page { max-width: 800px; margin: 0 auto; }
.page-header { margin-bottom: 16px; }
h1 { margin: 0 0 8px; }
.infobox { float: right; margin: 0 0 16px 16px; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); font-size: 0.85rem; max-width: 280px; }
.infobox th, .infobox td { padding: 4px 8px; border-bottom: 1px solid var(--border); }
.infobox th { color: var(--ink-dim); font-weight: normal; white-space: nowrap; }
.infobox-sep { font-weight: 600; background: var(--border); }
.infobox-img img { max-width: 100%; display: block; }
.page-body img { max-width: 100%; }
.gallery { clear: both; margin-top: 32px; }
.gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.gallery-item { margin: 0; }
.gallery-item img { width: 100%; border-radius: 6px; display: block; }
.gallery-item figcaption { font-size: 0.8rem; color: var(--ink-dim); text-align: center; margin-top: 4px; }
.backlinks { margin-top: 32px; border-top: 1px solid var(--border); padding-top: 16px; }
.index { max-width: 900px; margin: 0 auto; }
.index section { margin-bottom: 24px; }
.index ul { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 4px 16px; }
`

export async function exportAsHtml(): Promise<void> {
  const pages = await db.pages.toArray()
  const titleToId = new Map(pages.map(p => [p.title, String(p.id)]))

  // Build reverse link index for backlinks
  const backlinkMap = new Map<string, LorePage[]>()
  for (const page of pages) {
    const re = /data-title="([^"]*)"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(page.content)) !== null) {
      const target = m[1]
      if (!backlinkMap.has(target)) backlinkMap.set(target, [])
      backlinkMap.get(target)!.push(page)
    }
  }

  // Group gallery images by page, sorted by their grid order.
  const imagesByPage = new Map<string, PageImage[]>()
  for (const img of await db.images.toArray()) {
    const list = imagesByPage.get(img.pageId) ?? []
    list.push(img)
    imagesByPage.set(img.pageId, list)
  }
  for (const list of imagesByPage.values()) list.sort((a, b) => a.order - b.order)

  const zip = new JSZip()
  zip.file('style.css', CSS.trim())
  zip.file('index.html', indexHtml(pages))

  const pagesFolder = zip.folder('pages')!
  for (const page of pages) {
    const body = rewriteWikiLinks(page.content, titleToId)
    const backlinks = backlinkMap.get(page.title) ?? []
    pagesFolder.file(`${page.id}.html`, pageHtml(page, body, backlinks, imagesByPage.get(page.id) ?? []))
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lore-export-${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
