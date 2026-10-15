import * as THREE from 'three'
import { createShotTrack, followShot, type CameraShot, type ShotKey } from '../shared/molecular/camera'
import { Actor, EASE, attachedPose, createLiveliness, euler, pose, resetActorSeeds, scalarTrack, type Pose } from '../shared/molecular/choreography'
import { BILAYER_HALF, CUT_Z, PATH_Z, facing, v } from '../shared/molecular/frame'
import { PHOSPHATE_X } from '../shared/molecular/molecules'
import { PROTEINS, SET, type ProteinKey } from './layout'

/**
 * Scene 2's storyboard as data: step boundaries, event times, molecule paths and camera
 * framings, all functions of the timeline time. Each step follows the same rhythm:
 * annonce (camera settles, narration appears), action, arrêt (a still end state, which
 * the progressive renderer refines to full quality). Moves between enzymes open the next
 * step, so every step ends on a still, self-explanatory state.
 */

export const STEP_STARTS = {
  zoom: 0,
  palmitate: 14,
  activation: 23,
  cpt1: 47,
  barrier: 61,
  cact: 79,
  cpt2: 97,
  matrix: 112,
} as const

export type StepId = keyof typeof STEP_STARTS

export const DURATION = 126

/** Time `offset` seconds after the start of `step` (events are authored per step). */
const at = (step: StepId, offset: number): number => STEP_STARTS[step] + offset

export const T = {
  cutOpen: [0.3, 2.2],
  dive: [1.0, 8.0], // logarithmic dolly onto the outer membrane's surface, near the cut edge
  dissolve: [5.6, 7.1], // the organelle dissolves into the molecular set
  tier: 6.35,
  glide: [8.0, 10.4], // then down to the establishing shot, which reveals the section
  // Activation (acyl-CoA synthetase), two half-reactions.
  toAcsl: [at('activation', 0.5), at('activation', 4.0)],
  atpIn: [at('activation', 1.5), at('activation', 5.5)],
  lidClose: [at('activation', 5.5), at('activation', 6.5)],
  split: at('activation', 7.2), // ATP → AMP + PPi: the ATP counter drops by the activation cost here, once
  ppiOut: [at('activation', 7.4), at('activation', 10.8)],
  hydrolysis: at('activation', 11.8), // PPi → 2 Pi at the pyrophosphatase
  piAway: [at('activation', 11.9), at('activation', 15.5)],
  coaIn: [at('activation', 8.6), at('activation', 12.2)],
  lidSwing: [at('activation', 12.2), at('activation', 13.2)],
  thioester: at('activation', 13.8), // CoA takes the acyl group, AMP leaves
  ampOut: [at('activation', 14.0), at('activation', 17.4)],
  lidRest: [at('activation', 16.5), at('activation', 17.5)],
  // CPT1: the step ends on the swap, the released CoA in view.
  leaveAcsl: [at('cpt1', 0.2), at('cpt1', 2.4)],
  ampAway: [at('cpt1', 0.3), at('cpt1', 3.3)], // the AMP drifts off as the camera leaves the ACSL
  carnitineIn: [at('cpt1', 0.6), at('cpt1', 5.0)],
  toCpt1: [at('cpt1', 2.4), at('cpt1', 5.4)],
  swap1: at('cpt1', 7.0),
  coaOut: [at('cpt1', 7.3), at('cpt1', 9.0)],
  /** AMP and Pi, off-screen by now, are tidied away (never during an arrêt). */
  cleanup: at('cpt1', 6.0),
  // Through the porin (the outer membrane lets it pass), then the real barrier.
  toPorin: [at('barrier', 0.4), at('barrier', 3.4)],
  throughPorin: [at('barrier', 3.4), at('barrier', 7.0)],
  intoIms: [at('barrier', 7.0), at('barrier', 9.0)],
  settleIms: at('barrier', 10.2),
  barrierView: [at('barrier', 10.4), at('barrier', 13.0)],
  // CACT antiport, one molecule at a time.
  toCact: [at('cact', 0.5), at('cact', 3.8)],
  intoCavity: [at('cact', 3.8), at('cact', 5.2)],
  flipIn: [at('cact', 5.2), at('cact', 6.6)],
  outOfCact: [at('cact', 6.7), at('cact', 8.6)], // fully out of the channel before the carnitine enters
  matrixCarnitineIn: [at('cact', 9.2), at('cact', 10.6)],
  flipOut: [at('cact', 10.6), at('cact', 12.0)],
  carnitineToIms: [at('cact', 12.0), at('cact', 14.2)],
  // CPT2.
  dockCpt2: [at('cpt2', 0.3), at('cpt2', 2.2)],
  coaMatrixIn: [at('cpt2', 0.8), at('cpt2', 4.4)],
  swap2: at('cpt2', 5.2),
  carnitineBack: [at('cpt2', 5.5), at('cpt2', 8.8)],
  release2: [at('cpt2', 6.2), at('cpt2', 9.6)],
  // Matrix.
  pullBack: [at('matrix', 0.2), at('matrix', 7.0)], // ÷10: out of the molecular set, into the crista view
  cristaDissolve: [at('matrix', 2.4), at('matrix', 4.2)],
  cristaTier: at('matrix', 3.3),
  recap: at('matrix', 5.5),
} as const

/** Length of each step's still end state (arrêt), in seconds. */
export const ARRET = 3.5

/** 0 during every arrêt, 1 otherwise, with short fades: nothing jitters while the student reads. */
export const liveliness = createLiveliness(STEP_STARTS, DURATION, ARRET)

const actor = (object: THREE.Object3D, start: Pose): Actor => new Actor(object, start, liveliness)

/** World position of a protein's site. */
export function siteOf(key: ProteinKey, local: THREE.Vector3): THREE.Vector3 {
  return PROTEINS[key].position.clone().add(local)
}

/**
 * When each protein is at work: it stays lit and named. Windows follow the steps (no
 * lead-in across a step boundary), so each arrêt names exactly what it shows.
 */
export const PROTEIN_WINDOWS: Record<ProteinKey, [number, number][]> = {
  acsl: [[STEP_STARTS.activation, T.leaveAcsl[1]]],
  pyrophosphatase: [[T.ppiOut[0], T.piAway[1]]],
  cpt1: [[STEP_STARTS.cpt1, STEP_STARTS.barrier]],
  porin: [[T.toPorin[0], T.intoIms[1] + 0.6]],
  cact: [[T.barrierView[0], STEP_STARTS.cpt2]],
  cpt2: [[STEP_STARTS.cpt2, STEP_STARTS.matrix]],
}

export function isAtWork(key: ProteinKey, t: number): boolean {
  return PROTEIN_WINDOWS[key].some(([a, b]) => t >= a && t < b)
}

export interface StoryParts {
  chain: THREE.Object3D
  freeOxygen: THREE.Object3D
  bondPoint: THREE.Vector3
  adenosine: THREE.Object3D
  setAdenosineCharged(charged: boolean): void
  linkAlphaBeta: THREE.Object3D
  phosphateBeta: THREE.Object3D
  phosphateGamma: THREE.Object3D
  linkBetaGamma: THREE.Object3D
  coaCytosol: THREE.Object3D
  coaMatrix: THREE.Object3D
  carnitineIn: THREE.Object3D
  carnitineOut: THREE.Object3D
  sites: Record<ProteinKey, Record<string, THREE.Vector3>>
}

export type NameTag = 'palmitate' | 'activating' | 'palmitoylCoA' | 'palmitoylcarnitine'

/** Which compartment the followed molecule is in, for the "Vous êtes ici" gauge. */
export type Compartment = 'cytosol' | 'outerMembrane' | 'intermembraneSpace' | 'innerMembrane' | 'matrix'

/**
 * Name of the followed molecule at time t: it changes only at the enzymes, once the
 * incoming carrier is docked (CACT transports it unchanged).
 */
export function nameAt(t: number): NameTag {
  if (t < T.split) return 'palmitate'
  if (t < T.thioester) return 'activating'
  if (t < T.swap1) return 'palmitoylCoA'
  if (t < T.swap2) return 'palmitoylcarnitine'
  return 'palmitoylCoA'
}

/**
 * The journey counters during scene 2, a pure function of the playhead: one jump of
 * the ATP balance (activation cost) on the frame where the ATP is cut into AMP + PPi,
 * nothing else. Stepping back undoes it; replaying never counts it twice.
 */
export function countersAt(t: number, activationCost: number): { atp: number; atpInvested: number } {
  const paid = t >= T.split
  return { atp: paid ? -activationCost : 0, atpInvested: paid ? activationCost : 0 }
}

export function compartmentAt(y: number): Compartment {
  if (y > SET.ommY + BILAYER_HALF) return 'cytosol'
  if (y > SET.ommY - BILAYER_HALF) return 'outerMembrane'
  if (y > SET.immY + BILAYER_HALF) return 'intermembraneSpace'
  if (y > SET.immY - BILAYER_HALF) return 'innerMembrane'
  return 'matrix'
}

export class ShuttleStory {
  readonly chain: Actor
  readonly actors: Actor[] = []
  private readonly site: (key: ProteinKey, name: string) => THREE.Vector3

  constructor(private readonly parts: StoryParts) {
    resetActorSeeds()
    this.site = (key, name) => siteOf(key, parts.sites[key][name])
    const bond = parts.bondPoint

    // ---------------------------------------------------------------- the chain
    const tailUpLeft = v(-0.82, 0.5, -0.1)
    const start = pose(v(-25.5, 9.2, PATH_Z + 0.4), facing(tailUpLeft.clone().negate()))
    const chain = actor(parts.chain, start)
    const acslDock = pose(this.site('acsl', 'fattyAcid'), facing(v(0.9, -0.42, 0.05)))
    const acslExit = pose(this.site('acsl', 'exit'), facing(v(0.95, -0.15, 0.1)))
    const cpt1Dock = pose(this.site('cpt1', 'acylCoA'), facing(v(0.96, -0.2, 0.05)))
    const porinTop = pose(this.site('porin', 'top').add(v(0, 0.6, -0.4)), facing(v(0.05, -1, 0.02)))
    const porinBottom = pose(this.site('porin', 'bottom').add(v(0, -0.6, -0.4)), facing(v(0.05, -1, 0.02)))
    const imsHover = pose(v(3.5, SET.immY + BILAYER_HALF + 5.2, PATH_Z), facing(v(0.6, -0.8, 0.02)))
    const cactMouth = pose(this.site('cact', 'imsMouth').add(v(0, 1.4, -0.5)), facing(v(0.02, -1, 0)))
    const cactCavity = pose(this.site('cact', 'cavity').add(v(0, 0.4, -0.5)), facing(v(0.02, -1, 0)))
    // Straight down out of the open matrix gate (the whole chain clears the helices), then
    // swung horizontal, parked clear of the channel while the free carnitine goes in.
    const cactBelow = pose(this.site('cact', 'matrixMouth').add(v(0.2, -2.9, -0.6)), facing(v(0.02, -1, 0)))
    const cactExit = pose(v(13.2, SET.immY - BILAYER_HALF - 2.3, PATH_Z), facing(v(1, -0.12, 0.05)))
    const cpt2Dock = pose(this.site('cpt2', 'acylCarnitine'), facing(v(0.85, -0.5, 0.05)))

    chain
      .hold(0, T.toAcsl[0], 0.18)
      .travel(T.toAcsl[0], T.toAcsl[1], acslDock, { via: [v(-23.5, 8.4, PATH_Z + 0.6)], jiggle: 0.12 })
      .hold(T.toAcsl[1], T.leaveAcsl[0])
      .travel(T.leaveAcsl[0], T.leaveAcsl[1], acslExit, { ease: EASE.inOut })
      .hold(T.leaveAcsl[1], T.toCpt1[0], 0.12)
      .travel(T.toCpt1[0], T.toCpt1[1], cpt1Dock, { via: [v(-14.5, 8.6, PATH_Z + 0.5)], jiggle: 0.1 })
      .hold(T.toCpt1[1], T.toPorin[0])
      .travel(T.toPorin[0], T.toPorin[1], porinTop, { via: [v(-5.4, 5.6, PATH_Z + 0.2)] })
      .travel(T.throughPorin[0], T.throughPorin[1], porinBottom, { ease: EASE.gentle })
      .travel(T.intoIms[0], T.settleIms, imsHover, { via: [v(0.6, -9, PATH_Z)], jiggle: 0.12 })
      .hold(T.settleIms, T.toCact[0])
      .travel(T.toCact[0], T.toCact[1], cactMouth, { via: [v(7, -12.8, PATH_Z + 0.2)], jiggle: 0.08 })
      .travel(T.intoCavity[0], T.intoCavity[1], cactCavity, { ease: EASE.gentle })
      .hold(T.intoCavity[1], T.flipIn[1])
      .travel(T.outOfCact[0], T.outOfCact[0] + 0.9, cactBelow, { ease: EASE.inOut })
      .travel(T.outOfCact[0] + 0.9, T.outOfCact[1], cactExit, { ease: EASE.inOut })
      .hold(T.outOfCact[1], T.dockCpt2[0])
      .travel(T.dockCpt2[0], T.dockCpt2[1], cpt2Dock, { ease: EASE.inOut })
      .hold(T.dockCpt2[1], T.release2[0])
      .travel(T.release2[0], T.release2[1], pose(this.site('cpt2', 'exit'), facing(v(0.8, -0.6, 0.05))), { ease: EASE.inOut })
      .hold(T.release2[1], STEP_STARTS.matrix)
      .travel(STEP_STARTS.matrix, STEP_STARTS.matrix + 2.2, MATRIX_REST, { jiggle: 0.12, ease: EASE.gentle })
      .hold(STEP_STARTS.matrix + 2.2, DURATION)
    this.chain = chain
    this.actors.push(chain)

    // --------------------------------------------------------------- ATP parts
    // The ATP docks above the chain head, phosphates toward it; after the split the
    // AMP stays bonded to the chain (acyl-adenylate) until CoA takes its place.
    const atpRot = euler(0, 0, Math.PI - 0.55)
    const atpOnChain: Pose = pose(v(1.35, 0.32, 0.05), atpRot)
    const atpStart = pose(v(-14.5, 13.5, PATH_Z + 1.5), euler(0.4, 0.3, 2.2))
    const atpFrame = actor(new THREE.Object3D(), atpStart)
    atpFrame
      .hold(0, T.atpIn[0], 0.2)
      .travel(T.atpIn[0], T.atpIn[1], attachedPose(chain, atpOnChain), { via: [v(-17, 10.6, PATH_Z + 1)], jiggle: 0.1 })
      .follow(T.atpIn[1], DURATION, chain, atpOnChain)
    this.actors.push(atpFrame)

    // Hand-overs: the leaving carrier steps aside before the incoming one docks, so the
    // two never overlap and the student sees which one holds the acyl group.
    const adenosine = actor(parts.adenosine, atpStart)
    // Acyl-adenylate: the AMP's α-phosphate sits on the chain's bond point.
    const ampOnChain = pose(bond.clone().add(v(PHOSPHATE_X[0] + 0.12, 0.05, 0)), euler(0, Math.PI, 0))
    const ampAside = pose(bond.clone().add(v(PHOSPHATE_X[0] + 0.22, 0.85, 0)), euler(0, Math.PI, 0.3))
    adenosine
      .follow(0, T.split, atpFrame, pose(v(0, 0, 0)))
      .travel(T.split, T.split + 0.5, attachedPose(chain, ampOnChain))
      .follow(T.split + 0.5, T.thioester - 1.0, chain, ampOnChain)
      .travel(T.thioester - 1.0, T.thioester - 0.6, attachedPose(chain, ampAside), { ease: EASE.out })
      .follow(T.thioester - 0.6, T.ampOut[0], chain, ampAside)
      .travel(T.ampOut[0], T.ampOut[1], pose(v(-15.6, 6.2, PATH_Z + 3.2), euler(0.6, -0.4, 0.9)), {
        via: [v(-17.8, 9.4, PATH_Z + 2.4)],
        ease: EASE.out,
        jiggle: 0.12,
      })
      .hold(T.ampOut[1], T.ampAway[0], 0.15)
      .travel(T.ampAway[0], T.ampAway[1], pose(v(-28.5, 6.0, PATH_Z + 1.6), euler(0.9, -0.2, 1.4)), { ease: EASE.inOut, jiggle: 0.12 })
      .hold(T.ampAway[1], T.cleanup, 0.12)
      .hide(T.cleanup, DURATION)
    this.actors.push(adenosine)

    // Pyrophosphate: β and γ leave together, then the pyrophosphatase splits them.
    const ppiFrame = actor(new THREE.Object3D(), atpStart)
    const ppaseSite = this.site('pyrophosphatase', 'substrate')
    ppiFrame
      .follow(0, T.split, atpFrame, pose(v(0, 0, 0)))
      .travel(T.ppiOut[0], T.ppiOut[1], pose(ppaseSite.clone(), euler(0.2, 0.9, 0.4)), {
        via: [v(-22.2, 9.4, PATH_Z + 1.0)],
        ease: EASE.inOut,
        jiggle: 0.1,
      })
      .hold(T.ppiOut[1], DURATION)
    this.actors.push(ppiFrame)

    const beta = actor(parts.phosphateBeta, atpStart)
    const gamma = actor(parts.phosphateGamma, atpStart)
    beta
      .follow(0, T.hydrolysis, ppiFrame, pose(v(PHOSPHATE_X[1], 0, 0)))
      .travel(T.piAway[0], T.piAway[1], pose(ppaseSite.clone().add(v(-2.6, 0.3, 2.2))), { ease: EASE.out, jiggle: 0.1 })
      .hold(T.piAway[1], T.cleanup, 0.12)
      .hide(T.cleanup, DURATION)
    gamma
      .follow(0, T.hydrolysis, ppiFrame, pose(v(PHOSPHATE_X[2], 0, 0)))
      .travel(T.piAway[0], T.piAway[1], pose(ppaseSite.clone().add(v(2.6, 0.2, 2.5))), { ease: EASE.out, jiggle: 0.1 })
      .hold(T.piAway[1], T.cleanup, 0.12)
      .hide(T.cleanup, DURATION)
    this.actors.push(beta, gamma)

    // ------------------------------------------------------------- CoA, cytosol
    const coaOnChain = pose(bond.clone(), new THREE.Quaternion())
    // The carnitine comes from above at CPT1: the CoA steps aside downward.
    const coaAside = pose(bond.clone().add(v(0.2, -0.85, 0.1)), euler(0, 0, -0.45))
    const coaCytosol = actor(parts.coaCytosol, pose(v(-31, 8.8, PATH_Z + 1.5), facing(v(-0.6, 0.6, 0.3))))
    coaCytosol
      .hold(0, T.coaIn[0], 0.18)
      // Approaches the CoA site of the enzyme, thiol toward the chain head, round head up
      // (clear of the narration panel).
      .travel(T.coaIn[0], T.coaIn[1], attachedPose(chain, pose(bond.clone().add(v(0.6, -0.55, 0.15)), euler(0, 0, 0.9))), {
        via: [v(-25.5, 6.2, PATH_Z + 1.4)],
        jiggle: 0.12,
      })
      .travel(T.thioester - 0.4, T.thioester, attachedPose(chain, coaOnChain))
      .follow(T.thioester, T.swap1 - 1.0, chain, coaOnChain)
      .travel(T.swap1 - 1.0, T.swap1 - 0.6, attachedPose(chain, coaAside), { ease: EASE.out })
      .follow(T.swap1 - 0.6, T.coaOut[0], chain, coaAside)
      // Released by CPT1, it stays in the cytosol, in view during the arrêt.
      .travel(T.coaOut[0], T.coaOut[1], pose(v(-12.0, 7.6, PATH_Z + 2.2), facing(v(-0.95, 0.15, 0.3))), { ease: EASE.out, jiggle: 0.1 })
      .hold(T.coaOut[1], DURATION, 0.15)
    this.actors.push(coaCytosol)

    // ------------------------------------------------------- carnitine (taken in)
    const carnitineOnChain = pose(bond.clone(), new THREE.Quaternion())
    // The matrix CoA comes from below at CPT2: the carnitine steps aside upward.
    const carnitineAside = pose(bond.clone().add(v(0.2, 0.85, 0.1)), euler(0, 0, 0.45))
    const carnitineIn = actor(parts.carnitineIn, pose(v(1.5, 12.5, PATH_Z + 1.5), facing(v(-0.7, -0.5, 0.2))))
    carnitineIn
      .hold(0, T.carnitineIn[0], 0.15)
      .travel(T.carnitineIn[0], T.carnitineIn[1], pose(this.site('cpt1', 'carnitine'), facing(v(0.6, 0.75, 0.1))), {
        via: [v(-3.5, 9.5, PATH_Z + 1.2)],
        jiggle: 0.1,
      })
      .hold(T.carnitineIn[1], T.swap1 - 0.5)
      .travel(T.swap1 - 0.5, T.swap1, attachedPose(chain, carnitineOnChain))
      .follow(T.swap1, T.swap2 - 1.0, chain, carnitineOnChain)
      .travel(T.swap2 - 1.0, T.swap2 - 0.6, attachedPose(chain, carnitineAside), { ease: EASE.out })
      .follow(T.swap2 - 0.6, T.carnitineBack[0], chain, carnitineAside)
      // Released by CPT2, it heads back toward the CACT's matrix side: it will leave at a later exchange.
      .travel(T.carnitineBack[0], T.carnitineBack[1], pose(this.site('cact', 'matrixMouth').add(v(2.2, -2.2, -0.3)), facing(v(-0.5, 0.8, 0.2))), {
        ease: EASE.out,
        jiggle: 0.08,
      })
      .hold(T.carnitineBack[1], DURATION, 0.12)
    this.actors.push(carnitineIn)

    // ------------------------------------------------------ carnitine (sent out)
    const matrixWait = pose(this.site('cact', 'matrixMouth').add(v(-2.2, -1.0, -0.4)), facing(v(0.5, 0.8, 0.1)))
    const carnitineOut = actor(parts.carnitineOut, matrixWait)
    carnitineOut
      .hold(0, T.matrixCarnitineIn[0], 0.12)
      .travel(T.matrixCarnitineIn[0], T.matrixCarnitineIn[1], pose(this.site('cact', 'cavity').add(v(0, -0.4, -0.5)), facing(v(0.02, 1, 0))), {
        via: [this.site('cact', 'matrixMouth').add(v(-0.3, -0.8, -0.4))],
      })
      .hold(T.matrixCarnitineIn[1], T.flipOut[1])
      // Out into the intermembrane space, resting just above the CACT (in view).
      .travel(T.carnitineToIms[0], T.carnitineToIms[1], pose(this.site('cact', 'imsMouth').add(v(2.2, 0.3, -0.4)), facing(v(0.3, 0.9, 0.2))), {
        via: [this.site('cact', 'imsMouth').add(v(0.3, 0.7, -0.4))],
        ease: EASE.out,
        jiggle: 0.12,
      })
      .hold(T.carnitineToIms[1], DURATION, 0.12)
    this.actors.push(carnitineOut)

    // ------------------------------------------------------------ CoA, matrix
    const coaMatrix = actor(parts.coaMatrix, pose(v(22.5, SET.immY - BILAYER_HALF - 11, PATH_Z + 1.4), facing(v(-0.5, -0.6, 0.3))))
    coaMatrix
      .hold(0, T.coaMatrixIn[0], 0.15)
      .travel(T.coaMatrixIn[0], T.coaMatrixIn[1], attachedPose(chain, pose(bond.clone().add(v(0.55, -0.6, 0.15)), euler(0, 0, -0.45))), {
        via: [v(18.5, SET.immY - BILAYER_HALF - 8.2, PATH_Z + 1.2)],
        jiggle: 0.1,
      })
      .travel(T.swap2 - 0.4, T.swap2, attachedPose(chain, coaOnChain))
      .follow(T.swap2, DURATION, chain, coaOnChain)
    this.actors.push(coaMatrix)
  }

  /** Applies the non-pose state: bonds made/broken, conformations. */
  applyParts(t: number, setLid: (angle: number) => void, setCactOpen: (side: number) => void): void {
    this.parts.freeOxygen.visible = t < T.split
    this.parts.setAdenosineCharged(t < T.split)
    this.parts.linkAlphaBeta.visible = t < T.split
    this.parts.linkBetaGamma.visible = t < T.hydrolysis
    setLid(LID(t))
    setCactOpen(CACT_SIDE(t))
  }
}

/** ACSL's C-terminal domain: rest, closed for adenylation, swung for the thioester step, back. */
const LID = scalarTrack([
  [0, 0],
  [T.lidClose[0], 0],
  [T.lidClose[1], -0.32],
  [T.lidSwing[0], -0.32],
  [T.lidSwing[1], 0.55],
  [T.lidRest[0], 0.55],
  [T.lidRest[1], 0],
])

/** CACT: +1 open to the IMS, -1 open to the matrix. */
export const CACT_SIDE = scalarTrack([
  [0, 1],
  [T.flipIn[0], 1],
  [T.flipIn[1], -1],
  [T.flipOut[0], -1],
  [T.flipOut[1], 1],
])

// ----------------------------------------------------------------------- camera

/** Where the palmitoyl-CoA rests in the matrix at the end of the chapter. */
export const MATRIX_REST = pose(v(7, SET.immY - BILAYER_HALF - 7.5, PATH_Z - 0.5), facing(v(0.85, -0.45, 0.1)))

/**
 * ÷10 pull-back from the molecule to the crista tier: the organelle's cut face, where
 * the cristae are seen in section all around our molecule (marked by its reticle).
 */
export const CRISTA_SHOT: CameraShot = { target: MATRIX_REST.position.clone().add(v(95, 70, 0)), distance: 760, azimuth: 0.12, elevation: 0.17 }

/** End of the ×100 dive: looking down on the outer membrane's surface, the cut edge in front. */
export const DIVE_SHOT: CameraShot = { target: v(-3, 2.4, 8), distance: 120, azimuth: 0.3, elevation: 0.66 }

/** All five layers in section, the whole route in view. */
export const ESTABLISHING: CameraShot = { target: v(-4, -7.5, 15), distance: 150, azimuth: 0.34, elevation: 0.2 }

/**
 * Camera framings after the dive. Close shots follow the chain (its middle, C8) through
 * a short trailing average of its path: smooth, no jitter, still a pure function of time.
 * Every arrêt frames the step's result above the narration panel.
 */
export function createCameraTrack(story: ShuttleStory): (t: number, out: CameraShot) => CameraShot {
  const chainMiddle = v(-1.05, 0, 0)
  const follow = (offset: THREE.Vector3, distance: number, azimuth: number, elevation: number) =>
    followShot(story.chain, chainMiddle, offset, distance, azimuth, elevation)
  const fixed = (x: number, y: number, z: number, distance: number, azimuth: number, elevation: number): CameraShot => ({
    target: v(x, y, z),
    distance,
    azimuth,
    elevation,
  })
  const s = STEP_STARTS
  const acslShot = fixed(-21.2, 7.8, 16.2, 22, 0.4, 0.2)
  const cpt1Shot = fixed(-8, 6.0, 16.5, 20, 0.3, 0.18)
  const barrierShot = fixed(5.5, -16.2, 17.5, 39, 0.1, 0.03)
  // The CACT's two sides in one frame: the entry from the IMS, then the exchange.
  const cactEntry = fixed(9.5, -19.0, 17.8, 24, 0.2, 0.05)
  const cactExchange = fixed(10.5, -21.2, 17.8, 31, 0.2, 0.05)
  const cpt2Shot = fixed(12.6, -25.6, 17, 19, 0.36, 0.05)
  const cpt2Release = fixed(13.6, -29.0, 17, 19, 0.36, 0.05)
  // The palmitoylcarnitine goes down head first: aim below its middle so the carnitine
  // that makes it palmitoylcarnitine stays in view.
  const descent = follow(v(0, -0.8, 0.6), 18, 0.26, 0.1)
  const inIms = follow(v(0, -0.8, 0.6), 23, 0.24, 0.08)

  const keys: ShotKey[] = [
    { t: T.dive[1], shot: DIVE_SHOT },
    { t: T.glide[1], shot: ESTABLISHING },
    { t: s.palmitate, shot: ESTABLISHING },
    { t: s.palmitate + 2.8, shot: follow(v(0, 0.9, 0), 15, 0.32, 0.2) },
    { t: s.activation, shot: follow(v(0, 0.9, 0), 15, 0.32, 0.2) },
    { t: s.activation + 3.2, shot: acslShot },
    { t: s.cpt1, shot: acslShot },
    { t: s.cpt1 + 2.6, shot: fixed(-13.5, 7.6, 16.4, 21, 0.34, 0.2) },
    { t: s.cpt1 + 5.4, shot: cpt1Shot },
    { t: s.barrier, shot: cpt1Shot },
    { t: T.throughPorin[0], shot: descent },
    { t: T.settleIms, shot: inIms },
    { t: T.barrierView[0], shot: inIms },
    { t: T.barrierView[1], shot: barrierShot },
    { t: s.cact, shot: barrierShot },
    { t: s.cact + 3.2, shot: cactEntry },
    { t: T.flipIn[1], shot: cactEntry },
    { t: T.outOfCact[1], shot: cactExchange },
    { t: s.cpt2, shot: cactExchange },
    { t: s.cpt2 + 2.6, shot: cpt2Shot },
    { t: T.release2[0], shot: cpt2Shot },
    { t: T.release2[1], shot: cpt2Release },
    { t: s.matrix, shot: cpt2Release },
    { t: s.matrix + 0.8, shot: follow(v(0, 0.6, 0), 19, 0.36, 0.05) },
    { t: T.pullBack[1], shot: CRISTA_SHOT, ease: EASE.inOut, aimFollowsZoom: true },
    { t: DURATION, shot: CRISTA_SHOT },
  ]
  return createShotTrack(keys)
}

/** The cut edge on the outer membrane: where the ×100 dive lands. */
export const DIVE_POINT = v(0, SET.ommY + BILAYER_HALF, CUT_Z)
