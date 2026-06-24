import { describe, it, expect, beforeEach } from 'vitest'
import { registry, bootstrapDefaultLore, listLores } from './lores'

beforeEach(async () => {
  localStorage.clear()
  await registry.lores.clear()
})

describe('bootstrapDefaultLore', () => {
  it('seeds a default world on a fresh install (empty registry, never bootstrapped)', async () => {
    await bootstrapDefaultLore()
    const lores = await listLores()
    expect(lores).toHaveLength(1)
    expect(lores[0].id).toBe('default')
  })

  it('does NOT re-seed once the user has deleted every world', async () => {
    // First run seeds the default world…
    await bootstrapDefaultLore()
    expect(await listLores()).toHaveLength(1)

    // …user deletes all worlds (registry emptied, but bootstrap already ran once).
    await registry.lores.clear()

    // A subsequent app start must leave the registry empty so the landing
    // page can show the empty state, instead of silently recreating a world.
    await bootstrapDefaultLore()
    expect(await listLores()).toHaveLength(0)
  })

  it('is idempotent when a world already exists', async () => {
    await bootstrapDefaultLore()
    await bootstrapDefaultLore()
    expect(await listLores()).toHaveLength(1)
  })
})
