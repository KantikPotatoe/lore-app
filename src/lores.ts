import Dexie, { type Table } from 'dexie'
import { CURRENT_LORE_KEY, currentLoreId, dbNameFor } from './loreId'

export interface Lore {
  id: string
  name: string
  banner: string | null // data URL, or null
  createdAt: number
  updatedAt: number
}

class LoreRegistryDB extends Dexie {
  lores!: Table<Lore, string>
  constructor() {
    super('lore-registry')
    this.version(1).stores({ lores: 'id, createdAt' })
  }
}

export const registry = new LoreRegistryDB()

// Re-export so callers can import everything from one place
export { currentLoreId } from './loreId'

export function setCurrentLore(id: string): void {
  localStorage.setItem(CURRENT_LORE_KEY, id)
}

export function switchLore(id: string): void {
  setCurrentLore(id)
  window.location.hash = '#/home'
  window.location.reload()
}

export function listLores(): Promise<Lore[]> {
  return registry.lores.orderBy('createdAt').toArray()
}

export function getLore(id: string): Promise<Lore | undefined> {
  return registry.lores.get(id)
}

export async function createLore(name = 'Untitled World'): Promise<void> {
  const id = crypto.randomUUID()
  const now = Date.now()
  await registry.lores.add({ id, name, banner: null, createdAt: now, updatedAt: now })
  switchLore(id)
}

export async function renameLore(id: string, name: string): Promise<void> {
  await registry.lores.update(id, { name: name.trim() || 'Untitled World', updatedAt: Date.now() })
}

export async function setLoreBanner(id: string, banner: string | null): Promise<void> {
  await registry.lores.update(id, { banner, updatedAt: Date.now() })
}

export async function deleteLore(id: string): Promise<void> {
  const isActive = id === currentLoreId()
  await Dexie.delete(dbNameFor(id))
  await registry.lores.delete(id)
  if (isActive) {
    localStorage.removeItem(CURRENT_LORE_KEY)
    // Reload to re-initialize the db singleton; land on the lore selector.
    window.location.hash = '#/'
    window.location.reload()
  }
}

export async function bootstrapDefaultLore(): Promise<void> {
  const count = await registry.lores.count()
  if (count > 0) return // Already bootstrapped — idempotent guard

  // Only read the legacy home-config title when db.ts is pointing at 'lore-app'.
  // If the active lore is already set to something else, skip the title migration.
  let name = 'My World'
  if (currentLoreId() === 'default') {
    const { getMeta } = await import('./db')
    const savedConfig = await getMeta<{ title?: string }>('home-config')
    const legacyTitle = savedConfig?.title?.trim()
    if (legacyTitle) name = legacyTitle
  }

  const now = Date.now()
  await registry.lores.add({ id: 'default', name, banner: null, createdAt: now, updatedAt: now })
}
