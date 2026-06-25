import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './schema'
import { saveSnapshot, getSnapshots } from './snapshots'

describe('saveSnapshot retention', () => {
  beforeEach(async () => {
    await db.snapshots.clear()
  })

  it('defaults to keeping the 10 newest', async () => {
    for (let i = 0; i < 12; i++) await saveSnapshot(`data-${i}`, 1)
    expect((await getSnapshots()).length).toBe(10)
  })

  it('honors a custom keep count', async () => {
    for (let i = 0; i < 6; i++) await saveSnapshot(`data-${i}`, 1, 3)
    expect((await getSnapshots()).length).toBe(3)
  })
})
