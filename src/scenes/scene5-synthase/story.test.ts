import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ATP_SYNTHASE, BETA_OXIDATION, computePalmitateBalance, oxphosATP, protonsThroughFoPerATP, TRANSPORT_COST } from '../../config/science.config'
import type { CameraShot } from '../shared/molecular/camera'
import { BILAYER_HALF } from '../shared/molecular/frame'
import { compartmentOf, HERO, lumenSlots, matrixSlots, PROFILE, TIP_RADIUS } from './layout'
import { betaPhase, CHANNEL_IN, CHANNEL_OUT, cSite, jawAngle, JAW, SITE_PHASE } from './proteins'
import {
  ARRET,
  ATP_FORM,
  ATP_RELEASE,
  atpReleasedAt,
  countersAt,
  createCameraTrack,
  DURATION,
  fluxAngle,
  formOf,
  HERO_EXIT,
  heroAngle,
  notchAngle,
  NOTCHES,
  RING_PROTONS,
  ringProtonBound,
  ringProtonLocal,
  ringProtonWorld,
  START_ATP,
  STEP_STARTS,
  SynthaseStory,
  T,
} from './story'

const C = ATP_SYNTHASE.cRingSubunits
const starts = Object.values(STEP_STARTS)
const ends = [...starts.slice(1), DURATION]
const endOf = (step: keyof typeof STEP_STARTS): number => ends[Object.keys(STEP_STARTS).indexOf(step)] - 0.001

describe('scene 5 — the rotor turns one notch per H⁺ (rules 1 and 8)', () => {
  it('takes one notch per c subunit for a full turn', () => {
    expect(NOTCHES).toHaveLength(C)
    expect(notchAngle(endOf('turn'))).toBeCloseTo(360, 6)
  })

  it('never turns backwards, and only during a notch in the detailed turn', () => {
    let previous = notchAngle(0)
    for (let t = 0; t <= T.flux[0]; t += 0.05) {
      const theta = notchAngle(t)
      expect(theta).toBeGreaterThanOrEqual(previous - 1e-9)
      const inNotch = NOTCHES.some(([a, b]) => t >= a && t <= b)
      if (!inNotch) expect(theta % (360 / C)).toBeCloseTo(0, 6)
      previous = theta
    }
  })

  it('has one H⁺ entering for every notch: our H⁺ at notch 1, the others at notches 2–8', () => {
    // Each H⁺ that comes in is seated before its notch starts.
    for (let k = 0; k < C; k++) {
      const notch = NOTCHES[k]
      expect(ringProtonBound(k, notch[0] + 0.01)).toBe(true)
      expect(ringProtonBound(k, notch[0] - 2.5)).toBe(false)
    }
  })

  it('lets our H⁺ ride almost a full turn, then out into the matrix, unchanged', () => {
    const seated = (CHANNEL_IN - CHANNEL_OUT + 360) % 360
    expect(360 - seated).toBeCloseTo(337.5, 6)
    expect(ringProtonBound(0, HERO_EXIT - 0.01)).toBe(true)
    expect(ringProtonBound(0, HERO_EXIT + 0.01)).toBe(false)
    expect(compartmentOf(ringProtonWorld(0, DURATION))).toBe('matrix')
    expect(compartmentOf(ringProtonWorld(0, 0))).toBe('lumen')
  })

  it('keeps every H⁺ on the ring at the radius of the c sites, and none ever reaches F1', () => {
    for (let t = 0; t <= DURATION; t += 0.1) {
      for (let k = 0; k < RING_PROTONS; k++) {
        const local = ringProtonLocal(k, t)
        // F1 starts ~7 nm from the membrane's mid-plane, along −y: no H⁺ goes past the matrix mouth.
        expect(local.y).toBeGreaterThan(-BILAYER_HALF - 6.5)
        if (ringProtonBound(k, t)) expect(Math.hypot(local.x, local.z)).toBeCloseTo(cSite(0, 0).length(), 5)
      }
    }
  })

  it('leaves the ring in its starting state after a full turn: 7 sites loaded, the lumen-side one empty', () => {
    const end = endOf('turn')
    const bound = Array.from({ length: RING_PROTONS }, (_, k) => ringProtonBound(k, end)).filter(Boolean)
    expect(bound).toHaveLength(C - 1)
    const start = Array.from({ length: RING_PROTONS }, (_, k) => ringProtonBound(k, 0)).filter(Boolean)
    expect(start).toHaveLength(C - 1)
    expect(SITE_PHASE).toBe(CHANNEL_IN)
  })
})

describe('scene 5 — F1: binding change (rule 1: the H⁺ are never turned into ATP)', () => {
  it('releases one ATP every 120°, three per turn', () => {
    expect(ATP_RELEASE).toHaveLength(ATP_SYNTHASE.atpPerFullRotation)
    ATP_RELEASE.forEach((time, k) => expect(notchAngle(time)).toBeCloseTo((k + 1) * 120, 3))
    expect(atpReleasedAt(endOf('turn'))).toBe(3)
  })

  it('forms each ATP in a tightening β just before it is released 120° later', () => {
    ATP_FORM.forEach((time, k) => expect(time).toBeLessThan(ATP_RELEASE[k]))
    expect(formOf(1, ATP_FORM[0] - 0.01)).toBe('adp')
    expect(formOf(1, ATP_FORM[0] + 0.01)).toBe('atp')
  })

  it('cycles every β through open → loose → tight, all three always in different states', () => {
    for (let theta = 0; theta <= 360; theta += 15) {
      const states = [0, 1, 2].map((i) => Math.floor(betaPhase(i, theta)) % 3)
      expect(new Set(states).size).toBe(3)
    }
    // At rest: β1 tight, β2 loose, β3 open.
    expect(jawAngle(0, 0)).toBeCloseTo(JAW.tight)
    expect(jawAngle(1, 0)).toBeCloseTo(JAW.loose)
    expect(jawAngle(2, 0)).toBeCloseTo(JAW.open)
  })
})

describe('scene 5 — counters and bilan (rule 10)', () => {
  const balance = computePalmitateBalance()

  it('starts where chapter 4 ended (8 GTP − 2 activation) and changes only the ATP counter', () => {
    const start = countersAt(0)
    expect(start.atp).toBe(START_ATP)
    expect(START_ATP).toBe(balance.gtp - BETA_OXIDATION.activationCostATP)
    for (let t = 0; t <= DURATION; t += 0.5) {
      const c = countersAt(t)
      expect([c.acetylCoA, c.nadh, c.fadh2, c.protonsPumped, c.oxygenConsumed]).toEqual([
        balance.acetylCoA,
        balance.nadh,
        balance.fadh2,
        balance.protonsPumped,
        balance.o2Consumed,
      ])
    }
  })

  it('counts the 3 ATP of the detailed turn as part of the ATP synthase total, never extra', () => {
    expect(countersAt(endOf('turn')).atp).toBe(START_ATP + 3)
    expect(countersAt(DURATION).atp).toBe(START_ATP + oxphosATP())
  })

  it('ends on the config bilan: 106 net ATP (129 with the legacy P/O)', () => {
    expect(countersAt(DURATION).atp).toBe(balance.atpNet)
    expect(balance.atpNet).toBe(106)
    expect(computePalmitateBalance('legacy').atpNet).toBe(129)
  })

  it('never counts down', () => {
    let previous = countersAt(0).atp
    for (let t = 0; t <= DURATION; t += 0.05) {
      const atp = countersAt(t).atp
      expect(atp).toBeGreaterThanOrEqual(previous)
      previous = atp
    }
  })

  it('prices one ATP at ~4 H⁺: 8/3 through Fo plus ~1 for transport', () => {
    expect(protonsThroughFoPerATP()).toBeCloseTo(8 / 3, 6)
    expect(protonsThroughFoPerATP() + TRANSPORT_COST.protonsPerATP).toBeCloseTo(3.67, 2)
    expect(Math.round(protonsThroughFoPerATP() + TRANSPORT_COST.protonsPerATP)).toBe(4)
  })
})

describe('scene 5 — the crista set', () => {
  it('puts the hero dimer on the tip, its F1 in the matrix', () => {
    expect(Math.hypot(HERO.fo.x, HERO.fo.y)).toBeCloseTo(TIP_RADIUS, 5)
    expect(compartmentOf(HERO.f1)).toBe('matrix')
    expect(PROFILE.length).toBeGreaterThan(Math.PI * TIP_RADIUS)
  })

  it('keeps the H⁺ crowd in the lumen and the few matrix H⁺ outside', () => {
    for (const p of lumenSlots(200)) expect(compartmentOf(p)).toBe('lumen')
    for (const p of matrixSlots(25)) expect(compartmentOf(p)).toBe('matrix')
  })
})

describe('scene 5 — every step ends on a still state (arrêt)', () => {
  const object = (): THREE.Object3D => new THREE.Object3D()
  const sites = { imsMouth: new THREE.Vector3(0, 3.4, 0), cavity: new THREE.Vector3(0, 0, -0.1), matrixMouth: new THREE.Vector3(0, -3.6, 0) }
  const story = new SynthaseStory({
    nucleotides: Array.from({ length: 5 }, object),
    phosphates: Array.from({ length: 4 }, object),
    symportProton: object(),
    carrierSites: { phosphate: sites, ant: sites },
  })
  const camera = createCameraTrack(story)
  const shot = (): CameraShot => ({ target: new THREE.Vector3(), distance: 1, azimuth: 0, elevation: 0 })

  it.each(starts.map((start, i) => [Object.keys(STEP_STARTS)[i], start, ends[i]] as const))('%s', (_id, _start, end) => {
    for (let t = end - ARRET + 0.3; t < end - 0.25; t += 0.4) {
      for (const actor of story.actors) {
        const a = actor.poseAt(t)
        const b = actor.poseAt(t + 0.2)
        expect(a.position.distanceTo(b.position)).toBeLessThan(1e-6)
        expect(actor.visibleAt(t)).toBe(actor.visibleAt(t + 0.2))
      }
      for (let k = 0; k < RING_PROTONS; k++) expect(ringProtonLocal(k, t).distanceTo(ringProtonLocal(k, t + 0.2))).toBeLessThan(1e-6)
      expect(heroAngle(t)).toBeCloseTo(heroAngle(t + 0.2), 6)
      expect(fluxAngle(t)).toBeCloseTo(fluxAngle(t + 0.2), 6)
      const c1 = camera(t, shot())
      const c2 = camera(t + 0.2, shot())
      expect(c1.target.distanceTo(c2.target)).toBeLessThan(1e-6)
      expect(Math.abs(c1.distance - c2.distance)).toBeLessThan(1e-6)
      expect(countersAt(t)).toEqual(countersAt(t + 0.2))
    }
  })
})
