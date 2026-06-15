export const CURRENT_LORE_KEY = 'current-lore-id'

export function dbNameFor(id: string): string {
  return id === 'default' ? 'lore-app' : `lore-app-${id}`
}

export function currentLoreId(): string {
  const stored = localStorage.getItem(CURRENT_LORE_KEY)
  return stored || 'default'
}
