import * as THREE from 'three'
import { BETA_OXIDATION, computePalmitateBalance, ELECTRON_TRANSPORT_PUMPING } from '../../config/science.config'
import { createShotTrack, followShot, shot, type CameraShot, type ShotKey } from '../shared/molecular/camera'
import { Actor, EASE, attachedPose, createLiveliness, euler, pose, ramp, resetActorSeeds, type Pose } from '../shared/molecular/choreography'
import { BILAYER_HALF, CUT_Z, PATH_Z, v } from '../shared/molecular/frame'
import { CYT_C_Y, IMM_Y, LUMEN, PROTEINS, protonSlots, type ProteinKey } from './layout'

/**
 * Scene 4's storyboard, every pose and counter a pure function of the timeline time.
 * One electron pair is followed from a NADH to the O₂ (I → Q → III → cyt c → IV); the
 * second pair, needed to reduce a whole O₂, comes from the β-oxidation FADH₂ (ETF →
 * ETF-QO → Q → III → cyt c → IV); complex II is shown with the Krebs FADH₂; then all the
 * other pairs at once. One bead = one pumped H⁺: the bead count is the counter.
 */

export const STEP_STARTS = {
  zoom: 0,
  overview: 13,
  complexI: 24,
  quinone: 41,
  complexIII: 52,
  cytochromeC: 68,
  complexIV: 79,
  etf: 94,
  oxygen: 111,
  complexII: 127,
  flux: 140,
  gradient: 164,
} as const

export type StepId = keyof typeof STEP_STARTS

export const DURATION = 184
export const ARRET = 3.5

const at = (step: StepId, offset: number): number => STEP_STARTS[step] + offset

const BH = BILAYER_HALF
const PUMP = ELECTRON_TRANSPORT_PUMPING
const BALANCE = computePalmitateBalance()

export const T = {
  dive: [1.0, 8.0],
  dissolve: [5.0, 6.5],
  tier: 5.8,
  glide: [8.0, 9.5],
  layerLabels: 8.5,
  // Overview: callouts one after the other.
  callouts: at('overview', 2.5),
  // The NADH pair through complex I.
  nadhDock: [at('complexI', 0.5), at('complexI', 4.0)],
  nadhOxidized: at('complexI', 4.5),
  relayHops: [at('complexI', 4.5), at('complexI', 8.5)],
  qProtonsI: [at('complexI', 6.0), at('complexI', 8.8)],
  qReducedI: at('complexI', 9.0),
  pumpI: [at('complexI', 10.0), at('complexI', 10.8), at('complexI', 11.6), at('complexI', 12.4)],
  nadSinks: [at('complexI', 9.5), at('complexI', 12.5)],
  // Ubiquinone to complex III.
  qToIII: [at('quinone', 1.0), at('quinone', 7.0)],
  // Complex III.
  cytcDock: [at('complexIII', 0.5), at('complexIII', 3.0)],
  toCytc: [
    [at('complexIII', 3.5), at('complexIII', 6.5)],
    [at('complexIII', 4.1), at('complexIII', 7.1)],
  ],
  pumpIIIq: [at('complexIII', 4.0), at('complexIII', 4.6)],
  pumpIIIm: [at('complexIII', 7.6), at('complexIII', 8.2)],
  // The QH₂ turns into Q as its two H⁺ leave from the Qo site (with the first electron).
  qOxidizedIII: at('complexIII', 3.5),
  qBack: [at('complexIII', 8.5), at('complexIII', 11.5)],
  // Cytochrome c to complex IV.
  cytcToIV: [
    [at('cytochromeC', 1.0), at('cytochromeC', 7.0)],
    [at('cytochromeC', 1.8), at('cytochromeC', 7.0)],
  ],
  // Complex IV.
  toSite1: [at('complexIV', 0.5), at('complexIV', 3.0)],
  pumpIV1: at('complexIV', 3.2),
  cytc1Leaves: [at('complexIV', 3.0), at('complexIV', 4.5)],
  cytc2Docks: [at('complexIV', 4.0), at('complexIV', 5.0)],
  toSite2: [at('complexIV', 5.0), at('complexIV', 7.5)],
  pumpIV2: at('complexIV', 7.6),
  oxygenIn: [at('complexIV', 8.0), at('complexIV', 10.5)],
  halfway: at('complexIV', 10.5),
  // The β-oxidation FADH₂: ACAD → ETF → ETF-QO → Q (rule 4).
  qToEtfQo: [at('etf', 1.0), at('etf', 5.0)],
  etfToAcad: [at('etf', 2.5), at('etf', 5.0)],
  fadToEtf: [at('etf', 5.2), at('etf', 5.6)],
  etfToQo: [at('etf', 5.6), at('etf', 9.0)],
  toQEtfQo: [at('etf', 9.5), at('etf', 11.5)],
  qProtonsEtfQo: [at('etf', 10.0), at('etf', 11.8)],
  qReducedEtfQo: at('etf', 12.0),
  etfBack: [at('etf', 12.0), at('etf', 13.4)],
  zeroPumpedEtf: at('etf', 12.5),
  // The second pair joins the same path; O₂ becomes water.
  qToIIIb: [at('oxygen', 1.0), at('oxygen', 3.0)],
  cytcDockB: [at('oxygen', 0.5), at('oxygen', 3.0)],
  pumpIIIb: [at('oxygen', 4.0), at('oxygen', 4.5), at('oxygen', 5.0), at('oxygen', 5.5)],
  toCytcB: [at('oxygen', 3.5), at('oxygen', 4.5)],
  qOxidizedIIIb: at('oxygen', 3.5),
  qBackB: [at('oxygen', 5.0), at('oxygen', 8.0)],
  cytcToIVb: [at('oxygen', 4.5), at('oxygen', 7.5)],
  toSite3: [at('oxygen', 7.5), at('oxygen', 8.3)],
  pumpIVb: [at('oxygen', 7.9), at('oxygen', 9.0)],
  cytcSwap: [at('oxygen', 8.3), at('oxygen', 8.8)],
  toSite4: [at('oxygen', 8.8), at('oxygen', 9.5)],
  waterProtons: [at('oxygen', 9.5), at('oxygen', 11.0)],
  water: at('oxygen', 11.2),
  waterOut: [at('oxygen', 11.2), at('oxygen', 12.5)],
  // Complex II (Krebs FADH₂).
  qToII: [at('complexII', 0.5), at('complexII', 3.0)],
  fadOxidizedII: at('complexII', 2.6),
  relayHopsII: [at('complexII', 2.6), at('complexII', 6.5)],
  qProtonsII: [at('complexII', 5.0), at('complexII', 7.0)],
  qReducedII: at('complexII', 7.2),
  zeroPumpedII: at('complexII', 8.0),
  // All the other pairs.
  pullBack: [at('flux', 0), at('flux', 3)],
  fluxEvents: [at('flux', 2), at('flux', 17)],
  // Gradient.
  charges: [at('gradient', 1.5), at('gradient', 5.0)],
  pmfSplit: [at('gradient', 4.0), at('gradient', 7.0)],
  captions: at('gradient', 6.0),
  // ÷ 10 back to the crista tier, as chapters 2 and 3 end (chapter 5 starts there).
  outroPull: [at('gradient', 9.0), at('gradient', 14.0)],
  cristaDissolve: [at('gradient', 10.5), at('gradient', 12.3)],
  cristaTier: at('gradient', 11.4),
  recap: at('gradient', 14.0),
} as const

/** 0 during every arrêt, 1 otherwise. */
export const liveliness = createLiveliness(STEP_STARTS, DURATION, ARRET)
const actor = (object: THREE.Object3D, start: Pose): Actor => new Actor(object, start, liveliness)

// --------------------------------------------------------------- electron routes

export type Route = 'nadh' | 'etf' | 'complexII'

/** The complexes visited by a pair of electrons, by route (rules 4–6). */
export const ROUTES: Record<Route, readonly ProteinKey[]> = {
  nadh: ['complexI', 'complexIII', 'complexIV'],
  etf: ['etf', 'etfQo', 'complexIII', 'complexIV'],
  complexII: ['complexII', 'complexIII', 'complexIV'],
}

/** H⁺ pumped per pair of electrons on each route (I = 4, III = 4, IV = 2; II and ETF-QO = 0). */
export function pumpedPerPair(route: Route): number {
  const pump: Partial<Record<ProteinKey, number>> = { complexI: PUMP.complexI, complexIII: PUMP.complexIII, complexIV: PUMP.complexIV, complexII: PUMP.complexII, etfQo: PUMP.etfQO }
  return ROUTES[route].reduce((sum, complex) => sum + (pump[complex] ?? 0), 0)
}

/**
 * The pairs of the accelerated flux: every NADH and FADH₂ of our palmitate not followed
 * in detail. The complex II pair formed in step 10 completes its route here.
 */
export interface FluxPair {
  route: Route
  /** When it enters the chain (NADH at I, QH₂ leaves ETF-QO or II). */
  time: number
}

function fluxPairs(): FluxPair[] {
  const counts: Record<Route, number> = {
    nadh: BALANCE.nadh - 1,
    etf: BETA_OXIDATION.cyclesForPalmitate * BETA_OXIDATION.fadh2PerCycle - 1,
    complexII: BALANCE.fadh2 - BETA_OXIDATION.cyclesForPalmitate * BETA_OXIDATION.fadh2PerCycle, // the shown one + the others
  }
  const total = counts.nadh + counts.etf + counts.complexII
  const used: Record<Route, number> = { nadh: 0, etf: 0, complexII: 0 }
  const pairs: FluxPair[] = []
  const [t0, t1] = T.fluxEvents
  for (let k = 0; k < total; k++) {
    // Sparse first and last, dense mid-way (a warm-up and a slow-down).
    const u = (k + 0.5) / total
    const time = t0 + (t1 - t0) * (u + (0.7 * Math.sin(2 * Math.PI * u)) / (2 * Math.PI))
    let route: Route
    if (k === 0) route = 'complexII' // the QH₂ formed at complex II in step 10 goes on first
    else {
      // Error diffusion: the route that lags most behind its share comes next.
      route = (Object.keys(counts) as Route[]).reduce((best, r) => ((k + 1) * (counts[r] / total) - used[r] > (k + 1) * (counts[best] / total) - used[best] ? r : best))
    }
    used[route]++
    pairs.push({ route, time })
  }
  return pairs
}

export const FLUX_PAIRS = fluxPairs()

// ------------------------------------------------------------------ pumped H⁺

export type PumpSource = 'complexI' | 'complexIII' | 'complexIV'

export interface PumpEvent {
  /** When the H⁺ arrives in the intermembrane space (counted). */
  time: number
  source: PumpSource
  /** Which channel or exit of the source (complex I: 0–3; complex III: QH₂ or matrix). */
  lane: number
  /** True for the two H⁺ the QH₂ brought from the matrix (released at the Qo site of III). */
  fromQ: boolean
}

function pumpEvents(): PumpEvent[] {
  const events: PumpEvent[] = []
  const add = (time: number, source: PumpSource, lane: number, fromQ = false): void => {
    events.push({ time, source, lane, fromQ })
  }
  T.pumpI.forEach((time, i) => add(time, 'complexI', i))
  // The QH₂'s own two H⁺ leave from the Qo site where it is docked (Q0 on the left monomer).
  T.pumpIIIq.forEach((time) => add(time, 'complexIII', 0, true))
  T.pumpIIIm.forEach((time, i) => add(time, 'complexIII', 2 + i))
  add(T.pumpIV1, 'complexIV', 0)
  add(T.pumpIV2, 'complexIV', 1)
  // Second pair: Q3 is docked on the right monomer's Qo site.
  T.pumpIIIb.forEach((time, i) => add(time, 'complexIII', i < 2 ? 1 : i, i < 2))
  T.pumpIVb.forEach((time, i) => add(time, 'complexIV', i))
  for (const pair of FLUX_PAIRS) {
    if (pair.route === 'nadh') for (let i = 0; i < PUMP.complexI; i++) add(pair.time + 0.1 * i, 'complexI', i % 4)
    for (let i = 0; i < PUMP.complexIII; i++) add(pair.time + 0.45 + 0.1 * i, 'complexIII', i, i < 2)
    for (let i = 0; i < PUMP.complexIV; i++) add(pair.time + 0.95 + 0.15 * i, 'complexIV', i)
  }
  return events.sort((a, b) => a.time - b.time)
}

export const PUMP_EVENTS = pumpEvents()

/** O₂ reduced: the detailed one, then one for every second pair reaching complex IV. */
export const OXYGEN_EVENTS: number[] = [T.water, ...FLUX_PAIRS.filter((_, k) => (k + 3) % 2 === 0).map((pair) => pair.time + 1.0)]

/** When each NADH and FADH₂ gives its electrons (for the « réoxydés » gauge). */
export const REOXIDIZED = {
  nadh: [T.nadhOxidized, ...FLUX_PAIRS.filter((pair) => pair.route === 'nadh').map((pair) => pair.time)].sort((a, b) => a - b),
  fadh2: [T.fadToEtf[0], T.fadOxidizedII, ...FLUX_PAIRS.filter((pair, k) => pair.route === 'etf' || (pair.route === 'complexII' && k > 0)).map((pair) => pair.time)].sort((a, b) => a - b),
}

const countUntil = (times: readonly number[], t: number): number => {
  let n = 0
  for (const time of times) if (t >= time) n++
  return n
}

/** Journey counters during scene 4: only H⁺ and O₂ move; the chain makes no ATP (the counter stays). */
export function countersAt(t: number, activationCost: number) {
  return {
    acetylCoA: BALANCE.acetylCoA,
    nadh: BALANCE.nadh,
    fadh2: BALANCE.fadh2,
    protonsPumped: countUntil(PUMP_EVENTS.map((event) => event.time), t),
    oxygenConsumed: countUntil(OXYGEN_EVENTS, t),
    atp: BALANCE.gtp - activationCost,
    atpInvested: activationCost,
    gtp: BALANCE.gtp,
  }
}

export function reoxidizedAt(t: number): { nadh: number; fadh2: number } {
  return { nadh: countUntil(REOXIDIZED.nadh, t), fadh2: countUntil(REOXIDIZED.fadh2, t) }
}

/** Pairs of electrons that have reached complex IV's active site at time t. */
export function pairsAtIVAt(t: number): number {
  const detailed = [T.toSite2[1], T.toSite4[1]]
  return countUntil([...detailed, ...FLUX_PAIRS.map((pair) => pair.time + 0.9)], t)
}

// -------------------------------------------------------------------- poses

/** Where a pumped H⁺ comes from (in the matrix, or on the QH₂) and where it exits (in the lumen). */
export interface PumpPaths {
  complexI: { entry: THREE.Vector3; exit: THREE.Vector3 }[]
  complexIII: { entry: THREE.Vector3; exit: THREE.Vector3 }[]
  complexIV: { entry: THREE.Vector3; exit: THREE.Vector3 }[]
}

/**
 * The pumped H⁺ beads: bead i (in counting order) crosses its complex in the 0.8 s
 * before it is counted, then drifts to the free lumen slot closest to its exit. Pure:
 * the same positions for the same time.
 */
export class ProtonBeads {
  readonly slots: THREE.Vector3[]
  private readonly assigned: number[] = []

  constructor(private readonly paths: PumpPaths) {
    this.slots = protonSlots(PUMP_EVENTS.length)
    const free = this.slots.map((_, i) => i)
    for (const event of PUMP_EVENTS) {
      const exit = this.exitOf(event)
      let best = 0
      for (let k = 1; k < free.length; k++) if (this.slots[free[k]].distanceToSquared(exit) < this.slots[free[best]].distanceToSquared(exit)) best = k
      this.assigned.push(free[best])
      free.splice(best, 1)
    }
  }

  private exitOf(event: PumpEvent): THREE.Vector3 {
    const lanes = this.paths[event.source]
    return lanes[event.lane % lanes.length].exit
  }

  private entryOf(event: PumpEvent): THREE.Vector3 {
    const lanes = this.paths[event.source]
    return lanes[event.lane % lanes.length].entry
  }

  /** Position of bead i at time t, or null while it has not appeared yet. */
  positionAt(i: number, t: number, out: THREE.Vector3): THREE.Vector3 | null {
    const event = PUMP_EVENTS[i]
    const crossing = event.fromQ ? 0.5 : 0.8
    if (t < event.time - crossing) return null
    const entry = this.entryOf(event)
    const exit = this.exitOf(event)
    if (t < event.time) return out.lerpVectors(entry, exit, ramp(t, event.time - crossing, event.time, EASE.inOut))
    return out.lerpVectors(exit, this.slots[this.assigned[i]], ramp(t, event.time, event.time + 1.2, EASE.out))
  }
}

export interface StoryParts {
  sites: Record<ProteinKey, Record<string, THREE.Vector3>>
  nadh: THREE.Object3D
  qs: THREE.Object3D[]
  cytc: THREE.Object3D[]
  etf: THREE.Object3D
  electrons: THREE.Object3D[]
  oxygen: THREE.Object3D
  water: THREE.Object3D[]
}

/** Membrane mid-plane, on the first lipid row behind the cut: where the Q diffuse. */
const Q_Z = CUT_Z - 0.35
const qPose = (x: number, y = IMM_Y): Pose => pose(v(x, y, Q_Z), euler(0, 0, 0))

/** The pool of ubiquinones at rest (x positions in the membrane). */
export const Q_POOL_X = [-24, -16, -8.5, 7, 15.5, 26.5, 37, -52]

/** Consumed (not pumped) matrix H⁺ shown in the detailed steps: where they go and when. */
export interface ConsumedProton {
  from: THREE.Vector3
  to: THREE.Vector3
  window: readonly [number, number]
  /** Taken up at this time (they become part of QH₂ or of the water). */
  until: number
}

export class ChainStory {
  readonly actors: Actor[] = []
  readonly qs: Actor[] = []
  readonly cytc: Actor[] = []
  readonly electrons: Actor[] = []
  readonly nadh: Actor
  readonly etf: Actor
  readonly beads: ProtonBeads
  readonly consumed: ConsumedProton[]
  private readonly site: (key: ProteinKey, name: string) => THREE.Vector3

  constructor(parts: StoryParts) {
    resetActorSeeds()
    this.site = (key, name) => PROTEINS[key].position.clone().add(parts.sites[key][name])
    const s = this.site

    // ------------------------------------------------------- pumped H⁺ lanes
    const lumenExit = (x: number, z = CUT_Z - 1.2): THREE.Vector3 => v(x, LUMEN.bottom + 1.1, z)
    const matrixEntry = (x: number, z = CUT_Z - 1.0): THREE.Vector3 => v(x, IMM_Y - BH - 1.6, z)
    this.beads = new ProtonBeads({
      complexI: [0, 1, 2, 3].map((i) => {
        const channel = s('complexI', `channel${i}`)
        return { entry: matrixEntry(channel.x, CUT_Z + 0.25), exit: lumenExit(channel.x, CUT_Z - 0.6) }
      }),
      complexIII: [
        { entry: s('complexIII', 'qoLeft'), exit: s('complexIII', 'lumenExitLeft') },
        { entry: s('complexIII', 'qoRight'), exit: s('complexIII', 'lumenExitRight') },
        { entry: s('complexIII', 'matrixEntry'), exit: s('complexIII', 'lumenExitLeft').add(v(0.8, 0.6, -0.6)) },
        { entry: s('complexIII', 'matrixEntry'), exit: s('complexIII', 'lumenExitRight').add(v(-0.8, 0.6, -0.6)) },
      ],
      complexIV: [0, 1].map((i) => {
        const channel = s('complexIV', 'channel')
        return { entry: matrixEntry(channel.x + i * 0.5, CUT_Z + 0.25), exit: lumenExit(channel.x + 0.6 + i * 0.6, CUT_Z - 0.6) }
      }),
    })

    // -------------------------------------------------------------- the NADH
    const nadhDock = pose(s('complexI', 'nadhDock'), euler(0, 0, 0.35))
    const nadh = actor(parts.nadh, pose(v(-26.5, IMM_Y - 21, PATH_Z), euler(0.2, 0.3, 0.9)))
    nadh
      .hold(0, T.nadhDock[0], 0.12)
      .travel(T.nadhDock[0], T.nadhDock[1], nadhDock, { via: [v(-27.5, IMM_Y - 18.5, PATH_Z + 0.4)], jiggle: 0.08, ease: EASE.out })
      .hold(T.nadhDock[1], T.nadSinks[0])
      .travel(T.nadSinks[0], T.nadSinks[1], pose(v(-26.2, IMM_Y - 19.5, PATH_Z - 0.4), euler(0.3, 0.2, 0.6)), { ease: EASE.inOut, jiggle: 0.1 })
      .hold(T.nadSinks[1], at('quinone', 1.0), 0.1)
      .travel(at('quinone', 1.0), at('quinone', 3.5), pose(v(-25, IMM_Y - 30, PATH_Z - 2)), { ease: EASE.in })
      .hide(at('quinone', 3.5), DURATION)
    this.nadh = nadh
    this.actors.push(nadh)

    // -------------------------------------------------------------- the Q
    const qoLeft = s('complexIII', 'qoLeft')
    const qoRight = s('complexIII', 'qoRight')
    const qSiteI = s('complexI', 'q')
    const qSiteEtfQo = v(PROTEINS.etfQo.position.x + 0.2, IMM_Y - 0.5, Q_Z)
    const qSiteII = s('complexII', 'q')
    const inPlane = (p: THREE.Vector3): Pose => pose(v(p.x, p.y, Q_Z))
    Q_POOL_X.forEach((x, i) => {
      const rest = qPose(x, IMM_Y + (i % 2 ? 0.25 : -0.25))
      const q = actor(parts.qs[i], i === 0 ? inPlane(qSiteI) : rest)
      if (i === 0) {
        // The NADH pair's Q: reduced at complex I, through the bilayer to III, back to the pool.
        q.hold(0, T.qToIII[0])
          .travel(T.qToIII[0], T.qToIII[1], inPlane(qoLeft), { via: [v(-22, IMM_Y + 0.3, Q_Z), v(-11, IMM_Y - 0.3, Q_Z)], ease: EASE.inOut, jiggle: 0.05 })
          .hold(T.qToIII[1], T.qBack[0])
          .travel(T.qBack[0], T.qBack[1], qPose(-12.5, IMM_Y + 0.2), { ease: EASE.inOut, jiggle: 0.05 })
      } else if (i === 3) {
        // The β-oxidation pair's Q: to ETF-QO, reduced, then to III's right Qo.
        q.hold(0, T.qToEtfQo[0], 0.06)
          .travel(T.qToEtfQo[0], T.qToEtfQo[1], inPlane(qSiteEtfQo), { ease: EASE.inOut, jiggle: 0.05 })
          .hold(T.qToEtfQo[1], T.qToIIIb[0])
          .travel(T.qToIIIb[0], T.qToIIIb[1], inPlane(qoRight), { ease: EASE.inOut, jiggle: 0.04 })
          .hold(T.qToIIIb[1], T.qBackB[0])
          .travel(T.qBackB[0], T.qBackB[1], qPose(9.5, IMM_Y - 0.2), { ease: EASE.inOut, jiggle: 0.05 })
      } else if (i === 4) {
        // The Krebs pair's Q: to complex II, reduced there.
        q.hold(0, T.qToII[0], 0.06).travel(T.qToII[0], T.qToII[1], inPlane(qSiteII), { ease: EASE.inOut, jiggle: 0.05 })
      } else {
        q.hold(0, T.fluxEvents[0], 0.06)
      }
      this.qs.push(q)
      this.actors.push(q)
    })

    // ------------------------------------------------------- cytochromes c
    const padLeft = s('complexIII', 'padLeft')
    const padRight = s('complexIII', 'padRight')
    const padIV = s('complexIV', 'pad')
    const onPad = (pad: THREE.Vector3, dx = 0): Pose => pose(v(pad.x + dx, pad.y + 1.3, CUT_Z - 1.1), euler(0, 0, 0))
    const lane = (x: number, dz = 0): Pose => pose(v(x, CYT_C_Y + 0.5, CUT_Z - 1.4 + dz), euler(0, 0.2, 0))
    const restPoses = [lane(-7.5), lane(-11, -2.2), lane(6.5), lane(10, -2.2)]
    restPoses.forEach((rest, i) => {
      const c = actor(parts.cytc[i], rest)
      if (i < 2) {
        const pad = i === 0 ? padLeft : padRight
        c.hold(0, T.cytcDock[0], 0.1)
          .travel(T.cytcDock[0], T.cytcDock[1], onPad(pad), { ease: EASE.inOut, jiggle: 0.06 })
          .hold(T.cytcDock[1], T.cytcToIV[i][0])
          .travel(T.cytcToIV[i][0], T.cytcToIV[i][1], i === 0 ? onPad(padIV) : onPad(padIV, -3.0), { via: [v(14 - i * 2, CYT_C_Y + 1.0, CUT_Z - 1.6 - i)], ease: EASE.inOut, jiggle: 0.06 })
        if (i === 0) {
          c.hold(T.cytcToIV[0][1], T.cytc1Leaves[0]).travel(T.cytc1Leaves[0], T.cytc1Leaves[1], lane(35.5, -1.4), { ease: EASE.inOut })
        } else {
          c.hold(T.cytcToIV[1][1], T.cytc2Docks[0]).travel(T.cytc2Docks[0], T.cytc2Docks[1], onPad(padIV), { ease: EASE.inOut })
            .hold(T.cytc2Docks[1], at('complexIV', 8.0)).travel(at('complexIV', 8.0), at('complexIV', 9.5), lane(27, -1.6), { ease: EASE.inOut })
        }
      } else {
        // The second pair's cytochromes c (oxygen step).
        const pad = i === 2 ? padLeft : padRight
        c.hold(0, T.cytcDockB[0], 0.1)
          .travel(T.cytcDockB[0], T.cytcDockB[1], onPad(pad), { ease: EASE.inOut, jiggle: 0.06 })
          .hold(T.cytcDockB[1], T.cytcToIVb[0])
        if (i === 2) {
          c.travel(T.cytcToIVb[0], T.cytcToIVb[1], onPad(padIV), { via: [v(16, CYT_C_Y + 1.0, CUT_Z - 1.6)], ease: EASE.inOut })
            .hold(T.cytcToIVb[1], T.cytcSwap[0])
            .travel(T.cytcSwap[0], T.cytcSwap[1], lane(35.5, -1.4), { ease: EASE.inOut })
        } else {
          c.travel(T.cytcToIVb[0], T.cytcToIVb[1], onPad(padIV, -3.0), { via: [v(14, CYT_C_Y + 1.2, CUT_Z - 2.6)], ease: EASE.inOut })
            .hold(T.cytcToIVb[1], T.cytcSwap[0] + 0.1)
            .travel(T.cytcSwap[0] + 0.1, T.cytcSwap[1], onPad(padIV), { ease: EASE.inOut })
            .hold(T.cytcSwap[1], at('oxygen', 10.0))
            .travel(at('oxygen', 10.0), at('oxygen', 11.5), lane(27, -1.6), { ease: EASE.inOut })
        }
      }
      this.cytc.push(c)
      this.actors.push(c)
    })

    // --------------------------------------------------------------- the ETF
    const etfRest = pose(PROTEINS.etf.position.clone(), euler(0.1, 0.4, 0.1))
    const etfAtAcad = pose(s('acad', 'etfDock'), euler(0, 0.2, 0))
    const etfAtQo = pose(s('etfQo', 'etfDock'), euler(0, -0.2, 0))
    const etf = actor(parts.etf, etfRest)
    etf
      .hold(0, T.etfToAcad[0], 0.1)
      .travel(T.etfToAcad[0], T.etfToAcad[1], etfAtAcad, { jiggle: 0.08 })
      .hold(T.etfToAcad[1], T.etfToQo[0])
      .travel(T.etfToQo[0], T.etfToQo[1], etfAtQo, { jiggle: 0.06 })
      .hold(T.etfToQo[1], T.etfBack[0])
      .travel(T.etfBack[0], T.etfBack[1], etfRest, { jiggle: 0.08 })
      .hold(T.etfBack[1], DURATION, 0.1)
    this.etf = etf
    this.actors.push(etf)

    // -------------------------------------------------------------- electrons
    // e⁻ 0/1: the NADH pair. e⁻ 2/3: the β-oxidation FADH₂ pair. e⁻ 4/5: complex II's.
    const relaysI = [0, 1, 2, 3, 4, 5, 6].map((i) => s('complexI', `relay${i}`).add(v(0, 0, 0.35)))
    const onPill = (i: number): Pose => pose(v(i ? 0.32 : -0.32, 0.05, 0.2), euler(0, 0, i ? 0.25 : -0.25))
    const onQ = (i: number): Pose => pose(v(i ? 0.2 : -0.2, 0.45, 0.15), euler(0, 0, i ? 0.2 : -0.2))
    const onCytc = pose(v(0.1, 0.35, 1.9), euler(0, 0, 0.2))
    const siteIV = s('complexIV', 'site').add(v(0, 0, 0.1))
    const atSite = (i: number): Pose => pose(siteIV.clone().add(v(-0.45 + 0.3 * i, 0.35, 0.3)), euler(0, 0, 0.2 * (i - 1.5)))
    const ivPath = [s('complexIV', 'cuA').add(v(0, 0, 0.35)), s('complexIV', 'hemeA').add(v(0, 0, 0.35))]
    const iiiPath = (side: 'Left' | 'Right'): THREE.Vector3[] => [s('complexIII', `rieske${side}`).add(v(0, 0, 0.35)), s('complexIII', `c1${side}`).add(v(0, 0, 0.35))]
    const qActor = (i: number): Actor => this.qs[i]
    for (let i = 0; i < 6; i++) {
      const lag = (i % 2) * 0.25
      if (i < 2) {
        const e = actor(parts.electrons[i], attachedPose(nadh, onPill(i))(0))
        const hop0 = T.relayHops[0] + lag
        const hop1 = T.relayHops[1] + lag
        const cyt = this.cytc[i]
        const toCytc = T.toCytc[i]
        const toSite = i === 0 ? T.toSite1 : T.toSite2
        e.follow(0, hop0, nadh, onPill(i))
          .travel(hop0, hop1, pose(qSiteI.clone().add(v(i ? 0.25 : -0.25, 0.45, 0.4))), { via: relaysI, ease: EASE.linear })
          .travel(hop1, T.qReducedI, attachedPose(qActor(0), onQ(i)))
          .follow(T.qReducedI, toCytc[0], qActor(0), onQ(i))
          .travel(toCytc[0], toCytc[1], attachedPose(cyt, onCytc), { via: iiiPath(i === 0 ? 'Left' : 'Right'), ease: EASE.inOut })
          .follow(toCytc[1], toSite[0], cyt, onCytc)
          .travel(toSite[0], toSite[1], atSite(i), { via: ivPath, ease: EASE.inOut })
          .hold(toSite[1], T.water)
          .hide(T.water, DURATION)
        this.electrons.push(e)
        this.actors.push(e)
      } else if (i < 4) {
        const k = i - 2
        const onEtf = pose(v(k ? 0.3 : -0.3, 2.3, 0.9), euler(0, 0, k ? 0.2 : -0.2))
        const e = actor(parts.electrons[i], pose(s('acad', 'fad').add(v(k ? 0.32 : -0.32, 0.35, 0.3)), euler(0, 0, k ? 0.25 : -0.25)))
        const cyt = this.cytc[2 + k]
        const toSite = k === 0 ? T.toSite3 : T.toSite4
        e.hide(0, at('etf', 0))
          .hold(at('etf', 0), T.fadToEtf[0])
          .travel(T.fadToEtf[0], T.fadToEtf[1], attachedPose(etf, onEtf), { ease: EASE.out })
          .follow(T.fadToEtf[1], T.toQEtfQo[0], etf, onEtf)
          .travel(T.toQEtfQo[0], T.toQEtfQo[1], attachedPose(qActor(3), onQ(k)), { via: [qSiteEtfQo.clone().add(v(0, -2.6, 0.6))], ease: EASE.inOut })
          .follow(T.toQEtfQo[1], T.toCytcB[0] + k * 0.3, qActor(3), onQ(k))
          .travel(T.toCytcB[0] + k * 0.3, T.toCytcB[1], attachedPose(cyt, onCytc), { via: iiiPath(k === 0 ? 'Left' : 'Right'), ease: EASE.inOut })
          .follow(T.toCytcB[1], toSite[0], cyt, onCytc)
          .travel(toSite[0], toSite[1], atSite(2 + k), { via: ivPath, ease: EASE.inOut })
          .hold(toSite[1], T.water)
          .hide(T.water, DURATION)
        this.electrons.push(e)
        this.actors.push(e)
      } else {
        const k = i - 4
        const relaysII = [0, 1, 2].map((r) => s('complexII', `relay${r}`).add(v(0, 0, 0.35)))
        const e = actor(parts.electrons[i], pose(s('complexII', 'fad').add(v(k ? 0.32 : -0.32, 0.35, 0.45)), euler(0, 0, k ? 0.25 : -0.25)))
        e.hide(0, at('complexII', 0))
          .hold(at('complexII', 0), T.relayHopsII[0] + k * 0.25)
          .travel(T.relayHopsII[0] + k * 0.25, T.relayHopsII[1] - (1 - k) * 0.25, pose(qSiteII.clone().add(v(k ? 0.25 : -0.25, 0.45, 0.4))), { via: relaysII, ease: EASE.linear })
          .travel(T.relayHopsII[1], T.qReducedII, attachedPose(qActor(4), onQ(k)))
          .follow(T.qReducedII, at('flux', 1.0), qActor(4), onQ(k))
          .hide(at('flux', 1.0), DURATION)
        this.electrons.push(e)
        this.actors.push(e)
      }
    }

    // --------------------------------------------------------------- O₂, H₂O
    const oxygen = actor(parts.oxygen, pose(v(31.5, IMM_Y - 13, PATH_Z), euler(0.3, 0.2, 0.4)))
    oxygen
      .hide(0, T.oxygenIn[0] - 0.3)
      .hold(T.oxygenIn[0] - 0.3, T.oxygenIn[0])
      .travel(T.oxygenIn[0], T.oxygenIn[1], pose(siteIV.clone().add(v(0.1, -0.55, -0.1)), euler(0, 0, 0.3)), { via: [s('complexIV', 'matrixEntry')], ease: EASE.out, jiggle: 0.06 })
      .hold(T.oxygenIn[1], T.water)
      .hide(T.water, DURATION)
    this.actors.push(oxygen)
    parts.water.forEach((object, k) => {
      const water = actor(object, pose(siteIV.clone(), euler(0, 0, 0)))
      water
        .hide(0, T.water)
        .hold(T.water, T.waterOut[0])
        .travel(T.waterOut[0], T.waterOut[1], pose(v(30.0 + 1.6 * k, IMM_Y - 6.8 - 0.4 * k, PATH_Z + 0.6), euler(0, 0, 0.3 * (k ? 1 : -1))), { via: [s('complexIV', 'matrixEntry')], ease: EASE.out, jiggle: 0.06 })
        .hold(T.waterOut[1], at('flux', 0.5), 0.08)
        .travel(at('flux', 0.5), at('flux', 2.0), pose(v(30.5 + 2 * k, IMM_Y - 16, PATH_Z - 1.5)), { ease: EASE.in })
        .hide(at('flux', 2.0), DURATION)
      this.actors.push(water)
    })

    // -------------------------------------------- consumed matrix H⁺ (not counted)
    const below = (p: THREE.Vector3, dx = 0): THREE.Vector3 => v(p.x + dx, IMM_Y - BH - 3.2, p.z + 0.2)
    this.consumed = [
      ...[0, 1].map((k) => ({ from: below(qSiteI, k ? 1.6 : 0.4), to: qSiteI.clone().add(v(k ? 0.35 : -0.35, -0.2, 0.3)), window: T.qProtonsI, until: T.qReducedI })),
      ...[0, 1].map((k) => ({ from: below(qSiteEtfQo, k ? 1.4 : -1.0), to: qSiteEtfQo.clone().add(v(k ? 0.35 : -0.35, -0.2, 0.3)), window: T.qProtonsEtfQo, until: T.qReducedEtfQo })),
      ...[0, 1].map((k) => ({ from: below(qSiteII, k ? 1.4 : -1.2), to: qSiteII.clone().add(v(k ? 0.35 : -0.35, -0.2, 0.3)), window: T.qProtonsII, until: T.qReducedII })),
      ...[0, 1, 2, 3].map((k) => ({ from: v(29.4 + 1.0 * k, IMM_Y - 9.5 - 0.4 * (k % 2), PATH_Z + 0.4), to: siteIV.clone().add(v(-0.5 + 0.33 * k, -0.7, 0.2)), window: T.waterProtons, until: T.water })),
    ]

    // ------------------------------------------------------------- the flux
    this.flux = new FluxCarriers({
      qSources: Q_POOL_X.map((_, i) => (i === 3 ? qSiteEtfQo : i === 4 ? qSiteII : qSiteI)),
      qTargets: Q_POOL_X.map((_, i) => (i % 2 ? qoRight : qoLeft)),
      pads: [padLeft, padRight],
      padIV,
      nadhDock: s('complexI', 'nadhDock'),
      acadDock: etfAtAcad.position,
      etfQoDock: etfAtQo.position,
      siteIV,
      matrixIV: s('complexIV', 'matrixEntry'),
    })
  }

  readonly flux: FluxCarriers
}

/** 0..1: how much the accelerated flux is running (carriers cycle while it is on). */
export function fluxAmount(t: number): number {
  const [f0, f1] = T.fluxEvents
  return ramp(t, f0 - 0.6, f0 + 0.4) * (1 - ramp(t, f1 + 0.8, f1 + 2.2))
}

const cycle = (t: number, period: number, phase: number): number => {
  const u = (t / period + phase) % 1
  return u < 0 ? u + 1 : u
}

interface FluxSites {
  qSources: THREE.Vector3[]
  qTargets: THREE.Vector3[]
  pads: THREE.Vector3[]
  padIV: THREE.Vector3
  nadhDock: THREE.Vector3
  acadDock: THREE.Vector3
  etfQoDock: THREE.Vector3
  siteIV: THREE.Vector3
  matrixIV: THREE.Vector3
}

/**
 * The carriers during the accelerated flux: periodic shuttles, pure functions of time
 * (the counters and the H⁺ beads stay exact, event by event). Q shuttle in the membrane
 * between their source and complex III (reduced on the way there), the cytochromes c
 * between III and IV, NADH come to complex I and leave as NAD⁺, the ETF shuttles, and an
 * O₂ arrives at complex IV for every 4 electrons while 2 H₂O leave.
 */
export class FluxCarriers {
  constructor(private readonly sites: FluxSites) {}

  q(i: number, t: number, out: THREE.Vector3): boolean {
    const u = cycle(t, 1.9, i * 0.37)
    const from = this.sites.qSources[i]
    const to = this.sites.qTargets[i]
    const going = u < 0.45
    const k = going ? EASE.inOut(u / 0.45) : u < 0.55 ? 1 : 1 - EASE.inOut((u - 0.55) / 0.45)
    out.lerpVectors(from, to, k)
    out.y = IMM_Y + 0.35 * Math.sin(6.2832 * (u + i * 0.13))
    out.z = Q_Z
    return u < 0.5 // reduced (QH₂) until it gives its electrons at III
  }

  cytc(i: number, t: number, out: THREE.Vector3): boolean {
    const u = cycle(t, 2.1, i * 0.25)
    const pad = this.sites.pads[i % 2]
    const from = v(pad.x, pad.y + 1.3, CUT_Z - 1.1 - (i >> 1) * 1.6)
    const to = v(this.sites.padIV.x - (i >> 1) * 2.2, this.sites.padIV.y + 1.3, CUT_Z - 1.1 - (i >> 1) * 1.6)
    const k = u < 0.1 ? 0 : u < 0.45 ? EASE.inOut((u - 0.1) / 0.35) : u < 0.55 ? 1 : 1 - EASE.inOut((u - 0.55) / 0.45)
    out.lerpVectors(from, to, k)
    out.y += 0.8 * Math.sin(Math.PI * k)
    return u >= 0.05 && u < 0.5 // carries one electron from III to IV
  }

  /** A NADH coming to complex I and leaving as NAD⁺; null while hidden. */
  nadh(i: number, t: number, out: THREE.Vector3): { reduced: boolean } | null {
    const u = cycle(t, 1.25, i / 3)
    if (u > 0.9) return null
    const dock = this.sites.nadhDock
    const far = v(dock.x + 2.5 - i * 1.8, dock.y - 6, dock.z - 1.0 - i * 0.8)
    if (u < 0.4) out.lerpVectors(far, dock, EASE.out(u / 0.4))
    else if (u < 0.5) out.copy(dock)
    else out.lerpVectors(dock, far.clone().add(v(-3, 0, 0)), EASE.in((u - 0.5) / 0.4))
    return { reduced: u < 0.45 }
  }

  etf(t: number, out: THREE.Vector3): void {
    const u = cycle(t, 3.2, 0.1)
    const k = u < 0.4 ? EASE.inOut(u / 0.4) : u < 0.5 ? 1 : u < 0.9 ? 1 - EASE.inOut((u - 0.5) / 0.4) : 0
    out.lerpVectors(this.sites.acadDock, this.sites.etfQoDock, k)
  }

  /** O₂ of the flux (one per two pairs reaching complex IV), pool slot `slot`. */
  oxygen(slot: number, t: number, out: THREE.Vector3): boolean {
    const events = OXYGEN_EVENTS.slice(1)
    for (let e = slot; e < events.length; e += FLUX_POOL) {
      const time = events[e]
      if (t >= time - 0.9 && t < time) {
        out.lerpVectors(this.sites.matrixIV.clone().add(v(0, -3.5, 0.3)), this.sites.siteIV.clone().add(v(0.1, -0.55, -0.1)), EASE.out((t - (time - 0.9)) / 0.9))
        return true
      }
    }
    return false
  }

  /** The two H₂O made from each flux O₂ (pool slot `slot`, molecule `k` of 2). */
  water(slot: number, k: number, t: number, out: THREE.Vector3): boolean {
    const events = OXYGEN_EVENTS.slice(1)
    for (let e = slot; e < events.length; e += FLUX_POOL) {
      const time = events[e]
      if (t >= time && t < time + 1.1) {
        const end = this.sites.matrixIV.clone().add(v(-1.2 + 2.4 * k, -4.5, 0.6))
        out.lerpVectors(this.sites.siteIV, end, EASE.out((t - time) / 1.1))
        return true
      }
    }
    return false
  }
}

/** Pool size of the flux's O₂ / H₂O glyphs (events are recycled round-robin). */
export const FLUX_POOL = 6

// --------------------------------------------------------------- reticle, gauge

export type Subject = 'nadh' | 'pair1' | 'acadFadh2' | 'pair2' | 'water' | 'fadh2II' | 'pair3' | 'none'

/** What the reticle follows (the electron pair we track, then each new one). */
export function subjectAt(t: number): Subject {
  if (t < STEP_STARTS.overview + 6) return 'none'
  if (t < T.nadhOxidized) return 'nadh'
  if (t < STEP_STARTS.etf) return 'pair1'
  if (t < T.fadToEtf[0]) return 'acadFadh2'
  if (t < T.water) return 'pair2'
  if (t < STEP_STARTS.complexII) return 'water'
  if (t < T.fadOxidizedII) return 'fadh2II'
  if (t < STEP_STARTS.flux) return 'pair3'
  return 'none'
}

export type Compartment = 'matrix' | 'innerMembrane' | 'intermembraneSpace'

export function compartmentAt(y: number): Compartment {
  if (y > IMM_Y + BH) return 'intermembraneSpace'
  if (y > IMM_Y - BH) return 'innerMembrane'
  return 'matrix'
}

// ----------------------------------------------------------------------- camera

export const ESTABLISHING: CameraShot = shot(v(-6, 2, 16), 150, 0.3, 0.12)
export const OVERVIEW: CameraShot = shot(v(-6, -1, 16), 115, 0.2, 0.08)
export const FLUX_SHOT: CameraShot = shot(v(-6, 3, 14), 115, 0.25, 0.12)
export const GRADIENT_SHOT: CameraShot = shot(v(-4, 6, 17), 70, 0.04, 0.03)

export function createCameraTrack(story: ChainStory, diveStart: CameraShot, diveEnd: CameraShot): (t: number, out: CameraShot) => CameraShot {
  const s = STEP_STARTS
  // Each close shot keeps the lumen (pumped H⁺, cytochromes c) and the matrix side of
  // its complex in view above the narration panel.
  const iShot = shot(v(-36, -4.5, 17), 46, 0.3, 0.05)
  const iiiShot = shot(v(0, 2.5, 17), 42, 0.2, 0.06)
  const ivShot = shot(v(30, 1.5, 17), 42, -0.16, 0.05)
  const etfShot = shot(v(8, -6.0, 17), 44, 0.24, -0.05)
  const iiiIvShot = shot(v(16, 1.5, 17), 62, 0.05, 0.06)
  const iiShot = shot(v(21, -3.0, 17), 38, 0.2, -0.04)
  const followQ = followShot(story.qs[0], new THREE.Vector3(), v(0, 1.0, 0), 34, 0.18, 0.06)
  const followCytc = (t: number): CameraShot => {
    const a = story.cytc[0].poseAt(t, undefined, false).position
    const b = story.cytc[1].poseAt(t, undefined, false).position
    return shot(a.clone().add(b).multiplyScalar(0.5).add(v(0, -1.0, 0)), 40, 0.12, 0.1)
  }
  const keys: ShotKey[] = [
    { t: 0, shot: diveStart },
    { t: T.dive[0], shot: diveStart },
    { t: T.dive[1], shot: diveEnd, aimFollowsZoom: true },
    { t: T.glide[1], shot: ESTABLISHING },
    { t: s.overview, shot: ESTABLISHING },
    { t: s.overview + 2.5, shot: OVERVIEW },
    { t: s.complexI, shot: OVERVIEW },
    { t: s.complexI + 3.0, shot: iShot },
    { t: s.quinone, shot: iShot },
    { t: s.quinone + 1.5, shot: followQ },
    { t: T.qToIII[1], shot: followQ },
    { t: s.complexIII, shot: followQ },
    { t: s.complexIII + 2.0, shot: iiiShot },
    { t: s.cytochromeC, shot: iiiShot },
    { t: s.cytochromeC + 1.5, shot: followCytc },
    { t: T.cytcToIV[0][1], shot: followCytc },
    { t: s.complexIV, shot: followCytc },
    { t: s.complexIV + 1.5, shot: ivShot },
    { t: s.etf, shot: ivShot },
    { t: s.etf + 3.0, shot: etfShot },
    { t: s.oxygen, shot: etfShot },
    { t: s.oxygen + 1.5, shot: iiiIvShot },
    { t: s.complexII, shot: iiiIvShot },
    { t: s.complexII + 2.5, shot: iiShot },
    { t: s.flux, shot: iiShot },
    { t: s.flux + 3.0, shot: FLUX_SHOT },
    { t: s.gradient, shot: FLUX_SHOT },
    { t: s.gradient + 2.5, shot: GRADIENT_SHOT },
    { t: T.outroPull[0], shot: GRADIENT_SHOT },
    { t: T.outroPull[1], shot: diveStart, aimFollowsZoom: true },
    { t: DURATION, shot: diveStart },
  ]
  return createShotTrack(keys)
}
