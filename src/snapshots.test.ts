import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { maybeTakeSnapshot } from './snapshots'
import { updateSettings } from './settings'

async function addPage() {
  await db.pages.add({
    id: crypto.randomUUID(),
    title: 'P', category: 'General', content: '', summary: '',
    tags: [], createdAt: Date.now(), updatedAt: Date.now(),
  } as never)
}

describe('maybeTakeSnapshot', () => {
  beforeEach(async () => {
    await db.pages.clear()
    await db.events.clear()
    await db.snapshots.clear()
    await db.meta.clear()
    await updateSettings({
      snapshotChangeThreshold: 50,
      snapshotTimeHours: 24,
      snapshotRetention: 10,
      backupOverdueDays: 7,
    })
  })

  it('does not snapshot below the change threshold (default 50)', async () => {
    await addPage()
    await maybeTakeSnapshot()
    expect(await db.snapshots.count()).toBe(0)
  })

  it('snapshots once the configured change threshold is met', async () => {
    await updateSettings({ snapshotChangeThreshold: 1 })
    await addPage()
    await maybeTakeSnapshot()
    expect(await db.snapshots.count()).toBe(1)
  })
})
