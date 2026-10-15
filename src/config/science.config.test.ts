import { describe, expect, it } from 'vitest'
import { computePalmitateBalance } from './science.config'

describe('computePalmitateBalance', () => {
  it('matches the documented bilan for the default (current) P/O convention', () => {
    const balance = computePalmitateBalance('current')
    expect(balance).toEqual({
      acetylCoA: 8,
      nadh: 31,
      fadh2: 15,
      gtp: 8,
      co2: 16,
      o2Consumed: 23,
      electronPairs: 46,
      water: 46,
      protonsPumped: 400,
      atpNet: 106,
    })
  })

  it('reduces one O₂ per two electron pairs, and makes one H₂O per pair (rule 6)', () => {
    const balance = computePalmitateBalance()
    expect(balance.o2Consumed * 2).toBe(balance.electronPairs)
    expect(balance.water).toBe(balance.electronPairs)
  })

  it('splits the proton-motive force with Δψ as the larger part (rule 9)', async () => {
    const { electricShareOfPmf } = await import('./science.config')
    expect(electricShareOfPmf()).toBeGreaterThan(0.5)
    expect(electricShareOfPmf()).toBeLessThan(1)
  })

  it('matches the documented bilan for the legacy P/O convention', () => {
    const balance = computePalmitateBalance('legacy')
    expect(balance.atpNet).toBe(129)
    // Everything upstream of the P/O ratio itself must not change with convention.
    expect(balance.acetylCoA).toBe(8)
    expect(balance.nadh).toBe(31)
    expect(balance.fadh2).toBe(15)
    expect(balance.protonsPumped).toBe(400)
    expect(balance.o2Consumed).toBe(23)
  })
})
