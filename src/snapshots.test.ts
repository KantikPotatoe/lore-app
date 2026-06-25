import { describe, it, expect, beforeEach } from 'vitest'
import { db, setMeta } from './db'
import { maybeTakeSnapshot } from './snapshots'
import { updateSettings } from './settings'

const SNAPSHOT_TIME_KEY = 'snapshot-last-time'

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
  })

  it('takes a baseline snapshot on first run with any change (no prior snapshot time)', async () => {
    await addPage()
    await maybeTakeSnapshot()
    expect(await db.snapshots.count()).toBe(1)
  })

  it('does not snapshot below the change threshold once a recent snapshot exists', async () => {
    await setMeta(SNAPSHOT_TIME_KEY, Date.now() - 1000)
    await addPage()
    await maybeTakeSnapshot()
    expect(await db.snapshots.count()).toBe(0)
  })

  it('snapshots once the configured change threshold is met', async () => {
    await setMeta(SNAPSHOT_TIME_KEY, Date.now() - 1000)
    await updateSettings({ snapshotChangeThreshold: 1 })
    await addPage()
    await maybeTakeSnapshot()
    expect(await db.snapshots.count()).toBe(1)
  })
})
