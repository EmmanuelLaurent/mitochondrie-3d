// Single source of truth for every scientific constant and stoichiometry in the project.
// See CLAUDE.md "Règles scientifiques (non négociables)" — nothing here may contradict it.

export const BETA_OXIDATION = {
  chainCarbons: 16, // palmitate (C16)
  cyclesForPalmitate: 7,
  lastCycleAcetylCoA: 2, // the final C4 remainder splits into 2 acetyl-CoA
  fadh2PerCycle: 1,
  nadhPerCycle: 1,
  activationCostATP: 2, // acyl-CoA synthetase: ATP -> AMP + PPi, equivalent to 2 ATP
} as const

export const KREBS_PER_ACETYL_COA = {
  nadh: 3,
  fadh2: 1, // via complex II (succinate dehydrogenase), never via ETF-QO
  gtp: 1,
  co2: 2,
} as const

// H+ pumped to the intermembrane space per 2 electrons through each complex.
export const ELECTRON_TRANSPORT_PUMPING = {
  complexI: 4,
  complexII: 0,
  complexIII: 4,
  complexIV: 2,
  etfQO: 0,
  perNADH: 10, // routes through I + III + IV
  perFADH2: 6, // routes through III + IV only (via ETF-QO or complex II)
} as const

export const ATP_SYNTHASE = {
  cRingSubunits: 8, // mammalian c-ring
  atpPerFullRotation: 3,
} as const

export type POConvention = 'current' | 'legacy'

export const DEFAULT_PO_CONVENTION: POConvention = 'current'

// P/O ratio: ATP produced per oxygen atom reduced, counting transport cost.
export const PO_RATIOS: Record<POConvention, { nadh: number; fadh2: number }> = {
  current: { nadh: 2.5, fadh2: 1.5 },
  legacy: { nadh: 3, fadh2: 2 },
}

export const ZOOM_TIERS = {
  organelle: { label: 'Organite', meters: 1e-6 },
  crista: { label: 'Crête', meters: 1e-7 },
  molecular: { label: 'Moléculaire', meters: 1e-8 },
} as const

export interface BalanceSheet {
  acetylCoA: number
  nadh: number
  fadh2: number
  gtp: number
  co2: number
  o2Consumed: number
  protonsPumped: number
  atpNet: number
}

/**
 * Full bilan for one palmitate molecule, derived from the constants above.
 * Reused by the scene 3-6 counters and the final balance screen — never hardcode these numbers elsewhere.
 */
export function computePalmitateBalance(convention: POConvention = DEFAULT_PO_CONVENTION): BalanceSheet {
  const { cyclesForPalmitate, lastCycleAcetylCoA, fadh2PerCycle, nadhPerCycle, activationCostATP } = BETA_OXIDATION

  const acetylCoA = (cyclesForPalmitate - 1) * 1 + lastCycleAcetylCoA
  const betaOxFadh2 = cyclesForPalmitate * fadh2PerCycle
  const betaOxNadh = cyclesForPalmitate * nadhPerCycle

  const krebsNadh = acetylCoA * KREBS_PER_ACETYL_COA.nadh
  const krebsFadh2 = acetylCoA * KREBS_PER_ACETYL_COA.fadh2
  const gtp = acetylCoA * KREBS_PER_ACETYL_COA.gtp
  const co2 = acetylCoA * KREBS_PER_ACETYL_COA.co2

  const nadh = betaOxNadh + krebsNadh
  const fadh2 = betaOxFadh2 + krebsFadh2

  const electronPairs = nadh + fadh2 // each carrier donates one pair of electrons to the chain
  const o2Consumed = electronPairs / 2 // 4 electrons (2 pairs) reduce one O2

  const protonsPumped = nadh * ELECTRON_TRANSPORT_PUMPING.perNADH + fadh2 * ELECTRON_TRANSPORT_PUMPING.perFADH2

  const { nadh: poNadh, fadh2: poFadh2 } = PO_RATIOS[convention]
  const atpFromOxidativePhosphorylation = nadh * poNadh + fadh2 * poFadh2
  const atpNet = atpFromOxidativePhosphorylation + gtp - activationCostATP

  return { acetylCoA, nadh, fadh2, gtp, co2, o2Consumed, protonsPumped, atpNet }
}
