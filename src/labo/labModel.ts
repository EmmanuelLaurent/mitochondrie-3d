import { computePalmitateBalance, ELECTRON_TRANSPORT_PUMPING } from '../config/science.config'

/**
 * Qualitative model of the Labo mode (pure logic, no rendering): a few coupled
 * mass-balances, solved to steady state, that reproduce the textbook behaviour of
 * every inhibitor combination in SPEC (table « Mode Labo »). It is NOT a biophysical
 * simulation; values are relative (normal condition ≈ the reference), meant to drive
 * gauges and animation speeds consistently.
 *
 * - Electron entry: NADH through complex I, FADH₂ through complex II / ETF-QO; the
 *   share of each comes from the palmitate balance (31 NADH vs 15 FADH₂).
 * - Complexes III and IV are on every route: blocking either stops all flux.
 * - Respiratory control: a high proton gradient brakes the chain.
 * - Protons pumped (per route, rule 5) return through the ATP synthase (needs ADP,
 *   blocked by oligomycin), through the basal leak, or through an uncoupler (DNP).
 */

export type Inhibitor = 'rotenone' | 'antimycinA' | 'cyanide' | 'oligomycin' | 'dnp'

export const INHIBITORS: readonly Inhibitor[] = ['rotenone', 'antimycinA', 'cyanide', 'oligomycin', 'dnp']

export interface LabInput {
  inhibitors: ReadonlySet<Inhibitor>
  /** Available ADP, 0 (none) .. 1 (plenty, the reference condition). */
  adp: number
}

export interface LabState {
  /** Electrons flowing to O₂ (relative; reference condition = 1). */
  electronFlux: number
  /** O₂ consumed; proportional to the electron flux. */
  oxygenConsumption: number
  /** Proton-motive force across the inner membrane (relative; reference = 1). */
  protonGradient: number
  /** ATP made by the ATP synthase (relative; reference = 1). */
  atpProduction: number
  /** Heat released by protons returning without making ATP (relative; reference = 1). */
  heat: number
}

const PARAMS = {
  /** Synthase conductance with plenty of ADP. */
  synthase: 1.0,
  /** Basal proton leak (always there, small). */
  leak: 0.12,
  /** Uncoupler (DNP) conductance: a large shortcut for protons. */
  uncoupler: 30,
  /**
   * Heat released along the chain itself, proportional to the electron flux (not all of
   * the redox energy ends up in the gradient); the rest of the heat is protons that
   * return without making ATP.
   */
  redoxHeat: 0.3,
  /** Steepness of respiratory control (how hard a full gradient brakes the chain). */
  control: 2,
} as const

const { nadh: NADH_TOTAL, fadh2: FADH2_TOTAL } = computePalmitateBalance()
const NADH_SHARE = NADH_TOTAL / (NADH_TOTAL + FADH2_TOTAL)
const FADH2_SHARE = 1 - NADH_SHARE

interface Raw {
  flux: number
  gradient: number
  atp: number
  heat: number
}

function solve(input: LabInput): Raw {
  const has = (inhibitor: Inhibitor): boolean => input.inhibitors.has(inhibitor)
  const adp = Math.min(1, Math.max(0, input.adp))

  // Maximal electron flux the chain can carry: no route through a blocked III or IV.
  const downstreamBlocked = has('antimycinA') || has('cyanide')
  const nadhRoute = has('rotenone') || downstreamBlocked ? 0 : NADH_SHARE
  const fadh2Route = downstreamBlocked ? 0 : FADH2_SHARE
  const capacity = nadhRoute + fadh2Route
  if (capacity === 0) return { flux: 0, gradient: 0, atp: 0, heat: 0 }

  // Protons pumped per unit of electron flux, weighted by route (rule 5).
  const hPerFlux = (nadhRoute * ELECTRON_TRANSPORT_PUMPING.perNADH + fadh2Route * ELECTRON_TRANSPORT_PUMPING.perFADH2) / capacity

  const synthase = has('oligomycin') ? 0 : PARAMS.synthase * adp
  const uncoupler = has('dnp') ? PARAMS.uncoupler : 0
  const conductance = synthase + uncoupler + PARAMS.leak

  // Steady state: flux = capacity·(1 − g^c) and g = pumping / conductance, solved by bisection on g.
  const pumpingScale = 1 / ELECTRON_TRANSPORT_PUMPING.perNADH
  const residual = (g: number): number => {
    const flux = capacity * (1 - g ** PARAMS.control)
    return (flux * hPerFlux * pumpingScale) / conductance - g
  }
  let lo = 0
  let hi = 1
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (residual(mid) > 0) lo = mid
    else hi = mid
  }
  const gradient = (lo + hi) / 2
  const flux = capacity * (1 - gradient ** PARAMS.control)
  return {
    flux,
    gradient,
    atp: synthase * gradient,
    heat: (uncoupler + PARAMS.leak) * gradient + PARAMS.redoxHeat * flux,
  }
}

const REFERENCE = solve({ inhibitors: new Set(), adp: 1 })

/** Steady state of the chain for a set of inhibitors and an ADP level, relative to the reference condition. */
export function labState(input: LabInput): LabState {
  const raw = solve(input)
  return {
    electronFlux: raw.flux / REFERENCE.flux,
    oxygenConsumption: raw.flux / REFERENCE.flux,
    protonGradient: raw.gradient / REFERENCE.gradient,
    atpProduction: raw.atp / REFERENCE.atp,
    heat: raw.heat / REFERENCE.heat,
  }
}

export const REFERENCE_STATE: LabState = labState({ inhibitors: new Set(), adp: 1 })
