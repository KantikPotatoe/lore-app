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
  await Dexie.delete(dbNameFor(id))
  await registry.lores.delete(id)
  if (id === currentLoreId()) {
    localStorage.removeItem(CURRENT_LORE_KEY)
  }
}

export async function bootstrapDefaultLore(): Promise<void> {
  const count = await registry.lores.count()
  if (count > 0) return // Already bootstrapped — idempotent guard

  // Try to read the existing home-config title from the legacy 'lore-app' DB.
  // If currentLoreId() is 'default', db.ts is already pointing at 'lore-app',
  // so we can import getMeta directly.
  const { getMeta } = await import('./db')
  const savedConfig = await getMeta<{ title?: string }>('home-config')
  const name = savedConfig?.title?.trim() || 'My World'

  const now = Date.now()
  await registry.lores.add({ id: 'default', name, banner: null, createdAt: now, updatedAt: now })
}
