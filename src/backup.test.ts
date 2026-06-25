import { describe, it, expect } from 'vitest'
import { isBackupOverdue } from './backup'

const DAY = 24 * 60 * 60 * 1000

describe('isBackupOverdue', () => {
  it('is overdue when never backed up', () => {
    expect(isBackupOverdue(null)).toBe(true)
  })

  it('uses a 7-day default', () => {
    expect(isBackupOverdue(Date.now() - 8 * DAY)).toBe(true)
    expect(isBackupOverdue(Date.now() - 3 * DAY)).toBe(false)
  })

  it('honors a custom cadence', () => {
    expect(isBackupOverdue(Date.now() - 2 * DAY, 1)).toBe(true)
    expect(isBackupOverdue(Date.now() - 2 * DAY, 5)).toBe(false)
  })
})
