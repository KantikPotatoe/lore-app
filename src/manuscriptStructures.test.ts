import { describe, expect, it } from 'vitest'
import { STRUCTURES, structureDef } from './manuscriptStructures'

describe('structure definitions', () => {
  it('includes the three built-in structures', () => {
    expect(STRUCTURES.map((s) => s.type).sort()).toEqual(['heros-journey', 'save-the-cat', 'snowflake'])
  })
  it('Save the Cat has its 15 beats', () => {
    expect(structureDef('save-the-cat')?.beats).toHaveLength(15)
  })
  it('resolves a definition by type', () => {
    expect(structureDef('heros-journey')?.name).toBe("Hero's Journey")
  })
  it('returns undefined for an unknown type', () => {
    // @ts-expect-error deliberately invalid
    expect(structureDef('nope')).toBeUndefined()
  })
})
