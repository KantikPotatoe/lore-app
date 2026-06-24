import { describe, it, expect, beforeEach } from 'vitest'
import {
  db,
  applyTemplate,
  parseRefTitles,
  serializeRefTitles,
  seedTemplates,
  BUILTIN_TEMPLATES,
  BUILTIN_ICONS,
  type Infobox,
  type InfoboxTemplate,
} from '../db'

// templates.ts holds the page-type logic: applyTemplate (a value-preserving row
// swap, pure) and seedTemplates (DB-backed reconciliation of the shipped
// built-ins on startup). The pure tests need no DB; the seed tests run against a
// cleared in-memory templates table.

describe('parseRefTitles / serializeRefTitles', () => {
  it('parses [[tokens]] into an ordered title list, trimming each', () => {
    expect(parseRefTitles('[[ A ]] text [[B]]')).toEqual(['A', 'B'])
  })

  it('round-trips a title list', () => {
    const titles = ['Frodo', 'Sam']
    expect(parseRefTitles(serializeRefTitles(titles))).toEqual(titles)
  })

  it('serialize drops blank entries', () => {
    expect(serializeRefTitles(['A', '  ', 'B'])).toBe('[[A]] [[B]]')
  })
})

describe('applyTemplate', () => {
  const tpl: InfoboxTemplate = {
    id: 't',
    name: 'Hero',
    color: '#fff',
    builtin: false,
    items: [
      { label: 'Section', separator: true },
      { label: 'Age', fieldType: 'number' },
      { label: 'Ally', fieldType: 'ref', refType: 'Character' },
      { label: 'Bio' }, // text
    ],
  }

  function box(fields: Infobox['fields']): Infobox {
    return { template: 'Old', image: 'data:image/png;base64,X', caption: 'cap', fields }
  }

  it('replaces rows with exactly the template rows and keeps image/caption', () => {
    const out = applyTemplate(box([]), tpl)
    expect(out.template).toBe('Hero')
    expect(out.image).toBe('data:image/png;base64,X')
    expect(out.caption).toBe('cap')
    expect(out.fields.map((f) => f.label)).toEqual(['Section', 'Age', 'Ally', 'Bio'])
    expect(out.fields[0].kind).toBe('separator')
  })

  it('carries a matching-label value over (text field), case-insensitive', () => {
    const out = applyTemplate(
      box([{ id: 'old', label: 'bio', value: 'A wandering ranger.' }]),
      tpl,
    )
    const bio = out.fields.find((f) => f.label === 'Bio')!
    expect(bio.value).toBe('A wandering ranger.')
    expect(bio.id).toBe('old') // existing field id reused
  })

  it('drops a number value that does not parse as a number', () => {
    const keep = applyTemplate(box([{ id: '1', label: 'Age', value: '42' }]), tpl)
    const drop = applyTemplate(box([{ id: '2', label: 'Age', value: 'old' }]), tpl)
    expect(keep.fields.find((f) => f.label === 'Age')!.value).toBe('42')
    expect(drop.fields.find((f) => f.label === 'Age')!.value).toBe('')
  })

  it('drops ref text that holds no [[links]]', () => {
    const keep = applyTemplate(box([{ id: '1', label: 'Ally', value: '[[Sam]]' }]), tpl)
    const drop = applyTemplate(box([{ id: '2', label: 'Ally', value: 'just Sam' }]), tpl)
    expect(keep.fields.find((f) => f.label === 'Ally')!.value).toBe('[[Sam]]')
    expect(drop.fields.find((f) => f.label === 'Ally')!.value).toBe('')
  })
})

describe('seedTemplates', () => {
  beforeEach(async () => {
    await db.templates.clear()
  })

  it('adds every missing built-in', async () => {
    await seedTemplates()
    const ids = new Set((await db.templates.toArray()).map((t) => t.id))
    expect(BUILTIN_TEMPLATES.every((t) => ids.has(t.id))).toBe(true)
  })

  it('removes obsolete built-ins (a builtin id we no longer ship)', async () => {
    await db.templates.add({ id: 'builtin-gone', name: 'Gone', color: '#000', items: [], builtin: true })
    await seedTemplates()
    expect(await db.templates.get('builtin-gone')).toBeUndefined()
  })

  it('leaves custom (builtin:false) templates alone', async () => {
    await db.templates.add({ id: 'custom-1', name: 'Mine', color: '#123', items: [], builtin: false })
    await seedTemplates()
    expect(await db.templates.get('custom-1')).toBeDefined()
  })

  it('backfills a missing colour on a shipped built-in without overwriting set ones', async () => {
    const shipped = BUILTIN_TEMPLATES[0]
    await db.templates.add({ ...shipped, color: '' })
    await seedTemplates()
    expect((await db.templates.get(shipped.id))!.color).toBe(shipped.color)
  })

  it('backfills a default icon but never overwrites a user icon', async () => {
    const a = BUILTIN_TEMPLATES.find((t) => BUILTIN_ICONS[t.name])!
    await db.templates.add({ ...a, icon: undefined })
    const b = BUILTIN_TEMPLATES.find((t) => t.id !== a.id && BUILTIN_ICONS[t.name])!
    await db.templates.add({ ...b, icon: '🎯' })

    await seedTemplates()

    expect((await db.templates.get(a.id))!.icon).toBe(BUILTIN_ICONS[a.name])
    expect((await db.templates.get(b.id))!.icon).toBe('🎯')
  })
})
