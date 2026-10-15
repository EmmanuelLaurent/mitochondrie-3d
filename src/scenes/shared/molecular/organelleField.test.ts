import { describe, expect, it } from 'vitest'
import { findCristaWall, innerSolid } from './organelleField'

describe('organelle field (CPU copy of the raymarcher)', () => {
  it('finds a crista wall on the matrix cut face, on the inner membrane', () => {
    const wall = findCristaWall(0.1, 0.36)
    // On the membrane mid-surface: inside the inner solid, within the membrane thickness.
    expect(innerSolid(wall.point)).toBeLessThan(0)
    expect(innerSolid(wall.point)).toBeGreaterThan(-0.03)
    expect(wall.normal.length()).toBeCloseTo(1, 5)
  })
})
