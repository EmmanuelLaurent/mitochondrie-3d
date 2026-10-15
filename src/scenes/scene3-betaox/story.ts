import * as THREE from 'three'
import { BETA_OXIDATION, KREBS_PER_ACETYL_COA, SOLUBLE_ENZYMES_FROM_CARBONS } from '../../config/science.config'
import { createShotTrack, followShot, shot, type CameraShot, type ShotKey } from '../shared/molecular/camera'
import { Actor, EASE, attachedPose, createLiveliness, euler, pose, ramp, resetActorSeeds, type Pose } from '../shared/molecular/choreography'
import { CRISTA_SHOT, cristaShotAround, MATRIX_REST } from '../shared/molecular/continuity'
import { PATH_Z, facing, v } from '../shared/molecular/frame'
import type { BetaMark } from '../shared/molecular/molecules'
import { BOX_ENTRY, BOX_EXIT, COA_RESERVOIR, KREBS_BOX, MATRIX_FACE, PRODUCT_ROW, PROTEINS, QUEUE, TFP_POCKETS, type ProteinKey } from './layout'

/**
 * Scene 3's storyboard as data, every pose and counter a pure function of the timeline
 * time (see scene 2). One turn of the Lynen helix is shown reaction by reaction, the
 * second turn in one step, turns 3–6 fast, the last turn (C4 → 2 acetyl-CoA), then the
 * Krebs cycle as a black box: one acetyl-CoA in detail, the seven others at once.
 */

export const STEP_STARTS = {
  zoom: 0,
  dehydrogenation: 14,
  electrons: 31,
  hydration: 49,
  oxidation: 61,
  thiolysis: 78,
  turn2: 95,
  fastTurns: 114,
  lastTurn: 133,
  krebs: 151,
  bilan: 172,
} as const

export type StepId = keyof typeof STEP_STARTS

export const DURATION = 190

/** Length of each step's still end state (arrêt), in seconds. */
export const ARRET = 3.5

const at = (step: StepId, offset: number): number => STEP_STARTS[step] + offset

const CARBONS = BETA_OXIDATION.chainCarbons
const TURN_COUNT = BETA_OXIDATION.cyclesForPalmitate

/** One turn of the Lynen helix: when each of its four reactions happens. */
export interface Turn {
  /** Reaction 1: FAD → FADH₂ (counted), C2=C3 forms just after. */
  dehydrogenation: number
  /** Reaction 2: –OH on C3. */
  hydration: number
  /** Reaction 3: NAD⁺ → NADH (counted), C3 becomes C=O. */
  oxidation: number
  /** Reaction 4: thiolase cut. */
  cut: number
  /** The acetyl group(s) cut off have become the orange losange (acetyl-CoA counted). */
  acetylFormed: number
}

const fastTurn = (index: number): Turn => {
  const base = at('fastTurns', 2.5 + 2.5 * index)
  return { dehydrogenation: base, hydration: base + 0.25, oxidation: base + 0.5, cut: base + 1.0, acetylFormed: base + 1.6 }
}

/** The seven turns (the last one splits C4 into two acetyl-CoA). */
export const TURNS: Turn[] = [
  { dehydrogenation: at('dehydrogenation', 5.4), hydration: at('hydration', 5.6), oxidation: at('oxidation', 5.6), cut: at('thiolysis', 5.5), acetylFormed: at('thiolysis', 7.1) },
  { dehydrogenation: at('turn2', 3.5), hydration: at('turn2', 7.6), oxidation: at('turn2', 10.0), cut: at('turn2', 12.4), acetylFormed: at('turn2', 13.5) },
  fastTurn(0),
  fastTurn(1),
  fastTurn(2),
  fastTurn(3),
  { dehydrogenation: at('lastTurn', 1.5), hydration: at('lastTurn', 2.0), oxidation: at('lastTurn', 2.5), cut: at('lastTurn', 4.0), acetylFormed: at('lastTurn', 5.2) },
]

/** Time of the c-th thiolase cut (c = 1 to 7). */
const cutTime = (c: number): number => TURNS[c - 1].cut

/** How long the CoA #k takes to pull away with the two carbons cut off. */
const pullDuration = (k: number): number => (k === 0 ? 1.0 : k === 1 ? 0.6 : 0.35)

/**
 * CoA #k (k >= 1) bonds the chain's new head at cut k, once the previous CoA has pulled
 * away with the two carbons cut off (the two never overlap).
 */
export function coaBond(k: number): [number, number] {
  const cut = cutTime(k)
  const after = cut + pullDuration(k - 1)
  return [after + 0.05, after + 0.35]
}

/**
 * When CoA #k leaves the chain carrying an acetyl group (acetyl-CoA #k + 1): at the next
 * cut; the last CoA takes the last two carbons with it as soon as it is bonded.
 */
export function coaRelease(k: number): number {
  return k < TURN_COUNT ? cutTime(k + 1) : coaBond(TURN_COUNT)[1]
}

/** Carbons left on the chain at time t (16, 14, ... 4, 2: the last two become acetyl-CoA #8). */
export function carbonsAt(t: number): number {
  return CARBONS - 2 * TURNS.filter((turn) => t >= turn.cut).length
}

/** The β-carbon's state at time t. */
export function markAt(t: number): BetaMark {
  for (const turn of TURNS) {
    if (t >= turn.cut) continue
    if (t >= turn.oxidation) return 'keto'
    if (t >= turn.hydration) return 'hydroxy'
    if (t >= turn.dehydrogenation + 0.4) return 'enoyl'
    return 'none'
  }
  return 'none'
}

/**
 * The Lynen helix at time t: which turn is under way (1–7), which of its four reactions
 * (0 before the first), the chain length it started from, and whether all turns are done.
 */
export function lynenAt(t: number): { turn: number; reaction: number; carbonsBefore: number; done: boolean } {
  let i = 0
  TURNS.forEach((turn, index) => {
    if (t >= turn.dehydrogenation) i = index
  })
  const turn = TURNS[i]
  const started = t >= TURNS[0].dehydrogenation
  const reaction = !started ? 0 : t >= turn.cut ? 4 : t >= turn.oxidation ? 3 : t >= turn.hydration ? 2 : 1
  return { turn: i + 1, reaction, carbonsBefore: CARBONS - 2 * i, done: t >= TURNS[TURN_COUNT - 1].acetylFormed }
}

/**
 * Each acetyl-CoA in the Krebs cycle: when its products are counted. The first one is
 * shown in detail, in the cycle's real order; the seven others count at once as they
 * enter (no product glyphs).
 */
export interface KrebsTurn {
  enter: [number, number]
  nadh: number[]
  fadh2: number
  gtp: number
}

const bilanEntry = (index: number): [number, number] => [at('bilan', 0.3 + 1.2 * index), at('bilan', 1.7 + 1.2 * index)]

export const KREBS: KrebsTurn[] = [
  { enter: [at('krebs', 3), at('krebs', 5)], nadh: [at('krebs', 6.5), at('krebs', 8), at('krebs', 12.5)], fadh2: at('krebs', 11), gtp: at('krebs', 9.5) },
  ...Array.from({ length: 7 }, (_, i) => {
    const enter = bilanEntry(i)
    return { enter, nadh: [enter[1], enter[1], enter[1]], fadh2: enter[1], gtp: enter[1] }
  }),
]

export const T = {
  // ×10 from the crista tier back to the molecules (the organelle dissolves into the set).
  dive: [0.5, 7.0],
  dissolve: [2.4, 4.2],
  tier: 3.3,
  glide: [7.0, 10.5],
  // Turn 1, reaction by reaction.
  toVlcad: [at('dehydrogenation', 0.3), at('dehydrogenation', 3.5)],
  fadHops: [at('dehydrogenation', 4.6), at('dehydrogenation', 5.0)],
  etfToVlcad: [at('electrons', 0.4), at('electrons', 3.4)],
  toEtf: [at('electrons', 4.0), at('electrons', 4.4)],
  fadEmptied: at('electrons', 4.6),
  etfToQo: [at('electrons', 5.0), at('electrons', 8.5)],
  intoQo: [at('electrons', 9.0), at('electrons', 9.4)],
  intoMembrane: [at('electrons', 9.4), at('electrons', 11.0)],
  etfAway: [at('hydration', 0.0), at('hydration', 1.6)],
  electronsAway: [at('hydration', 0.0), at('hydration', 1.0)],
  toPocket2: [at('hydration', 0.6), at('hydration', 3.4)],
  waterIn: [at('hydration', 3.4), at('hydration', 5.2)],
  toPocket3: [at('oxidation', 0.3), at('oxidation', 2.5)],
  nadIn: [at('oxidation', 1.0), at('oxidation', 4.0)],
  nadHops: [at('oxidation', 4.8), at('oxidation', 5.2)],
  nadhOut: [at('oxidation', 6.5), at('oxidation', 9.5)],
  nadhAway: [at('thiolysis', 0.2), at('thiolysis', 2.6)],
  toPocket4: [at('thiolysis', 0.3), at('thiolysis', 2.5)],
  coaIn: [at('thiolysis', 1.0), at('thiolysis', 4.5)],
  pullAway: [at('thiolysis', 5.5), at('thiolysis', 6.5)],
  toSlot1: [at('thiolysis', 8.0), at('thiolysis', 12.0)],
  // Turn 2 in one step.
  backToVlcad: [at('turn2', 0.3), at('turn2', 2.8)],
  etfToVlcad2: [at('turn2', 7.0), at('turn2', 8.6)],
  fadEmptied2: at('turn2', 9.0),
  etfToQo2: [at('turn2', 9.4), at('turn2', 11.0)],
  etfAway2: [at('turn2', 11.4), at('turn2', 13.0)],
  toPocket2b: [at('turn2', 5.2), at('turn2', 7.2)],
  toPocket3b: [at('turn2', 8.0), at('turn2', 9.4)],
  nadIn2: [at('turn2', 7.6), at('turn2', 9.6)],
  nadhOut2: [at('turn2', 10.4), at('turn2', 11.8)],
  toPocket4b: [at('turn2', 10.6), at('turn2', 11.9)],
  coaIn2: [at('turn2', 9.6), at('turn2', 12.0)],
  toSlot2: [at('turn2', 13.6), at('turn2', 15.4)],
  nadhAway2: [at('turn2', 11.2), at('turn2', 12.6)],
  // Turns 3–6 at the soluble enzymes, then the last turn.
  toSoluble: [at('fastTurns', 0.3), at('fastTurns', 2.5)],
  coaInLast: [at('lastTurn', 0.5), at('lastTurn', 3.6)],
  lastToSlots: [at('lastTurn', 5.4), at('lastTurn', 9.0)],
  // Krebs.
  coaReleased: at('krebs', 5.2),
  productsSettle: [at('krebs', 13), at('krebs', 17)],
  productsAway: [at('bilan', 0), at('bilan', 1.5)],
  heroInBox: bilanEntry(6)[1],
  // ÷10 back to the crista tier.
  pullBack: [at('bilan', 9.5), at('bilan', 14.5)],
  cristaDissolve: [at('bilan', 11.0), at('bilan', 12.8)],
  cristaTier: at('bilan', 11.9),
  recap: at('bilan', 14.5),
} as const

/** 0 during every arrêt, 1 otherwise. */
export const liveliness = createLiveliness(STEP_STARTS, DURATION, ARRET)

const actor = (object: THREE.Object3D, start: Pose): Actor => new Actor(object, start, liveliness)

/** The β-oxidation electron route of this chapter, as data (rule 4: never complex II). */
export const BETA_OX_ELECTRON_ROUTE: readonly ProteinKey[] = ['vlcad', 'etf', 'etfQo']

/**
 * Production counters, pure functions of the playhead (the counters are a cumulative
 * production bilan: they never drop when an acetyl-CoA enters the cycle or a FAD is
 * reoxidized). GTP is counted as ATP as soon as it is made (≈ ATP, see the tooltip).
 */
export function countersAt(t: number, activationCost: number) {
  let acetylCoA = 0
  let nadh = 0
  let fadh2 = 0
  let gtp = 0
  TURNS.forEach((turn, i) => {
    if (t >= turn.dehydrogenation) fadh2 += BETA_OXIDATION.fadh2PerCycle
    if (t >= turn.oxidation) nadh += BETA_OXIDATION.nadhPerCycle
    if (t >= turn.acetylFormed) acetylCoA += i === TURN_COUNT - 1 ? BETA_OXIDATION.lastCycleAcetylCoA : 1
  })
  for (const krebs of KREBS) {
    nadh += krebs.nadh.filter((time) => t >= time).length * (KREBS_PER_ACETYL_COA.nadh / krebs.nadh.length)
    if (t >= krebs.fadh2) fadh2 += KREBS_PER_ACETYL_COA.fadh2
    if (t >= krebs.gtp) gtp += KREBS_PER_ACETYL_COA.gtp
  }
  return { acetylCoA, nadh, fadh2, protonsPumped: 0, oxygenConsumed: 0, atp: gtp - activationCost, atpInvested: activationCost, gtp }
}

/** How many acetyl-CoA have entered the box at time t. */
export function enteredAt(t: number): number {
  return KREBS.filter((krebs) => t >= krebs.enter[1]).length
}

// --------------------------------------------------------------------- poses

const siteOf = (key: ProteinKey, local: THREE.Vector3): THREE.Vector3 => PROTEINS[key].position.clone().add(local)

/** The chain lies along +x (head to the right, tail to the left), its zig-zag facing the cut. */
const CHAIN_AXIS = v(1, 0.02, 0.03)

/**
 * Pose of the chain's original C1 frame such that its current head (carbons left) sits
 * at `head`. The frame never jumps when the chain is cut: the remaining carbons stay
 * where they are, and only the head moves to the old C3.
 */
function chainPose(head: THREE.Vector3, carbons: number, axis = CHAIN_AXIS): Pose {
  const q = facing(axis)
  const removed = CARBONS - carbons
  const offset = v(removed * 0.15, 0, 0).applyQuaternion(q)
  return pose(head.clone().add(offset), q)
}

/** Bond point of a CoA on the chain when `carbons` are left (in the original C1 frame). */
export function bondPointFor(carbons: number, base: THREE.Vector3): THREE.Vector3 {
  return base.clone().add(v(-(CARBONS - carbons) * 0.15, 0, 0))
}

/** Middle of the remaining chain (what the reticle and the camera follow), in the C1 frame. */
export function chainMiddle(carbons: number): THREE.Vector3 {
  const removed = CARBONS - carbons
  return v(-removed * 0.15 - (Math.max(1, carbons) - 1) * 0.075, 0, 0)
}

export interface StoryParts {
  chain: THREE.Object3D
  bondPoint: THREE.Vector3
  /** CoA #0 … #7: #0 is the palmitoyl-CoA's; each later one comes at a thiolase cut. */
  coas: THREE.Object3D[]
  etf: THREE.Object3D
  electrons: THREE.Object3D[]
  nads: THREE.Object3D[]
  water: THREE.Object3D
  products: { coa: THREE.Object3D; co2: THREE.Object3D[]; nadh: THREE.Object3D[]; gtp: THREE.Object3D }
  sites: Record<ProteinKey, Record<string, THREE.Vector3>>
}

export class BetaOxStory {
  readonly chain: Actor
  readonly coas: Actor[] = []
  readonly etf: Actor
  readonly actors: Actor[] = []
  private readonly site: (key: ProteinKey, name: string) => THREE.Vector3

  constructor(parts: StoryParts) {
    resetActorSeeds()
    this.site = (key, name) => siteOf(key, parts.sites[key][name])
    const pocket = (name: keyof typeof TFP_POCKETS): THREE.Vector3 => TFP_POCKETS[name].clone().add(v(0.3, 0, 0))
    const vlcadHead = this.site('vlcad', 'chainHead')
    const solubleHead = this.site('soluble', 'chainHead')
    const dip = v(25.6, MATRIX_FACE - 8.3, PATH_Z + 1.0) // under ETF-QO, between VLCAD and the TFP

    // ---------------------------------------------------------------- the chain
    const chain = actor(parts.chain, MATRIX_REST)
    const [t1] = TURNS
    chain
      .hold(0, T.toVlcad[0])
      .travel(T.toVlcad[0], T.toVlcad[1], chainPose(vlcadHead, 16), { via: [v(14.5, MATRIX_FACE - 6.4, PATH_Z + 0.8)], jiggle: 0.1 })
      .hold(T.toVlcad[1], T.toPocket2[0])
      .travel(T.toPocket2[0], T.toPocket2[1], chainPose(pocket('hydratase'), 16), { via: [dip], jiggle: 0.08 })
      .hold(T.toPocket2[1], T.toPocket3[0])
      .travel(T.toPocket3[0], T.toPocket3[1], chainPose(pocket('dehydrogenase'), 16), { via: [v(34.8, MATRIX_FACE - 4.6, PATH_Z + 0.9)], ease: EASE.inOut })
      .hold(T.toPocket3[1], T.toPocket4[0])
      .travel(T.toPocket4[0], T.toPocket4[1], chainPose(pocket('thiolase'), 16), { via: [v(38.8, MATRIX_FACE - 4.4, PATH_Z + 0.9)], ease: EASE.inOut })
      .hold(T.toPocket4[1], T.backToVlcad[0])
      // Turn 2 (C14): back to VLCAD, then the three pockets again.
      .travel(T.backToVlcad[0], T.backToVlcad[1], chainPose(vlcadHead, 14), { via: [v(33.5, MATRIX_FACE - 7.6, PATH_Z + 1.1), dip], jiggle: 0.08 })
      .hold(T.backToVlcad[1], T.toPocket2b[0])
      .travel(T.toPocket2b[0], T.toPocket2b[1], chainPose(pocket('hydratase'), 14), { via: [dip] })
      .hold(T.toPocket2b[1], T.toPocket3b[0])
      .travel(T.toPocket3b[0], T.toPocket3b[1], chainPose(pocket('dehydrogenase'), 14))
      .hold(T.toPocket3b[1], T.toPocket4b[0])
      .travel(T.toPocket4b[0], T.toPocket4b[1], chainPose(pocket('thiolase'), 14))
      .hold(T.toPocket4b[1], T.toSoluble[0])
      // Short enough: off the membrane-bound enzymes, to the soluble ones.
      .travel(T.toSoluble[0], T.toSoluble[1], chainPose(solubleHead, SOLUBLE_ENZYMES_FROM_CARBONS, v(1, 0.05, 0.05)), { via: [v(44.2, MATRIX_FACE - 10.6, PATH_Z + 1.4)], jiggle: 0.08 })
    // Each fast cut pulls the shortened chain back into the enzyme (its head stays on the site).
    let previous = T.toSoluble[1]
    TURNS.slice(2, TURN_COUNT - 1).forEach((turn, i) => {
      const after = SOLUBLE_ENZYMES_FROM_CARBONS - 2 * (i + 1)
      chain.hold(previous, turn.cut + 0.4).travel(turn.cut + 0.4, turn.cut + 0.9, chainPose(solubleHead, after, v(1, 0.05, 0.05)), { ease: EASE.inOut })
      previous = turn.cut + 0.9
    })
    const lastBond = coaBond(TURN_COUNT)[1]
    chain.hold(previous, lastBond).hide(lastBond, DURATION)
    this.chain = chain
    this.actors.push(chain)

    // ------------------------------------------------------------------- CoA
    // CoA #k binds the chain at cut k (k >= 1) and leaves at cut k + 1 carrying the two
    // carbons cut off: it is then acetyl-CoA #(k + 1), which queues for the Krebs cycle.
    // Hanging from its losange (thiol up, CoA body down).
    const queueFacing = facing(v(0.05, -1, 0.12), v(0.1, 0, 1))
    const leaveAside = v(0.9, -0.55, 0.5)
    for (let k = 0; k < 8; k++) {
      const carbonsWhenBound = CARBONS - 2 * k
      const bond = bondPointFor(carbonsWhenBound, parts.bondPoint)
      const onChain = pose(bond, new THREE.Quaternion())
      const coa = actor(parts.coas[k], k === 0 ? onChain : pose(COA_RESERVOIR.clone().add(v(k * 0.9, 0, 0)), euler(0.3, 0.2, 1.2)))
      const release = coaRelease(k)
      if (k === 0) {
        coa.follow(0, release, chain, onChain)
      } else {
        const approach: readonly [number, number] =
          k === 1 ? T.coaIn : k === 2 ? T.coaIn2 : k === TURN_COUNT ? T.coaInLast : [cutTime(k) - 1.9, cutTime(k) - 0.3]
        const waiting = pose(bond.clone().add(v(0.5, -1.05, 0.45)), euler(0, 0, -0.6))
        const [b0, b1] = coaBond(k)
        coa
          .hide(0, approach[0] - 0.4)
          .hold(approach[0] - 0.4, approach[0], 0.12)
          .travel(approach[0], approach[1], attachedPose(chain, waiting), { jiggle: 0.08, ease: EASE.out })
          .follow(approach[1], b0, chain, waiting)
          .travel(b0, b1, attachedPose(chain, onChain))
          .follow(b1, release, chain, onChain)
      }
      // Released as acetyl-CoA #(k + 1): pulls away with the two carbons, then queues.
      const pulled = release + (k < TURN_COUNT ? pullDuration(k) : 0)
      if (k < TURN_COUNT) {
        coa.travel(release, pulled, attachedPose(chain, pose(bond.clone().add(leaveAside), euler(0, 0, -0.35))), { ease: EASE.out })
      }
      const slot = QUEUE[k]
      const toSlot: readonly [number, number] =
        k === 0 ? T.toSlot1 : k === 1 ? T.toSlot2 : k >= TURN_COUNT - 1 ? [T.lastToSlots[0] + (k - 6) * 0.4, T.lastToSlots[1]] : [pulled + 0.15, pulled + 1.3]
      coa.travel(toSlot[0], toSlot[1], pose(slot, queueFacing), { ease: EASE.inOut, jiggle: 0.06 })
      const entry = KREBS[k].enter
      coa.hold(toSlot[1], entry[0], 0.08)
      if (k === 0) {
        // The first acetyl-CoA, in detail: in through the left slot, its CoA back out in front.
        coa
          .travel(entry[0], entry[1], pose(BOX_ENTRY.clone(), facing(v(1, 0, -0.2))), { via: [BOX_ENTRY.clone().add(v(-1.4, 0.2, 2.4))], ease: EASE.inOut })
          .hide(entry[1], T.coaReleased)
          .travel(T.coaReleased, T.coaReleased + 0.01, pose(BOX_EXIT.clone(), facing(v(0.3, -1, 0.2))))
          .travel(T.coaReleased + 0.01, T.coaReleased + 1.4, pose(PRODUCT_ROW[0], facing(v(0.1, 1, 0.15))), { ease: EASE.out })
          .hold(T.coaReleased + 1.4, T.productsAway[0])
          .travel(T.productsAway[0], T.productsAway[1], pose(PRODUCT_ROW[0].clone().add(v(0, -6, 0))), { ease: EASE.in })
          .hide(T.productsAway[1], DURATION)
      } else {
        coa
          .travel(entry[0], entry[1], pose(BOX_ENTRY.clone(), facing(v(1, 0, -0.2))), { via: [slot.clone().lerp(BOX_ENTRY, 0.5).add(v(0, 0.4, 1.2))], ease: EASE.inOut })
          .hide(entry[1], DURATION)
      }
      this.coas.push(coa)
      this.actors.push(coa)
    }

    // ---------------------------------------------------------------------- ETF
    const etfRest = pose(PROTEINS.etf.position.clone(), euler(0.1, 0.4, 0.1))
    const etfAtVlcad = pose(this.site('vlcad', 'etfDock'), euler(0, 0.2, 0))
    const etfAtQo = pose(this.site('etfQo', 'etfDock'), euler(0, -0.2, 0))
    const etfVia = this.site('vlcad', 'etfDock').lerp(this.site('etfQo', 'etfDock'), 0.5).add(v(0, -0.8, -0.6))
    const etf = actor(parts.etf, etfRest)
    etf
      .hold(0, T.etfToVlcad[0], 0.12)
      .travel(T.etfToVlcad[0], T.etfToVlcad[1], etfAtVlcad, { jiggle: 0.1 })
      .hold(T.etfToVlcad[1], T.etfToQo[0])
      .travel(T.etfToQo[0], T.etfToQo[1], etfAtQo, { via: [etfVia] })
      .hold(T.etfToQo[1], T.etfAway[0])
      .travel(T.etfAway[0], T.etfAway[1], etfRest, { ease: EASE.inOut, jiggle: 0.1 })
      .hold(T.etfAway[1], T.etfToVlcad2[0], 0.12)
      .travel(T.etfToVlcad2[0], T.etfToVlcad2[1], etfAtVlcad, { jiggle: 0.08 })
      // Turn 2's electrons take the same route: VLCAD → ETF → ETF-QO (rule 4).
      .hold(T.etfToVlcad2[1], T.etfToQo2[0])
      .travel(T.etfToQo2[0], T.etfToQo2[1], etfAtQo, { via: [etfVia] })
      .hold(T.etfToQo2[1], T.etfAway2[0])
      .travel(T.etfAway2[0], T.etfAway2[1], etfRest, { ease: EASE.inOut, jiggle: 0.08 })
      .hold(T.etfAway2[1], DURATION, 0.12)
    this.etf = etf
    this.actors.push(etf)

    // ------------------------------------------------------------- electrons
    // Turn 1, FAD route: chain (C2–C3) → FAD (VLCAD) → ETF → ETF-QO → membrane.
    const fad = this.site('vlcad', 'fad')
    const c23 = (t: number): Pose => {
      const p = chain.poseAt(t, undefined, false)
      p.position.add(v(-0.22 - (CARBONS - carbonsAt(t)) * 0.15, 0, 0.1).applyQuaternion(p.quaternion))
      return p
    }
    const bolt = (index: number): Pose => pose(v(0, 0, 0), euler(0, 0, index ? 0.25 : -0.25))
    const electronFad = parts.electrons.slice(0, 2)
    electronFad.forEach((object, i) => {
      const e = actor(object, c23(0))
      const hop = T.fadHops[i]
      const onFad = pose(fad.clone().add(v(i ? 0.35 : -0.35, 0.32, 0.25)), bolt(i).quaternion)
      const cargo = i ? 'cargoB' : 'cargoA'
      const onEtf = pose(parts.sites.etf[cargo].clone(), bolt(i).quaternion)
      const inMembrane = pose(this.site('etfQo', i ? 'membraneB' : 'membraneA'), bolt(i).quaternion)
      e.hide(0, hop - 0.3)
        .travel(hop - 0.3, hop, (t) => c23(t))
        .travel(hop, hop + 0.4, onFad, { ease: EASE.out })
        .hold(hop + 0.4, T.toEtf[i])
        .travel(T.toEtf[i], T.toEtf[i] + 0.4, attachedPose(etf, onEtf), { ease: EASE.out })
        .follow(T.toEtf[i] + 0.4, T.intoQo[i], etf, onEtf)
        .travel(T.intoQo[i], T.intoMembrane[1] - (1 - i) * 0.3, inMembrane, { via: [this.site('etfQo', 'etfDock').add(v(0.2, 2.6, 0.6))], ease: EASE.inOut })
        .hold(T.intoMembrane[1], T.electronsAway[0])
        // Into the bilayer, toward the ubiquinone of chapter 4 (out of sight behind the section).
        .travel(T.electronsAway[0], T.electronsAway[1], pose(inMembrane.position.clone().add(v(0, 0, -2.2)), bolt(i).quaternion), { ease: EASE.in })
        .hide(T.electronsAway[1], DURATION)
      this.actors.push(e)
    })

    // Turn 1 (and 2), NAD route: C3 → NAD⁺, which becomes NADH and leaves for complex I.
    parts.nads.forEach((object, n) => {
      const pocket3 = TFP_POCKETS.dehydrogenase
      const beside = pose(pocket3.clone().add(v(0.3, -1.2, 0.55)), euler(0, 0, 0.05))
      const [nadIn, nadhOut, nadhAway] = n === 0 ? [T.nadIn, T.nadhOut, T.nadhAway] : [T.nadIn2, T.nadhOut2, T.nadhAway2]
      const parked = pose(pocket3.clone().add(v(n === 0 ? 2.6 : 1.8, -2.1, 1.2)), euler(0.1, 0.3, 0.15))
      const nad = actor(object, pose(pocket3.clone().add(v(1.5, -9, 1.4)), euler(0.6, 0.4, 0.8)))
      nad
        .hide(0, nadIn[0] - 0.2)
        .hold(nadIn[0] - 0.2, nadIn[0])
        .travel(nadIn[0], nadIn[1], beside, { via: [pocket3.clone().add(v(1.4, -4.5, 1.2))], jiggle: 0.08, ease: EASE.out })
        .hold(nadIn[1], nadhOut[0])
        .travel(nadhOut[0], nadhOut[1], parked, { ease: EASE.inOut, jiggle: 0.08 })
        .hold(nadhOut[1], nadhAway[0], 0.1)
        .travel(nadhAway[0], nadhAway[1], pose(parked.position.clone().add(v(-0.5, -6.5, -1.5)), euler(0.3, 0.6, 0.4)), { ease: EASE.in })
        .hide(nadhAway[1], DURATION)
      this.actors.push(nad)
      if (n > 0) return
      // Turn 1's two electrons onto the NAD⁺ (they ride on the NADH afterwards).
      parts.electrons.slice(2, 4).forEach((boltObject, i) => {
        const hop = T.nadHops[i]
        const onNad = pose(v(i ? 0.32 : -0.32, 0.05, 0.2), bolt(i).quaternion)
        const e = actor(boltObject, c23(0))
        e.hide(0, hop - 0.3)
          .travel(hop - 0.3, hop, (t) => {
            const p = c23(t)
            p.position.add(v(0, -0.2, 0.1))
            return p
          })
          .travel(hop, hop + 0.4, attachedPose(nad, onNad), { ease: EASE.out })
          .follow(hop + 0.4, nadhAway[1], nad, onNad)
          .hide(nadhAway[1], DURATION)
        this.actors.push(e)
      })
    })

    // ------------------------------------------------------------------- water
    const water = actor(parts.water, pose(TFP_POCKETS.hydratase.clone().add(v(0.8, -4.5, 1.6)), euler(0.2, 0.3, 0.4)))
    water
      .hide(0, T.waterIn[0] - 0.2)
      .hold(T.waterIn[0] - 0.2, T.waterIn[0])
      .travel(T.waterIn[0], T.waterIn[1], (t) => {
        const p = c23(t)
        p.position.add(v(0, -0.45, 0.35))
        p.quaternion.identity()
        return p
      }, { jiggle: 0.06, ease: EASE.out })
      .hide(t1.hydration, DURATION)
    this.actors.push(water)

    // -------------------------------------------------------- Krebs products
    // Out of the front slot, in the cycle's real order, then a still row (then away).
    const out = (object: THREE.Object3D, time: number, slot: number, rotation: THREE.Quaternion): void => {
      const product = actor(object, pose(BOX_EXIT.clone(), rotation))
      product
        .hide(0, time - 0.2)
        .hold(time - 0.2, time)
        .travel(time, time + 1.3, pose(PRODUCT_ROW[slot], rotation), { via: [BOX_EXIT.clone().add(v(0.2, -1.4, 0.4))], ease: EASE.out })
        .hold(time + 1.3, T.productsAway[0])
        .travel(T.productsAway[0], T.productsAway[1], pose(PRODUCT_ROW[slot].clone().add(v(0, -6, 0)), rotation), { ease: EASE.in })
        .hide(T.productsAway[1], DURATION)
      this.actors.push(product)
    }
    const first = KREBS[0]
    const upright = euler(0, 0, Math.PI / 2)
    out(parts.products.co2[0], first.nadh[0], 1, upright)
    out(parts.products.nadh[0], first.nadh[0] + 0.15, 2, upright)
    out(parts.products.co2[1], first.nadh[1], 3, upright)
    out(parts.products.nadh[1], first.nadh[1] + 0.15, 4, upright)
    out(parts.products.gtp, first.gtp, 5, euler(0, 0, 0))
    out(parts.products.nadh[2], first.nadh[2], 6, upright)
    // (parts.products.coa is CoA #0 itself.)
  }
}

/** Acetyl-CoA #k + 1 (on CoA #k): from the two carbons just cut off (0) to the losange (1). */
export function acetylMorphAt(k: number, t: number): number {
  const start = coaRelease(k) + (k < TURN_COUNT ? pullDuration(k) : 0)
  return ramp(t, start, TURNS[Math.min(k, TURN_COUNT - 1)].acetylFormed, EASE.inOut)
}

/** Whether CoA #k carries an acetyl group at time t (from its release to its entry in the box). */
export function hasAcetyl(k: number, t: number): boolean {
  return t >= coaRelease(k) && t < KREBS[k].enter[1]
}

/** VLCAD's FAD is reduced (FADH₂) from reaction 1 until the ETF takes its electrons. */
export function vlcadFadReduced(t: number): boolean {
  return (t >= TURNS[0].dehydrogenation && t < T.fadEmptied) || (t >= TURNS[1].dehydrogenation && t < T.fadEmptied2)
}

/** NAD⁺ #n has become NADH. */
export function nadReduced(n: number, t: number): boolean {
  return t >= TURNS[n].oxidation
}

/** Complex II's FAD becomes FADH₂ in the detailed Krebs turn (its electrons wait for chapter 4). */
export function complexIIReduced(t: number): boolean {
  return t >= KREBS[0].fadh2
}

/**
 * Whether the chain carries a CoA at time t. Between a thiolase cut and the new CoA's
 * bond, the shortened chain is held by the thiolase (acyl-enzyme intermediate).
 */
export function chainHasCoA(t: number): boolean {
  return TURNS.every((turn, i) => t < turn.cut || t >= coaBond(i + 1)[1])
}

/**
 * What the reticle frames: the chain (`bound`: held by the thiolase, between a cut and the
 * new CoA), one acetyl-CoA (CoA index), or the Krebs box.
 */
export type ReticleSubject = { kind: 'chain'; carbons: number; mark: BetaMark; bound: boolean } | { kind: 'acetyl'; index: number } | { kind: 'box' }

/**
 * The followed molecule: the chain while it lasts; then the last acetyl-CoA, which
 * carries our palmitate's last two carbons (except while the first one enters the
 * cycle, shown in detail); finally the box, once that last acetyl-CoA is in.
 */
export function reticleAt(t: number): ReticleSubject {
  if (t >= T.heroInBox) return { kind: 'box' }
  if (t >= STEP_STARTS.krebs && t < KREBS[0].enter[1]) return { kind: 'acetyl', index: 0 }
  if (t >= coaBond(TURN_COUNT)[1]) return { kind: 'acetyl', index: TURN_COUNT }
  return { kind: 'chain', carbons: carbonsAt(t), mark: markAt(t), bound: !chainHasCoA(t) }
}

// ----------------------------------------------------------------------- camera

/** The establishing shot: the membrane on top, the enzymes below in the order of the pathway. */
export const ESTABLISHING: CameraShot = shot(v(31, -28.5, 14), 74, 0.2, 0.06)

const KREBS_SHOT = shot(v(57, -30, 14), 36, 0.15, 0.1)

/** Last frame: the crista tier around the Krebs box (between two cristae, as chapter 2 ended). */
export const END_CRISTA_SHOT = cristaShotAround(KREBS_BOX.center)

export function createCameraTrack(story: BetaOxStory): (t: number, out: CameraShot) => CameraShot {
  const s = STEP_STARTS
  const middle = (t: number): THREE.Vector3 => chainMiddle(carbonsAt(t))
  const followChain = (offset: THREE.Vector3, distance: number, azimuth: number, elevation: number): ((t: number) => CameraShot) => {
    const at16 = followShot(story.chain, chainMiddle(16), offset, distance, azimuth, elevation)
    return (t) => {
      const result = at16(t)
      // Follow the middle of what is left of the chain.
      const p = story.chain.poseAt(t, undefined, false)
      result.target.copy(middle(t)).applyQuaternion(p.quaternion).add(p.position).add(offset)
      return result
    }
  }
  const diveEnd = followChain(v(0, 0.4, 0), 22, 0.32, 0.1)
  const vlcadShot = shot(v(21, -27.5, 16), 15, 0.3, 0.08)
  const electronsShot = shot(v(25, -25.2, 15), 30, 0.2, 0.1)
  const hydrationShot = shot(v(32.5, -27.5, 16), 14, 0.28, 0.08)
  const oxidationShot = shot(v(36, -28.5, 16), 16, 0.25, 0.06)
  const thiolysisShot = shot(v(41.5, -29.2, 16.5), 18, 0.22, 0.06)
  const firstQueuedShot = shot(v(46, -29.4, 16.5), 21, 0.22, 0.06)
  const turn2Shot = shot(v(36, -28.5, 15), 36, 0.2, 0.08)
  const turn2End = shot(v(43.5, -29.6, 16), 26, 0.2, 0.07)
  const fastShot = shot(v(47.5, -33.0, 15.5), 28, 0.18, 0.06)
  const queueShot = shot(v(47.5, -31.4, 16.6), 21, 0.2, 0.06)
  const keys: ShotKey[] = [
    { t: 0, shot: CRISTA_SHOT },
    { t: T.dive[0], shot: CRISTA_SHOT },
    { t: T.dive[1], shot: diveEnd, aimFollowsZoom: true },
    { t: T.glide[1], shot: ESTABLISHING },
    { t: s.dehydrogenation, shot: ESTABLISHING },
    { t: s.dehydrogenation + 2.6, shot: vlcadShot },
    { t: s.electrons, shot: vlcadShot },
    { t: s.electrons + 2.5, shot: electronsShot },
    { t: s.hydration, shot: electronsShot },
    { t: s.hydration + 3.4, shot: hydrationShot },
    { t: s.oxidation, shot: hydrationShot },
    { t: s.oxidation + 2.4, shot: oxidationShot },
    { t: s.thiolysis, shot: oxidationShot },
    { t: s.thiolysis + 2.4, shot: thiolysisShot },
    { t: T.toSlot1[0], shot: thiolysisShot },
    { t: T.toSlot1[1], shot: firstQueuedShot },
    { t: s.turn2, shot: firstQueuedShot },
    { t: s.turn2 + 2.8, shot: turn2Shot },
    { t: T.toSlot2[0], shot: turn2Shot },
    { t: T.toSlot2[1], shot: turn2End },
    { t: s.fastTurns, shot: turn2End },
    { t: s.fastTurns + 2.5, shot: fastShot },
    { t: s.lastTurn, shot: fastShot },
    { t: s.lastTurn + 2.0, shot: queueShot },
    { t: s.krebs, shot: queueShot },
    { t: s.krebs + 3.0, shot: KREBS_SHOT },
    { t: T.pullBack[0], shot: KREBS_SHOT },
    { t: T.pullBack[1], shot: END_CRISTA_SHOT, aimFollowsZoom: true },
    { t: DURATION, shot: END_CRISTA_SHOT },
  ]
  return createShotTrack(keys)
}
