import { db } from './schema'
import type { Snapshot } from './types'

// ---------------------------------------------------------------------------
// Snapshots — automatic local version history
// ---------------------------------------------------------------------------

export async function saveSnapshot(data: string, editCount: number, keep = 10): Promise<void> {
  await db.transaction('rw', db.snapshots, async () => {
    await db.snapshots.add({ timestamp: Date.now(), editCount, data })
    let count = await db.snapshots.count()
    while (count > keep) {
      const oldest = await db.snapshots.orderBy('timestamp').first()
      if (oldest?.id == null) break
      await db.snapshots.delete(oldest.id)
      count--
    }
  })
}

export async function getSnapshots(): Promise<Snapshot[]> {
  return db.snapshots.orderBy('timestamp').reverse().toArray()
}

export async function deleteSnapshot(id: number): Promise<void> {
  await db.snapshots.delete(id)
}
