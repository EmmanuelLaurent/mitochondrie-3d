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

describe('organelle field — crista tips', () => {
  it('finds the end of a crista lumen inside the matrix, with the crista axis', async () => {
    const { findCristaTip } = await import('./organelleField')
    const tip = findCristaTip(0.38, 0.42)
    // Just past the lumen's end: back in the inner solid (membrane), and the axis is a unit vector in the cut plane.
    expect(tip.axis.length()).toBeCloseTo(1, 5)
    expect(Math.abs(tip.axis.z)).toBeLessThan(1e-9)
    const beyond = tip.point.clone().addScaledVector(tip.axis, -0.004)
    expect(innerSolid(beyond)).toBeLessThan(0)
    const inside = tip.point.clone().addScaledVector(tip.axis, 0.01)
    expect(innerSolid(inside)).toBeGreaterThan(0)
    // In the quarter that the cutaway opens (y > 0, straightened), hanging from the top.
    expect(tip.point.y).toBeGreaterThan(0.1)
    expect(tip.axis.y).toBeGreaterThan(0.8)
  })
})
