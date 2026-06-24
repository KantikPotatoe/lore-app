import { currentLoreId } from './lores'

const CAP = 6
const keyFor = (loreId: string) => `lore:${loreId}:recentPages`

function read(loreId: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(loreId))
    const arr: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function write(loreId: string, ids: string[]): string[] {
  try {
    localStorage.setItem(keyFor(loreId), JSON.stringify(ids))
  } catch {
    // recents are non-critical — ignore quota/serialisation failures
  }
  return ids
}

export function getRecent(loreId: string = currentLoreId()): string[] {
  return read(loreId)
}

export function recordRecent(id: string, loreId: string = currentLoreId()): string[] {
  return write(loreId, [id, ...read(loreId).filter((x) => x !== id)].slice(0, CAP))
}

export function pruneRecent(known: Set<string>, loreId: string = currentLoreId()): string[] {
  return write(loreId, read(loreId).filter((id) => known.has(id)))
}
