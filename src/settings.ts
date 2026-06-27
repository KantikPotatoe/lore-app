import { getMeta, setMeta } from './db'

/** Per-lore, user-tunable policy. Stored as one `meta` row; missing fields fall
 *  back to DEFAULT_SETTINGS so an absent row reproduces today's behavior. */
export interface LoreSettings {
  snapshotChangeThreshold: number
  snapshotTimeHours: number
  snapshotRetention: number
  backupOverdueDays: number
  autolinkEnabled: boolean
}

export const DEFAULT_SETTINGS: LoreSettings = {
  snapshotChangeThreshold: 50,
  snapshotTimeHours: 24,
  snapshotRetention: 10,
  backupOverdueDays: 7,
  autolinkEnabled: true,
}

export const SETTINGS_KEY = 'lore-settings'

const MIN = 1
const MAX = 100

/** Coerce to an integer within [MIN, MAX]; return null for non-finite input so
 *  the caller can keep the prior value. */
function clamp(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.min(MAX, Math.max(MIN, Math.round(n)))
}

export async function getSettings(): Promise<LoreSettings> {
  const stored = (await getMeta<Partial<LoreSettings>>(SETTINGS_KEY)) ?? {}
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function updateSettings(patch: Partial<LoreSettings>): Promise<void> {
  const current = await getSettings()
  const next: LoreSettings = { ...current }
  for (const key of Object.keys(patch) as (keyof LoreSettings)[]) {
    const value = patch[key]
    if (typeof value === 'boolean') {
      next[key] = value as never
    } else {
      const clamped = clamp(value)
      if (clamped !== null) next[key] = clamped as never
    }
  }
  await setMeta(SETTINGS_KEY, next)
}
