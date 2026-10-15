import { describe, expect, it } from 'vitest'
import { INHIBITORS, labState, REFERENCE_STATE, type Inhibitor, type LabState } from './labModel'

/** One SPEC row (« Mode Labo » table) = one test. Values are relative to the normal condition. */
const run = (inhibitors: Inhibitor[], adp = 1): LabState => labState({ inhibitors: new Set(inhibitors), adp })
const normal = REFERENCE_STATE
/** "≈ 0" in the table: a few percent of normal at most. */
const NEAR_ZERO = 0.08
/** "basse" heat: not above the normal condition. */
const isLowHeat = (state: LabState): boolean => state.heat <= normal.heat * 1.05

describe('Labo — one test per row of the SPEC table', () => {
  it('Normal: everything nominal, heat low', () => {
    expect(normal.electronFlux).toBeCloseTo(1)
    expect(normal.oxygenConsumption).toBeCloseTo(1)
    expect(normal.protonGradient).toBeCloseTo(1)
    expect(normal.atpProduction).toBeCloseTo(1)
    expect(normal.heat).toBeCloseTo(1)
  })

  it('Roténone (bloque I): flux, O₂, gradient and ATP decrease but stay above zero (FADH₂ still enters via ETF-QO / II)', () => {
    const s = run(['rotenone'])
    for (const key of ['electronFlux', 'oxygenConsumption', 'protonGradient', 'atpProduction'] as const) {
      expect(s[key]).toBeGreaterThan(0.1)
      expect(s[key]).toBeLessThan(0.9)
    }
    expect(isLowHeat(s)).toBe(true)
  })

  it.each(['antimycinA', 'cyanide'] as const)('%s (bloque III ou IV): no flux at all, no O₂, no gradient, no ATP', (inhibitor) => {
    const s = run([inhibitor])
    expect(s.electronFlux).toBe(0)
    expect(s.oxygenConsumption).toBe(0)
    expect(s.protonGradient).toBe(0)
    expect(s.atpProduction).toBe(0)
    expect(isLowHeat(s)).toBe(true)
  })

  it('Oligomycine (bloque Fo): respiratory control slows the chain, O₂ drops, gradient rises to its maximum, no ATP', () => {
    const s = run(['oligomycin'])
    expect(s.electronFlux).toBeLessThan(0.5)
    expect(s.electronFlux).toBeGreaterThan(0)
    expect(s.oxygenConsumption).toBeLessThan(0.5)
    expect(s.protonGradient).toBeGreaterThan(1.3)
    expect(s.atpProduction).toBe(0)
    expect(isLowHeat(s)).toBe(true)
    // "maximal": no other single condition gives a higher gradient.
    for (const other of INHIBITORS) expect(run([other]).protonGradient).toBeLessThanOrEqual(s.protonGradient + 1e-9)
  })

  it('DNP (découplant): flux and O₂ at their maximum, gradient collapses, ATP ≈ 0, heat rises', () => {
    const s = run(['dnp'])
    expect(s.electronFlux).toBeGreaterThan(1.2)
    expect(s.oxygenConsumption).toBeGreaterThan(1.2)
    expect(s.protonGradient).toBeLessThan(0.15)
    expect(s.atpProduction).toBeLessThan(NEAR_ZERO)
    expect(s.heat).toBeGreaterThan(2)
  })

  it('Oligomycine + DNP: flux comes back (the uncoupler bypasses the Fo block), gradient collapses, no ATP, heat rises', () => {
    const oligo = run(['oligomycin'])
    const s = run(['oligomycin', 'dnp'])
    expect(s.electronFlux).toBeGreaterThan(oligo.electronFlux * 3)
    expect(s.oxygenConsumption).toBeGreaterThan(1)
    expect(s.protonGradient).toBeLessThan(0.15)
    expect(s.atpProduction).toBe(0)
    expect(s.heat).toBeGreaterThan(2)
  })

  it('ADP faible: the chain slows, O₂ decreases, gradient rises, ATP decreases, heat low', () => {
    const s = run([], 0.2)
    expect(s.electronFlux).toBeLessThan(0.9)
    expect(s.oxygenConsumption).toBeLessThan(0.9)
    expect(s.protonGradient).toBeGreaterThan(1.1)
    expect(s.atpProduction).toBeLessThan(0.7)
    expect(s.atpProduction).toBeGreaterThan(0)
    expect(isLowHeat(s)).toBe(true)
  })
})

describe('Labo — consistency over every combination', () => {
  const combos: Inhibitor[][] = []
  for (let mask = 0; mask < 1 << INHIBITORS.length; mask++) combos.push(INHIBITORS.filter((_, i) => mask & (1 << i)))

  it('blocking III or IV always stops everything, whatever else is added', () => {
    for (const combo of combos.filter((c) => c.includes('antimycinA') || c.includes('cyanide'))) {
      const s = run(combo)
      expect([s.electronFlux, s.oxygenConsumption, s.protonGradient, s.atpProduction]).toEqual([0, 0, 0, 0])
    }
  })

  it('no ATP is ever made while oligomycin blocks Fo', () => {
    for (const combo of combos.filter((c) => c.includes('oligomycin'))) expect(run(combo).atpProduction).toBe(0)
  })

  it('O₂ consumption always follows the electron flux (electrons end on O₂)', () => {
    for (const combo of combos) {
      const s = run(combo)
      expect(s.oxygenConsumption).toBeCloseTo(s.electronFlux)
    }
  })

  it('all values stay finite and non-negative, for any ADP level', () => {
    for (const combo of combos)
      for (const adp of [0, 0.1, 0.5, 1]) {
        const s = run(combo, adp)
        for (const value of Object.values(s)) {
          expect(Number.isFinite(value)).toBe(true)
          expect(value).toBeGreaterThanOrEqual(0)
        }
      }
  })

  it('more ADP never makes less ATP (without oligomycin)', () => {
    for (const combo of combos.filter((c) => !c.includes('oligomycin'))) {
      let previous = -1
      for (const adp of [0, 0.25, 0.5, 0.75, 1]) {
        const atp = run(combo, adp).atpProduction
        expect(atp).toBeGreaterThanOrEqual(previous - 1e-9)
        previous = atp
      }
    }
  })
})
