import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { BETA_OXIDATION, computePalmitateBalance } from '../../config/science.config'
import { JourneyState } from '../../core/JourneyState'
import type { CameraShot } from '../shared/molecular/camera'
import { BILAYER_HALF } from '../shared/molecular/frame'
import { SET } from './layout'
import { createAcsl, createCact, createCpt1, createCpt2, createPorin, createPyrophosphatase } from './proteins'
import { ARRET, CACT_SIDE, compartmentAt, countersAt, createCameraTrack, DURATION, isAtWork, nameAt, ShuttleStory, siteOf, STEP_STARTS, T } from './story'

const cost = BETA_OXIDATION.activationCostATP

describe('scene 2 — journey counters, a pure function of the playhead', () => {
  it('shows nothing before the ATP is cut', () => {
    expect(countersAt(0, cost)).toEqual({ atp: 0, atpInvested: 0 })
    expect(countersAt(T.split - 0.01, cost)).toEqual({ atp: 0, atpInvested: 0 })
  })

  it('drops the net ATP balance by the activation cost, once, on the split frame', () => {
    expect(countersAt(T.split, cost)).toEqual({ atp: -cost, atpInvested: cost })
    expect(countersAt(DURATION, cost)).toEqual({ atp: -cost, atpInvested: cost })
  })

  it('is undone by stepping back, and never counted twice by a replay', () => {
    const journey = new JourneyState()
    let notifications = 0
    journey.onChange(() => notifications++)
    for (const t of [T.split + 1, T.split - 1, T.split + 1, T.split + 2]) journey.set(countersAt(t, cost))
    expect(journey.current.atp).toBe(-cost)
    expect(notifications).toBe(3) // +cost, back to 0, +cost again; the last set changes nothing
  })

  it('never touches acetyl-CoA, NADH, FADH₂, H⁺ or O₂ (β-oxidation starts in scene 3)', () => {
    const journey = new JourneyState()
    journey.set(countersAt(DURATION, cost))
    const { acetylCoA, nadh, fadh2, protonsPumped, oxygenConsumed } = journey.current
    expect([acetylCoA, nadh, fadh2, protonsPumped, oxygenConsumed]).toEqual([0, 0, 0, 0, 0])
  })

  it('is the same cost the final balance subtracts (106 = 108 − 2, legacy 129 = 131 − 2)', () => {
    expect(cost).toBe(2)
    expect(computePalmitateBalance('current').atpNet).toBe(106)
    expect(computePalmitateBalance('legacy').atpNet).toBe(129)
  })
})

describe('scene 2 — carriers, in the order of rule 2 (activation, then CPT1 → CACT → CPT2)', () => {
  it('renames the followed molecule only at the enzymes', () => {
    const names = [0, T.split + 0.1, T.thioester + 0.1, T.swap1 + 0.1, T.swap2 + 0.1].map(nameAt)
    expect(names).toEqual(['palmitate', 'activating', 'palmitoylCoA', 'palmitoylcarnitine', 'palmitoylCoA'])
  })

  it('activates before CPT1, and goes through CACT before CPT2', () => {
    expect(T.split).toBeLessThan(T.thioester)
    expect(T.thioester).toBeLessThan(T.swap1)
    expect(T.swap1).toBeLessThan(T.flipIn[0])
    expect(T.flipIn[1]).toBeLessThan(T.swap2)
  })

  it('crosses the inner membrane only as palmitoylcarnitine', () => {
    for (let t = T.intoCavity[0]; t <= T.outOfCact[1]; t += 0.25) expect(nameAt(t)).toBe('palmitoylcarnitine')
  })

  it('runs the antiport one molecule at a time: the carnitine enters only after the acylcarnitine has left', () => {
    expect(T.outOfCact[0]).toBeGreaterThanOrEqual(T.flipIn[1])
    expect(T.matrixCarnitineIn[0]).toBeGreaterThanOrEqual(T.outOfCact[1])
    expect(T.flipOut[0]).toBeGreaterThanOrEqual(T.matrixCarnitineIn[1])
  })

  it('docks at CPT2 only in the CPT2 step (moves between enzymes open the next step)', () => {
    expect(T.dockCpt2[0]).toBeGreaterThanOrEqual(STEP_STARTS.cpt2)
  })

  it('keeps every step inside the timeline, in storyboard order', () => {
    const starts = Object.values(STEP_STARTS)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    expect(starts[starts.length - 1]).toBeLessThan(DURATION)
  })
})

describe('scene 2 — names on screen follow the steps', () => {
  const endOf = (step: keyof typeof STEP_STARTS): number => {
    const starts = Object.values(STEP_STARTS)
    const i = Object.keys(STEP_STARTS).indexOf(step)
    return (i + 1 < starts.length ? starts[i + 1] : DURATION) - 0.001
  }

  it('names, in each arrêt, the protein that just acted and not the next one', () => {
    expect(isAtWork('acsl', endOf('activation'))).toBe(true)
    expect(isAtWork('cpt1', endOf('activation'))).toBe(false)
    expect(isAtWork('cpt1', endOf('cpt1'))).toBe(true)
    expect(isAtWork('porin', endOf('cpt1'))).toBe(false)
    expect(isAtWork('cact', endOf('cpt1'))).toBe(false)
    expect(isAtWork('cact', endOf('barrier'))).toBe(true)
    expect(isAtWork('cact', endOf('cact'))).toBe(true)
    expect(isAtWork('cpt2', endOf('cact'))).toBe(false)
    expect(isAtWork('cpt2', endOf('cpt2'))).toBe(true)
  })
})

describe('scene 2 — « Vous êtes ici »', () => {
  it('maps heights to the five layers, cytosol on top', () => {
    expect(compartmentAt(SET.ommY + BILAYER_HALF + 1)).toBe('cytosol')
    expect(compartmentAt(SET.ommY)).toBe('outerMembrane')
    expect(compartmentAt((SET.ommY + SET.immY) / 2)).toBe('intermembraneSpace')
    expect(compartmentAt(SET.immY)).toBe('innerMembrane')
    expect(compartmentAt(SET.immY - BILAYER_HALF - 1)).toBe('matrix')
  })
})

describe('scene 2 — every step ends on a still state (arrêt)', () => {
  const material = (): THREE.Material => new THREE.MeshBasicMaterial()
  const models = {
    acsl: createAcsl(material),
    cpt1: createCpt1(material),
    porin: createPorin(material),
    cact: createCact(material),
    cpt2: createCpt2(material),
    pyrophosphatase: createPyrophosphatase(material),
  }
  const sites = Object.fromEntries(Object.entries(models).map(([key, model]) => [key, model.sites])) as never
  const object = (): THREE.Object3D => new THREE.Object3D()
  const story = new ShuttleStory({
    chain: object(),
    freeOxygen: object(),
    bondPoint: new THREE.Vector3(0.36, -0.08, 0),
    adenosine: object(),
    setAdenosineCharged: () => {},
    linkAlphaBeta: object(),
    phosphateBeta: object(),
    phosphateGamma: object(),
    linkBetaGamma: object(),
    coaCytosol: object(),
    coaMatrix: object(),
    carnitineIn: object(),
    carnitineOut: object(),
    sites,
  })
  const camera = createCameraTrack(story)
  const shot = (): CameraShot => ({
    target: new THREE.Vector3(),
    distance: 1,
    azimuth: 0,
    elevation: 0,
  })
  const starts = Object.values(STEP_STARTS)
  const ends = [...starts.slice(1), DURATION]

  it.each(starts.map((start, i) => [Object.keys(STEP_STARTS)[i], start, ends[i]] as const))('%s', (_id, _start, end) => {
    for (let t = end - ARRET + 0.3; t < end - 0.25; t += 0.4) {
      for (const actor of story.actors) {
        const a = actor.poseAt(t)
        const b = actor.poseAt(t + 0.2)
        expect(a.position.distanceTo(b.position)).toBeLessThan(1e-6)
        expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(1e-6)
        expect(actor.visibleAt(t)).toBe(actor.visibleAt(t + 0.2))
      }
      const c1 = camera(t, shot())
      const c2 = camera(t + 0.2, shot())
      expect(c1.target.distanceTo(c2.target)).toBeLessThan(1e-6)
      expect(Math.abs(c1.distance - c2.distance)).toBeLessThan(1e-6)
    }
  })
})

describe('scene 2 — molecules never pass through each other', () => {
  const material = (): THREE.Material => new THREE.MeshBasicMaterial()
  const models = {
    acsl: createAcsl(material),
    cpt1: createCpt1(material),
    porin: createPorin(material),
    cact: createCact(material),
    cpt2: createCpt2(material),
    pyrophosphatase: createPyrophosphatase(material),
  }
  const sites = Object.fromEntries(Object.entries(models).map(([key, model]) => [key, model.sites])) as never
  const parts = {
    chain: new THREE.Object3D(),
    adenosine: new THREE.Object3D(),
    coaCytosol: new THREE.Object3D(),
    coaMatrix: new THREE.Object3D(),
    carnitineIn: new THREE.Object3D(),
  }
  const bondPoint = new THREE.Vector3(0.36, -0.08, 0)
  const story = new ShuttleStory({
    ...parts,
    freeOxygen: new THREE.Object3D(),
    bondPoint,
    setAdenosineCharged: () => {},
    linkAlphaBeta: new THREE.Object3D(),
    phosphateBeta: new THREE.Object3D(),
    phosphateGamma: new THREE.Object3D(),
    linkBetaGamma: new THREE.Object3D(),
    carnitineOut: new THREE.Object3D(),
    sites,
  })
  const actorOf = (object: THREE.Object3D) => story.actors.find((actor) => actor.object === object)!
  /** Position of a carrier in the chain's frame at time t. */
  const inChainFrame = (object: THREE.Object3D, t: number): THREE.Vector3 => {
    const chain = story.chain.poseAt(t, undefined, false)
    const p = actorOf(object).poseAt(t, undefined, false).position.clone().sub(chain.position)
    return p.applyQuaternion(chain.quaternion.clone().invert())
  }

  it('hands over at each enzyme: the leaving carrier has stepped aside before the incoming one docks', () => {
    // ACSL: the AMP leaves the bond before the CoA's final docking.
    expect(inChainFrame(parts.adenosine, T.thioester - 0.4).y).toBeGreaterThan(0.6)
    // CPT1: the CoA steps aside before the carnitine docks.
    expect(inChainFrame(parts.coaCytosol, T.swap1 - 0.5).distanceTo(bondPoint)).toBeGreaterThan(0.6)
    // CPT2: the carnitine steps aside before the matrix CoA docks.
    expect(inChainFrame(parts.carnitineIn, T.swap2 - 0.4).distanceTo(bondPoint)).toBeGreaterThan(0.6)
  })

  it('keeps the acylcarnitine out of the CACT channel while the free carnitine goes through', () => {
    const axis = siteOf('cact', new THREE.Vector3())
    const band = BILAYER_HALF + 0.7
    for (let t = T.matrixCarnitineIn[0]; t <= T.flipOut[1]; t += 0.1) {
      const pose = story.chain.poseAt(t)
      for (let i = 0; i < 16; i++) {
        const carbon = new THREE.Vector3(-i * 0.15, 0, 0).applyQuaternion(pose.quaternion).add(pose.position)
        const inBand = Math.abs(carbon.y - SET.immY) < band
        const nearAxis = Math.hypot(carbon.x - axis.x, carbon.z - axis.z) < 1.3
        expect(inBand && nearAxis).toBe(false)
      }
    }
    expect(CACT_SIDE(T.matrixCarnitineIn[1])).toBe(-1)
  })
})
