import { describe, it, expect } from 'vitest'
import { radiusFor, MIN_RADIUS, MAX_RADIUS } from './graphGeometry'

describe('radiusFor', () => {
  it('floors at MIN_RADIUS for a lone (degree 0) node', () => {
    expect(radiusFor(0)).toBe(MIN_RADIUS)
  })

  it('grows with degree', () => {
    expect(radiusFor(2)).toBeGreaterThan(radiusFor(1))
  })

  it('clamps at MAX_RADIUS for a huge hub', () => {
    expect(radiusFor(1000)).toBe(MAX_RADIUS)
  })
})
