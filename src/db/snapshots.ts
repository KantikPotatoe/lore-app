import { db } from './schema'
import type { Snapshot } from './types'

// ---------------------------------------------------------------------------
// Snapshots — automatic local version history
// ---------------------------------------------------------------------------

export async function saveSnapshot(data: string, editCount: number): Promise<void> {
  await db.transaction('rw', db.snapshots, async () => {
    await db.snapshots.add({ timestamp: Date.now(), editCount, data })
    const count = await db.snapshots.count()
    if (count > 10) {
      const oldest = await db.snapshots.orderBy('timestamp').first()
      if (oldest?.id != null) await db.snapshots.delete(oldest.id)
    }
  })
}

export async function getSnapshots(): Promise<Snapshot[]> {
  return db.snapshots.orderBy('timestamp').reverse().toArray()
}

export async function deleteSnapshot(id: number): Promise<void> {
  await db.snapshots.delete(id)
}
