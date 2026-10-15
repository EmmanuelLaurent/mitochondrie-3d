import * as THREE from 'three'
import { ATP_SYNTHASE, BETA_OXIDATION, computePalmitateBalance, oxphosATP } from '../../config/science.config'
import { createShotTrack, shot, type CameraShot, type ShotKey } from '../shared/molecular/camera'
import { Actor, EASE, createLiveliness, euler, pose, ramp, resetActorSeeds, type Pose } from '../shared/molecular/choreography'
import { BILAYER_HALF, CUT_Z, v } from '../shared/molecular/frame'
import { ANT, HERO, LUMEN_RADIUS, PHOSPHATE_CARRIER, compartmentOf, type Compartment, type FlankPlacement } from './layout'
import { betaPocket, C_RING, CHANNEL_OUT, cSite, SYNTHASE_SITES, around } from './proteins'

/**
 * Scene 5's storyboard as data (see scenes 2–4): every pose, angle and counter is a pure
 * function of the timeline time. The rotor turns only when an H⁺ crosses Fo, one notch
 * (45°) per H⁺; the three ATP of the turn shown in detail leave F1 at 120°, 240° and 360°.
 * No H⁺ ever goes near F1's catalytic sites (rule 1).
 */

export const STEP_STARTS = {
  zoom: 0,
  machine: 15,
  gradient: 29,
  proton: 43,
  f1: 58,
  turn: 74,
  phosphate: 92,
  ant: 105,
  cost: 122,
  circuit: 136,
} as const

export type StepId = keyof typeof STEP_STARTS

export const DURATION = 156

/** Length of each step's still end state (arrêt), in seconds. */
export const ARRET = 3.5

const at = (step: StepId, offset: number): number => STEP_STARTS[step] + offset

const C = ATP_SYNTHASE.cRingSubunits
const NOTCH_DEG = 360 / C
const ATP_PER_TURN = ATP_SYNTHASE.atpPerFullRotation
const DEG_PER_ATP = 360 / ATP_PER_TURN

/** The 8 notches of the turn shown in detail: one H⁺ in, rotor +45°, one H⁺ out. */
export const NOTCHES: readonly (readonly [number, number])[] = [
  [at('proton', 5.0), at('proton', 6.4)],
  [at('f1', 3.2), at('f1', 4.6)],
  [at('f1', 6.4), at('f1', 7.8)],
  ...[0, 1, 2, 3, 4].map((i) => [at('turn', 2.5 + 1.6 * i), at('turn', 3.9 + 1.6 * i)] as const),
]

export const T = {
  // × 10 from the crista tier (the organelle, as chapters 3 and 4 begin) onto the hero dimer:
  // the organelle dissolves into the molecular set at the tip of one of its cristae.
  dive: [1.0, 8.5],
  dissolve: [5.0, 6.8],
  tier: 5.9,
  glide: [8.5, 11.0],
  // Machine: Fo, then F1, then the rotor.
  fo: [at('machine', 2.5), at('machine', 5.5)],
  f1Lit: [at('machine', 5.5), at('machine', 8.0)],
  rotorLit: [at('machine', 8.0), at('machine', 10.5)],
  dial: at('machine', 8.0),
  // Gradient.
  charges: [at('gradient', 2.5), at('gradient', 5.0)],
  pmf: [at('gradient', 5.0), at('gradient', 8.5)],
  // The hero H⁺.
  heroLeaves: [at('proton', 0.5), at('proton', 3.5)],
  heroDown: [at('proton', 3.5), at('proton', 4.6)],
  heroSeated: at('proton', 4.9),
  // F1: an ADP and a Pi drift into the open β3; another pair into β1 during the turn.
  pairIntoBeta3: [at('f1', 1.5), at('f1', 4.0)],
  pairIntoBeta1: [at('turn', 0.4), at('turn', 2.3)],
  // Pi carrier.
  piIn: [at('phosphate', 1.0), at('phosphate', 4.0)],
  picFlip: [at('phosphate', 4.0), at('phosphate', 5.5)],
  piOut: [at('phosphate', 5.5), at('phosphate', 8.0)],
  picBack: [at('phosphate', 8.0), at('phosphate', 9.0)],
  // ANT.
  atpToAnt: [at('ant', 0.5), at('ant', 3.5)],
  atpIntoAnt: [at('ant', 3.5), at('ant', 4.6)],
  antFlip: [at('ant', 4.6), at('ant', 5.8)],
  atpOut: [at('ant', 5.8), at('ant', 7.6)],
  adpIn: [at('ant', 7.0), at('ant', 8.4)],
  antFlipBack: [at('ant', 8.4), at('ant', 9.6)],
  adpOut: [at('ant', 9.6), at('ant', 11.2)],
  // Cost.
  costFo: at('cost', 3.0),
  costTransport: at('cost', 4.8),
  costTotal: at('cost', 6.6),
  costPo: at('cost', 8.4),
  // ÷ 10: the proton circuit.
  pullBack: [at('circuit', 0), at('circuit', 6.0)],
  cristaTier: at('circuit', 3.0),
  complexesLit: [at('circuit', 4.0), at('circuit', 9.0)],
  flux: [at('circuit', 4.0), at('circuit', 6.0), at('circuit', 14.0), at('circuit', 16.5)],
  counterRamp: [at('circuit', 8.0), at('circuit', 13.0)],
  recap: at('circuit', 15.0),
} as const

/** 0 during every arrêt, 1 otherwise. */
export const liveliness = createLiveliness(STEP_STARTS, DURATION, ARRET)

// ------------------------------------------------------------------- rotor

/** The hero's rotor angle from the notches of the detailed turn (degrees, 0 → 360). */
export function notchAngle(t: number): number {
  let theta = 0
  for (const [a, b] of NOTCHES) theta += NOTCH_DEG * ramp(t, a, b, EASE.inOut)
  return theta
}

/** Rotor speed during the circuit's flux (degrees per second; very slowed down). */
const FLUX_SPEED = 300

/** Accumulated rotation of every rotor during the flux (eased start and stop). */
const FLUX_TABLE = (() => {
  const [a, b, c, d] = T.flux
  const dt = 0.01
  const table: number[] = [0]
  for (let t = a; t < d; t += dt) {
    const speed = FLUX_SPEED * ramp(t, a, b) * (1 - ramp(t, c, d))
    table.push(table[table.length - 1] + speed * dt)
  }
  return table
})()

export function fluxAngle(t: number): number {
  const [a] = T.flux
  if (t <= a) return 0
  const index = (t - a) / 0.01
  const i = Math.min(FLUX_TABLE.length - 1, Math.floor(index))
  const j = Math.min(FLUX_TABLE.length - 1, i + 1)
  return THREE.MathUtils.lerp(FLUX_TABLE[i], FLUX_TABLE[j], index - i)
}

export const heroAngle = (t: number): number => notchAngle(t) + fluxAngle(t)
/** The other rotors turn only in the flux (each with its own phase and a slightly different pace). */
export const otherAngle = (index: number, t: number): number => 17 * index + fluxAngle(t) * (0.92 + 0.04 * (index % 3))

/** When the hero's rotor reaches `degrees` (bisection on the notches; Infinity if never). */
export function timeAtAngle(degrees: number): number {
  if (degrees <= 0) return 0
  let lo = 0
  let hi = NOTCHES[NOTCHES.length - 1][1]
  if (notchAngle(hi) < degrees - 1e-9) return Infinity
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (notchAngle(mid) >= degrees) hi = mid
    else lo = mid
  }
  return hi
}

/** ATP k (1–3) leaves F1 when the rotor passes k × 120°; it forms in the tightening β just before. */
export const ATP_RELEASE = [1, 2, 3].map((k) => timeAtAngle(k * DEG_PER_ATP))
export const ATP_FORM = [1, 2, 3].map((k) => timeAtAngle(k * DEG_PER_ATP - 12))

/** ATP released by the hero's F1 during the detailed turn (0–3). */
export function atpReleasedAt(t: number): number {
  return ATP_RELEASE.filter((time) => t >= time).length
}

// ----------------------------------------------------------------- counters

const balance = computePalmitateBalance()

/** The net ATP when chapter 5 starts: the 8 GTP of chapter 3 minus the activation. */
export const START_ATP = balance.gtp - BETA_OXIDATION.activationCostATP

/**
 * Counters as pure functions of time. Chapters 3 and 4 are complete; here only the ATP
 * counter moves: +1 for each ATP of the detailed turn (part of the oxidative
 * phosphorylation total, never extra), then the whole flux brings it to the bilan.
 */
export function countersAt(t: number) {
  const shown = atpReleasedAt(t)
  const oxphos = oxphosATP()
  const flux = ramp(t, T.counterRamp[0], T.counterRamp[1], EASE.inOut)
  const made = Math.round(shown + (oxphos - shown) * flux)
  return {
    acetylCoA: balance.acetylCoA,
    nadh: balance.nadh,
    fadh2: balance.fadh2,
    protonsPumped: balance.protonsPumped,
    oxygenConsumed: balance.o2Consumed,
    atp: START_ATP + made,
    atpInvested: BETA_OXIDATION.activationCostATP,
    gtp: balance.gtp,
  }
}

// ----------------------------------------------------------- the hero's frame

const heroMatrix = new THREE.Matrix4().compose(HERO.fo, HERO.quaternion, new THREE.Vector3(1, 1, 1))

/** A point of the hero monomer's frame, in the set's frame. */
export const heroWorld = (local: THREE.Vector3): THREE.Vector3 => local.clone().applyMatrix4(heroMatrix)

const placementWorld = (placement: FlankPlacement, local: THREE.Vector3): THREE.Vector3 =>
  local.clone().applyQuaternion(placement.quaternion).add(placement.position)

// ------------------------------------------------------------ the ring's H⁺

/**
 * The H⁺ of the detailed turn, one bead each: index 0 is our H⁺ (loaded at notch 1,
 * out at notch 8), 1–7 come in at notches 2–8, 8–14 sit on the ring at the start and go
 * out at notches 1–7. Site bookkeeping: at notch n the empty site at the lumen
 * half-channel is site (9 − n) mod 8, and the site passing the matrix half-channel (mid
 * notch) is site (−n) mod 8.
 */
export const RING_PROTONS = 15

interface RingProton {
  site: number
  /** Notch at which it is loaded (0: on the ring from the start). */
  inNotch: number
  /** Notch at which it leaves (Infinity: stays). */
  outNotch: number
  start: THREE.Vector3
  end: THREE.Vector3
}

const mod = (a: number, n: number): number => ((a % n) + n) % n

const RING: RingProton[] = (() => {
  const list: RingProton[] = []
  const lumenStart = (k: number): THREE.Vector3 => v(2.2 + 1.3 * Math.sin(k * 2.1), BILAYER_HALF + 3.6 + 1.6 * ((k * 0.37) % 1), 1.6 + 0.8 * Math.cos(k * 1.3))
  const matrixEnd = (k: number): THREE.Vector3 => v(4.7 + 0.95 * (k % 3), -BILAYER_HALF - 2.4 - 1.05 * Math.floor(k / 3), 2.3 - 0.25 * k)
  list.push({ site: 0, inNotch: 1, outNotch: 8, start: v(-1.6, BILAYER_HALF + 6.8, 1.4), end: v(5.6, -BILAYER_HALF - 5.6, 2.6) })
  for (let n = 2; n <= C; n++) list.push({ site: mod(9 - n, C), inNotch: n, outNotch: Infinity, start: lumenStart(n), end: v(0, 0, 0) })
  for (let n = 1; n < C; n++) list.push({ site: mod(-n, C), inNotch: 0, outNotch: n, start: v(0, 0, 0), end: matrixEnd(n) })
  return list
})()

/** Mid-time of notch n (when the site passing the matrix half-channel is right at it). */
const notchMid = (n: number): number => (NOTCHES[n - 1][0] + NOTCHES[n - 1][1]) / 2

const lerpPath = (points: THREE.Vector3[], u: number): THREE.Vector3 => {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  return curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1))
}

/**
 * Where ring H⁺ k is at time t (hero frame), or null when not shown. Before loading it
 * waits in the lumen (our H⁺ in the crowd), comes down the lumen half-channel and sits on
 * its site; it rides the ring with the rotor; mid-notch at the matrix half-channel it
 * leaves down that channel into the matrix, where it stays.
 */
export function ringProtonLocal(k: number, t: number): THREE.Vector3 {
  const p = RING[k]
  const theta = heroAngle(t)
  if (p.inNotch > 0) {
    const [n0] = NOTCHES[p.inNotch - 1]
    const hero = k === 0
    const leave = hero ? T.heroLeaves[0] : n0 - 2.2
    const mouth = hero ? T.heroLeaves[1] : n0 - 1.2
    const down = hero ? T.heroDown[1] : n0 - 0.55
    const seated = hero ? T.heroSeated : n0 - 0.1
    if (t < leave) return p.start.clone()
    if (t < mouth) return lerpPath([p.start, SYNTHASE_SITES.lumenMouth.clone().add(v(-0.4, 1.4, 0.1)), SYNTHASE_SITES.lumenMouth], ramp(t, leave, mouth, EASE.inOut))
    if (t < down) return SYNTHASE_SITES.lumenMouth.clone().lerp(SYNTHASE_SITES.lumenChannelEnd, ramp(t, mouth, down, EASE.inOut))
    if (t < seated) return SYNTHASE_SITES.lumenChannelEnd.clone().lerp(cSite(p.site, theta), ramp(t, down, seated, EASE.out))
  }
  if (p.outNotch === Infinity) return cSite(p.site, theta)
  const leaveAt = notchMid(p.outNotch)
  if (t < leaveAt) return cSite(p.site, theta)
  const hop = leaveAt + 0.35
  const channel = hop + 0.6
  const out = channel + 1.3
  const exit = around(CHANNEL_OUT, C_RING.site, 0)
  if (t < hop) return exit.lerp(SYNTHASE_SITES.matrixChannelStart, ramp(t, leaveAt, hop, EASE.out))
  if (t < channel) return SYNTHASE_SITES.matrixChannelStart.clone().lerp(SYNTHASE_SITES.matrixMouth, ramp(t, hop, channel, EASE.inOut))
  if (t < out) return lerpPath([SYNTHASE_SITES.matrixMouth, SYNTHASE_SITES.matrixMouth.clone().add(v(0.5, -0.9, 0.2)), p.end], ramp(t, channel, out, EASE.out))
  return p.end.clone()
}

/** Ring H⁺ k in the set's frame. */
export const ringProtonWorld = (k: number, t: number): THREE.Vector3 => heroWorld(ringProtonLocal(k, t))

/** Whether ring H⁺ k is on the ring (bound to a c subunit) at time t. */
export function ringProtonBound(k: number, t: number): boolean {
  const p = RING[k]
  const loaded = p.inNotch === 0 ? true : t >= (k === 0 ? T.heroSeated : NOTCHES[p.inNotch - 1][0] - 0.1)
  const left = p.outNotch !== Infinity && t >= notchMid(p.outNotch)
  return loaded && !left
}

/** When our H⁺ leaves the ring, and when it is out in the matrix. */
export const HERO_EXIT = notchMid(8)
export const HERO_OUT = HERO_EXIT + 2.25

/** Where our H⁺ is (for the reticle's name). */
export function heroCompartment(t: number): Compartment | 'ring' {
  if (ringProtonBound(0, t)) return 'ring'
  return compartmentOf(ringProtonWorld(0, t))
}

// -------------------------------------------------------- nucleotides and Pi

export type Form = 'adp' | 'atp'

export interface StoryParts {
  /** N1: ATP in β1 at the start; N2: ADP (+ Pi2) in β2 → our ATP; N3, N4: ADP + Pi from the pool; N5: ADP in through the ANT. */
  nucleotides: THREE.Object3D[]
  /** Pi2, Pi3, Pi4 (bonded at formation); Pi5 through the phosphate carrier. */
  phosphates: THREE.Object3D[]
  /** The H⁺ that comes in with Pi5. */
  symportProton: THREE.Object3D
  carrierSites: { phosphate: Record<string, THREE.Vector3>; ant: Record<string, THREE.Vector3> }
}

/** Nucleotide n's form at time t. */
export function formOf(n: number, t: number): Form {
  if (n === 0) return 'atp'
  if (n === 1) return t >= ATP_FORM[0] ? 'atp' : 'adp'
  if (n === 2) return t >= ATP_FORM[1] ? 'atp' : 'adp'
  if (n === 3) return t >= ATP_FORM[2] ? 'atp' : 'adp'
  return 'adp'
}

/** Where each released ATP rests beside the head (hero frame): ATP 1, ours, ATP 3. */
const RESTING = [around(168, 8.6, -13.2), around(18, 8.4, -10.6), around(352, 8.8, -14.8)]

/** The pool of ADP and Pi in the matrix, in front of the head (hero frame). */
const POOL = { adp3: around(205, 9.0, -7.5), pi3: around(215, 9.2, -9.0), adp4: around(178, 9.4, -7.0), pi4: around(186, 9.6, -8.6) }

const upright = euler(0, 0, 0)

export class SynthaseStory {
  readonly actors: Actor[] = []
  readonly nucleotides: Actor[] = []
  readonly phosphates: Actor[] = []
  readonly symportProton: Actor

  constructor(parts: StoryParts) {
    resetActorSeeds()
    const actor = (object: THREE.Object3D, start: Pose): Actor => {
      const a = new Actor(object, start, liveliness)
      this.actors.push(a)
      return a
    }
    const pocket = (i: number, outward = 0): THREE.Vector3 => heroWorld(betaPocket(i, outward))
    const world = (local: THREE.Vector3): THREE.Vector3 => heroWorld(local)
    const pi = (i: number): THREE.Vector3 => heroWorld(betaPocket(i, 0.6)).add(v(0, 0, 0.7))

    // ------------------------------------------------------------ nucleotides
    const [n1, n2, n3, n4, n5] = parts.nucleotides
    // N1: tight in β1 (ATP), released at 120°.
    const r = ATP_RELEASE
    this.nucleotides.push(
      actor(n1, pose(pocket(0), upright))
        .hold(0, r[0])
        .travel(r[0], r[0] + 2.6, pose(world(RESTING[0]), euler(0.2, 0.3, 0.1)), { via: [pocket(0, 2.6)], ease: EASE.out, jiggle: 0.06 })
        .hold(r[0] + 2.6, DURATION, 0.06),
    )
    // N2: ADP loose in β2 → ATP (tight) → released at 240° → beside the head → to the ANT → lumen.
    const antMatrix = placementWorld(ANT, parts.carrierSites.ant.matrixMouth).setZ(CUT_Z - 0.6)
    const antCavity = placementWorld(ANT, parts.carrierSites.ant.cavity).setZ(CUT_Z - 0.6)
    const antLumen = placementWorld(ANT, parts.carrierSites.ant.imsMouth).setZ(CUT_Z - 0.6)
    const lumenRest = antLumen.clone().add(v(-2.8, 1.2, -0.6))
    this.nucleotides.push(
      actor(n2, pose(pocket(1), upright))
        .hold(0, r[1])
        .travel(r[1], r[1] + 2.6, pose(world(RESTING[1]), euler(-0.1, 0.2, 0.15)), { via: [pocket(1, 2.4)], ease: EASE.out, jiggle: 0.06 })
        .hold(r[1] + 2.6, T.atpToAnt[0], 0.06)
        .travel(T.atpToAnt[0], T.atpToAnt[1], pose(antMatrix.clone().add(v(1.2, -0.6, 0)), upright), { via: [world(RESTING[1]).lerp(antMatrix, 0.5).add(v(2.0, 0, 0.4))], jiggle: 0.08 })
        .travel(T.atpIntoAnt[0], T.atpIntoAnt[1], pose(antCavity, upright))
        .hold(T.atpIntoAnt[1], T.atpOut[0])
        .travel(T.atpOut[0], T.atpOut[1], pose(lumenRest, euler(0.1, 0.2, 0.2)), { via: [antLumen], ease: EASE.out, jiggle: 0.06 })
        .hold(T.atpOut[1], DURATION, 0.06),
    )
    // N3: from the pool into the open β3 (f1 step) → ATP at 360°, released.
    this.nucleotides.push(
      actor(n3, pose(world(POOL.adp3), euler(0.3, 0.2, 0.4)))
        .hold(0, T.pairIntoBeta3[0], 0.08)
        .travel(T.pairIntoBeta3[0], T.pairIntoBeta3[1], pose(pocket(2), upright), { ease: EASE.inOut, jiggle: 0.06 })
        .hold(T.pairIntoBeta3[1], r[2])
        .travel(r[2], r[2] + 2.4, pose(world(RESTING[2]), euler(0.1, -0.2, 0.2)), { via: [pocket(2, 2.4)], ease: EASE.out, jiggle: 0.06 })
        .hold(r[2] + 2.4, DURATION, 0.06),
    )
    // N4: from the pool into β1 once it has released ATP 1 (turn step); it ends the turn tight.
    this.nucleotides.push(
      actor(n4, pose(world(POOL.adp4), euler(0.2, 0.5, 0.3)))
        .hold(0, T.pairIntoBeta1[0], 0.08)
        .travel(T.pairIntoBeta1[0], T.pairIntoBeta1[1], pose(pocket(0), upright), { via: [pocket(0, 3.0)], ease: EASE.inOut, jiggle: 0.06 })
        .hold(T.pairIntoBeta1[1], DURATION),
    )
    // N5: an ADP from the lumen, in through the ANT (one molecule per flip).
    const lumenAdp = antLumen.clone().add(v(-3.2, -2.4, -0.8))
    const matrixAdp = antMatrix.clone().add(v(2.6, -2.6, -0.4))
    this.nucleotides.push(
      actor(n5, pose(lumenAdp, euler(0.3, 0.1, 0.2)))
        .hide(0, T.adpIn[0] - 0.8)
        .hold(T.adpIn[0] - 0.8, T.adpIn[0], 0.06)
        .travel(T.adpIn[0], T.adpIn[1], pose(antCavity.clone().add(v(0, -0.2, 0)), upright), { via: [antLumen], jiggle: 0.04 })
        .hold(T.adpIn[1], T.adpOut[0])
        .travel(T.adpOut[0], T.adpOut[1], pose(matrixAdp, euler(0.2, 0.3, 0.1)), { via: [antMatrix], ease: EASE.out, jiggle: 0.06 })
        .hold(T.adpOut[1], DURATION, 0.06),
    )

    // ------------------------------------------------------------ phosphates
    const [p2, p3, p4, p5] = parts.phosphates
    // Each bonds onto its ADP when the ATP forms (then the ATP's own third phosphate shows).
    const phosphate = (object: THREE.Object3D, start: THREE.Vector3, into: readonly [number, number] | null, beta: number, form: number): Actor => {
      const a = actor(object, pose(start, euler(0.4, 0.2, 0.6)))
      if (into) a.hold(0, into[0], 0.08).travel(into[0], into[1], pose(pi(beta), euler(0.3, 0.1, 0.5)), { jiggle: 0.05 })
      return a.hold(into ? into[1] : 0, form).hide(form, DURATION)
    }
    this.phosphates.push(phosphate(p2, pi(1), null, 1, ATP_FORM[0]))
    this.phosphates.push(phosphate(p3, world(POOL.pi3), [T.pairIntoBeta3[0] + 0.3, T.pairIntoBeta3[1] + 0.2], 2, ATP_FORM[1]))
    this.phosphates.push(phosphate(p4, world(POOL.pi4), [T.pairIntoBeta1[0] + 0.2, T.pairIntoBeta1[1] + 0.2], 0, ATP_FORM[2]))
    // Pi5 with its H⁺, through the phosphate carrier (symport), then toward F1.
    const picLumen = placementWorld(PHOSPHATE_CARRIER, parts.carrierSites.phosphate.imsMouth).setZ(CUT_Z - 0.6)
    const picCavity = placementWorld(PHOSPHATE_CARRIER, parts.carrierSites.phosphate.cavity).setZ(CUT_Z - 0.6)
    const picMatrix = placementWorld(PHOSPHATE_CARRIER, parts.carrierSites.phosphate.matrixMouth).setZ(CUT_Z - 0.6)
    const towardF1 = picMatrix.clone().add(v(3.2, -5.5, -0.4))
    this.phosphates.push(
      actor(p5, pose(picLumen.clone().add(v(-3.6, 1.4, -0.6)), euler(0.4, 0.3, 0.2)))
        .hide(0, T.piIn[0] - 0.6)
        .hold(T.piIn[0] - 0.6, T.piIn[0], 0.06)
        .travel(T.piIn[0], T.piIn[1], pose(picCavity.clone().add(v(0, 0.35, 0)), euler(0.2, 0.1, 0.3)), { via: [picLumen], jiggle: 0.04 })
        .hold(T.piIn[1], T.piOut[0])
        .travel(T.piOut[0], T.piOut[1], pose(towardF1, euler(0.5, 0.2, 0.4)), { via: [picMatrix], ease: EASE.out, jiggle: 0.06 })
        .hold(T.piOut[1], DURATION, 0.06),
    )
    this.symportProton = actor(parts.symportProton, pose(picLumen.clone().add(v(-3.0, -1.6, -0.4))))
      .hide(0, T.piIn[0] - 0.6)
      .hold(T.piIn[0] - 0.6, T.piIn[0], 0.06)
      .travel(T.piIn[0], T.piIn[1], pose(picCavity.clone().add(v(0, -0.45, 0.1))), { via: [picLumen.clone().add(v(0, -0.6, 0))], jiggle: 0.04 })
      .hold(T.piIn[1], T.piOut[0])
      .travel(T.piOut[0], T.piOut[1], pose(picMatrix.clone().add(v(2.4, 2.0, -0.6))), { via: [picMatrix], ease: EASE.out, jiggle: 0.06 })
      .hold(T.piOut[1], DURATION, 0.06)
  }
}

/** Alternating access of the carriers: +1 open to the lumen (IMS), −1 open to the matrix. */
export function phosphateCarrierOpen(t: number): number {
  return 1 - 2 * ramp(t, T.picFlip[0], T.picFlip[1]) + 2 * ramp(t, T.picBack[0], T.picBack[1])
}

export function antOpen(t: number): number {
  // Open to the matrix at rest (it takes ATP from there), to the lumen to release it.
  return -1 + 2 * ramp(t, T.antFlip[0], T.antFlip[1]) - 2 * ramp(t, T.antFlipBack[0], T.antFlipBack[1])
}

// ----------------------------------------------------------------- reticle

export type ReticleSubject =
  | { kind: 'none' }
  | { kind: 'hero' }
  | { kind: 'nucleotide'; index: number; label: 'adpPi' | 'atpFormed' | 'ourAtp' }
  | { kind: 'phosphate'; index: number }

/** What the reticle frames: our H⁺, the ADP + Pi that becomes our ATP, the Pi of the carrier, our ATP. */
export function reticleAt(t: number): ReticleSubject {
  const s = STEP_STARTS
  if (t < s.proton || t >= s.cost) return { kind: 'none' }
  if (t < s.f1) return { kind: 'hero' }
  if (t < s.turn) return { kind: 'nucleotide', index: 1, label: t >= ATP_FORM[0] ? 'atpFormed' : 'adpPi' }
  if (t < s.phosphate) return { kind: 'hero' }
  if (t < s.ant) return { kind: 'phosphate', index: 3 }
  return { kind: 'nucleotide', index: 1, label: 'ourAtp' }
}

// ------------------------------------------------------------------ camera

/** Where the organelle's crista tip lands: the bottom of the set's lumen, on the cut. */
export const LANDING = v(0, -LUMEN_RADIUS, CUT_Z)

/** Crista tier on the organelle's cut face, around that tip (the framing of chapter 4's start). */
export const CRISTA_SHOT: CameraShot = shot(LANDING.clone().add(v(30, 55, 0)), 760, 0.14, 0.16)

export function createCameraTrack(story: SynthaseStory): (t: number, out: CameraShot) => CameraShot {
  const s = STEP_STARTS
  const dimer = shot(v(0, -13, CUT_Z - 2), 95, 0.22, 0.06)
  const monomer = shot(v(10, -12, CUT_Z - 2), 72, 0.3, 0.04)
  const gradient = shot(v(4, -8, CUT_Z), 68, 0.1, 0)
  const foClose = shot(heroWorld(v(1.5, -0.5, 0)).setZ(CUT_Z - 0.5), 28, 0.28, -0.12)
  const f1Close = shot(HERO.f1.clone(), 36, 0.22, 0.04)
  const monomerWide = shot(v(10, -12, CUT_Z - 2), 76, 0.3, 0)
  const pic = shot(v(11, 8, CUT_Z), 32, 0.25, 0.05)
  const antShot = shot(v(11, 15, CUT_Z), 34, 0.25, 0.05)
  const cost = shot(v(9, -3, CUT_Z), 105, 0.25, 0.04)
  const circuit = shot(v(0, 28, CUT_Z - 10), 290, 0.25, 0.1)
  // Following our ATP from F1 to the ANT.
  const followAtp = (t: number): CameraShot => {
    const p = story.nucleotides[1].poseAt(t, undefined, false).position
    return shot(p.clone().lerp(v(11, 15, CUT_Z), 0.35), 38, 0.25, 0.05)
  }
  const keys: ShotKey[] = [
    { t: 0, shot: CRISTA_SHOT },
    { t: T.dive[0], shot: CRISTA_SHOT },
    { t: T.dive[1], shot: dimer, aimFollowsZoom: true },
    { t: s.machine, shot: dimer },
    { t: s.machine + 2.5, shot: monomer },
    { t: s.gradient, shot: monomer },
    { t: s.gradient + 2.5, shot: gradient },
    { t: s.proton, shot: gradient },
    { t: s.proton + 2.0, shot: foClose },
    { t: s.f1, shot: foClose },
    { t: s.f1 + 3.0, shot: f1Close },
    { t: s.turn, shot: f1Close },
    { t: s.turn + 2.5, shot: monomerWide },
    { t: s.phosphate, shot: monomerWide },
    { t: s.phosphate + 2.5, shot: pic },
    { t: s.ant, shot: pic },
    { t: T.atpToAnt[0], shot: followAtp(T.atpToAnt[0]) },
    ...[0.25, 0.5, 0.75, 1].map((u) => {
      const time = THREE.MathUtils.lerp(T.atpToAnt[0], T.atpToAnt[1], u)
      return { t: time, shot: followAtp(time) }
    }),
    { t: T.atpIntoAnt[1], shot: antShot },
    { t: s.cost, shot: antShot },
    { t: s.cost + 3.0, shot: cost },
    { t: T.pullBack[0], shot: cost },
    { t: T.pullBack[1], shot: circuit, aimFollowsZoom: true },
    { t: DURATION, shot: circuit },
  ]
  return createShotTrack(keys)
}

// ---------------------------------------------------------- circuit lanes

/**
 * The proton circuit at the crista tier: enlarged H⁺ beads flowing out through the
 * complexes (matrix → lumen) and back through the synthases and the phosphate carrier
 * (lumen → matrix). Each lane is a path; beads are spaced along it and advance with the
 * flux (a pure function of time).
 */
export interface Lane {
  curve: THREE.Curve<THREE.Vector3>
  beads: number
}

export function laneProgress(t: number): number {
  // Distance travelled along every lane (in lane lengths), from the flux's rotor angle.
  return fluxAngle(t) / 360 / 1.6
}

export function lanePoint(lane: Lane, bead: number, t: number): THREE.Vector3 | null {
  const amount = ramp(t, T.flux[0], T.flux[1])
  if (amount <= 0) return null
  const u = ((((bead + 0.5) / lane.beads + laneProgress(t)) % 1) + 1) % 1
  return lane.curve.getPointAt(u)
}
