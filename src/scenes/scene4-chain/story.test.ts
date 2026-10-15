import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { BETA_OXIDATION, computePalmitateBalance, ELECTRON_TRANSPORT_PUMPING } from '../../config/science.config'
import type { CameraShot } from '../shared/molecular/camera'
import { BILAYER_HALF } from '../shared/molecular/frame'
import { createEtf, createEtfQo } from '../scene3-betaox/proteins'
import { IMM_Y, LUMEN } from './layout'
import { createAcad, createComplexI, createComplexII, createComplexIII, createComplexIV } from './proteins'
import {
  ARRET,
  ChainStory,
  countersAt,
  createCameraTrack,
  DURATION,
  FLUX_PAIRS,
  OXYGEN_EVENTS,
  pairsAtIVAt,
  PUMP_EVENTS,
  pumpedPerPair,
  reoxidizedAt,
  ROUTES,
  STEP_STARTS,
  T,
} from './story'

const cost = BETA_OXIDATION.activationCostATP
const balance = computePalmitateBalance()
const starts = Object.values(STEP_STARTS)
const ends = [...starts.slice(1), DURATION]
const endOf = (step: keyof typeof STEP_STARTS): number => ends[Object.keys(STEP_STARTS).indexOf(step)] - 0.001

const material = (): THREE.Material => new THREE.MeshBasicMaterial()
const models = {
  complexI: createComplexI(material),
  complexIII: createComplexIII(material),
  etfQo: createEtfQo(material),
  complexII: createComplexII(material),
  complexIV: createComplexIV(material),
  acad: createAcad(material),
  etf: createEtf(material),
}
const sites = Object.fromEntries(Object.entries(models).map(([key, model]) => [key, model.sites])) as never
const object = (): THREE.Object3D => new THREE.Object3D()
const story = new ChainStory({
  sites,
  nadh: object(),
  qs: Array.from({ length: 8 }, object),
  cytc: Array.from({ length: 4 }, object),
  etf: object(),
  electrons: Array.from({ length: 6 }, object),
  oxygen: object(),
  water: [object(), object()],
})

describe('scene 4 — counters (only H⁺ and O₂ move; the chain makes no ATP)', () => {
  const table: Record<keyof typeof STEP_STARTS, [number, number]> = {
    zoom: [0, 0],
    overview: [0, 0],
    complexI: [4, 0],
    quinone: [4, 0],
    complexIII: [8, 0],
    cytochromeC: [8, 0],
    complexIV: [10, 0],
    etf: [10, 0],
    oxygen: [16, 1],
    complexII: [16, 1],
    flux: [400, 23],
    gradient: [400, 23],
  }

  it.each(Object.entries(table))('ends « %s » with the right H⁺ and O₂', (step, [protons, oxygen]) => {
    const counters = countersAt(endOf(step as keyof typeof STEP_STARTS), cost)
    expect([counters.protonsPumped, counters.oxygenConsumed]).toEqual([protons, oxygen])
  })

  it('ends on the config balance: 400 H⁺, 23 O₂ (the same in both P/O conventions)', () => {
    const end = countersAt(DURATION, cost)
    expect(end.protonsPumped).toBe(balance.protonsPumped)
    expect(end.oxygenConsumed).toBe(balance.o2Consumed)
    expect(computePalmitateBalance('legacy').protonsPumped).toBe(balance.protonsPumped)
    expect(computePalmitateBalance('legacy').o2Consumed).toBe(balance.o2Consumed)
  })

  it('never changes the ATP, the acetyl-CoA, the NADH or the FADH₂ produced', () => {
    for (let t = 0; t <= DURATION; t += 0.5) {
      const counters = countersAt(t, cost)
      expect(counters.atp).toBe(balance.gtp - cost)
      expect([counters.acetylCoA, counters.nadh, counters.fadh2]).toEqual([balance.acetylCoA, balance.nadh, balance.fadh2])
    }
  })

  it('reoxidizes every NADH and FADH₂ by the end of the flux', () => {
    expect(reoxidizedAt(DURATION)).toEqual({ nadh: balance.nadh, fadh2: balance.fadh2 })
    expect(reoxidizedAt(0)).toEqual({ nadh: 0, fadh2: 0 })
  })
})

describe('scene 4 — pumping (rule 5) and electron routes (rules 4 and 6)', () => {
  it('pumps 10 H⁺ per NADH and 6 per FADH₂', () => {
    expect(pumpedPerPair('nadh')).toBe(ELECTRON_TRANSPORT_PUMPING.perNADH)
    expect(pumpedPerPair('etf')).toBe(ELECTRON_TRANSPORT_PUMPING.perFADH2)
    expect(pumpedPerPair('complexII')).toBe(ELECTRON_TRANSPORT_PUMPING.perFADH2)
  })

  it('never sends β-oxidation electrons through complex II, nor Krebs electrons through ETF-QO', () => {
    expect(ROUTES.etf).not.toContain('complexII')
    expect(ROUTES.complexII).not.toContain('etfQo')
    expect(ROUTES.complexII).not.toContain('etf')
  })

  it('takes every pair through Q, complex III, cytochrome c and complex IV (rule 6)', () => {
    for (const route of Object.values(ROUTES)) {
      expect(route.slice(-2)).toEqual(['complexIII', 'complexIV'])
    }
  })

  it('accounts for every pair of our palmitate: detailed + flux = NADH + FADH₂', () => {
    const detailedPairs = 3 // NADH (I), β-oxidation FADH₂ (ETF-QO), Krebs FADH₂ (II, completed in the flux)
    expect(FLUX_PAIRS.length + detailedPairs - 1).toBe(balance.nadh + balance.fadh2)
    expect(FLUX_PAIRS.filter((pair) => pair.route === 'nadh')).toHaveLength(balance.nadh - 1)
  })

  it('reduces one O₂ for every two pairs that reached complex IV', () => {
    for (let t = 0; t <= DURATION; t += 0.25) {
      expect(countersAt(t, cost).oxygenConsumed).toBeLessThanOrEqual(Math.floor(pairsAtIVAt(t) / 2))
    }
    expect(OXYGEN_EVENTS).toHaveLength(balance.o2Consumed)
    expect(Math.floor(pairsAtIVAt(DURATION) / 2)).toBe(balance.o2Consumed)
  })
})

describe('scene 4 — one bead per pumped H⁺', () => {
  it('has exactly one bead per H⁺ pumped, counted when it reaches the lumen', () => {
    expect(PUMP_EVENTS).toHaveLength(balance.protonsPumped)
    const p = new THREE.Vector3()
    for (const t of [30, 36.5, 60.3, 87, 120, 150, 160, DURATION]) {
      let arrived = 0
      PUMP_EVENTS.forEach((event, i) => {
        if (t >= event.time) {
          arrived++
          expect(story.beads.positionAt(i, t, p)).not.toBeNull()
        }
      })
      expect(arrived).toBe(countersAt(t, cost).protonsPumped)
    }
  })

  it('rests every pumped H⁺ in the crista lumen (the intermembrane space), never in the matrix', () => {
    const p = new THREE.Vector3()
    PUMP_EVENTS.forEach((_, i) => {
      story.beads.positionAt(i, DURATION, p)
      expect(p.y).toBeGreaterThan(LUMEN.bottom)
      expect(p.y).toBeLessThan(LUMEN.top)
    })
  })
})

describe('scene 4 — carriers stay in their compartment (rule 7)', () => {
  const sample = (from: number, to: number, f: (t: number) => void): void => {
    for (let t = from; t <= to; t += 0.25) f(t)
  }

  it('keeps the ubiquinones in the membrane', () => {
    sample(0, DURATION, (t) => {
      for (const q of story.qs) expect(Math.abs(q.poseAt(t, undefined, false).position.y - IMM_Y)).toBeLessThan(0.7)
    })
  })

  it('keeps the cytochromes c in the intermembrane space', () => {
    sample(0, DURATION, (t) => {
      for (const c of story.cytc) expect(c.poseAt(t, undefined, false).position.y).toBeGreaterThan(IMM_Y + BILAYER_HALF)
    })
  })

  it('keeps the NADH and the ETF in the matrix', () => {
    sample(0, DURATION, (t) => {
      expect(story.nadh.poseAt(t, undefined, false).position.y).toBeLessThan(IMM_Y - BILAYER_HALF)
      expect(story.etf.poseAt(t, undefined, false).position.y).toBeLessThan(IMM_Y - BILAYER_HALF)
    })
  })

  it('carries at most one electron per cytochrome c', () => {
    // An electron rides a cytochrome c on its heme: two never sit on the same one.
    const heme = new THREE.Vector3(0.1, 0.35, 1.9)
    for (let t = 0; t <= DURATION; t += 0.25) {
      for (const c of story.cytc) {
        const pose = c.poseAt(t, undefined, false)
        const site = heme.clone().applyQuaternion(pose.quaternion).add(pose.position)
        const riding = story.electrons.filter((e) => e.visibleAt(t) && e.poseAt(t, undefined, false).position.distanceTo(site) < 0.3)
        expect(riding.length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('makes water on the matrix side', () => {
    expect(T.water).toBeGreaterThan(T.toSite4[1])
  })
})

describe('scene 4 — every step ends on a still state (arrêt)', () => {
  const diveShot: CameraShot = { target: new THREE.Vector3(0, 0, 0), distance: 500, azimuth: 0, elevation: 0 }
  const camera = createCameraTrack(story, diveShot, { target: new THREE.Vector3(), distance: 40, azimuth: 0, elevation: 0 })
  const shot = (): CameraShot => ({ target: new THREE.Vector3(), distance: 1, azimuth: 0, elevation: 0 })

  it.each(starts.map((start, i) => [Object.keys(STEP_STARTS)[i], start, ends[i]] as const))('%s', (_id, _start, end) => {
    const p = new THREE.Vector3()
    const q = new THREE.Vector3()
    for (let t = end - ARRET + 0.3; t < end - 0.25; t += 0.4) {
      for (const actor of story.actors) {
        const a = actor.poseAt(t)
        const b = actor.poseAt(t + 0.2)
        expect(a.position.distanceTo(b.position)).toBeLessThan(1e-6)
        expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(1e-6)
        expect(actor.visibleAt(t)).toBe(actor.visibleAt(t + 0.2))
      }
      PUMP_EVENTS.forEach((_, i) => {
        const a = story.beads.positionAt(i, t, p)
        const b = story.beads.positionAt(i, t + 0.2, q)
        expect(a === null).toBe(b === null)
        if (a && b) expect(a.distanceTo(b)).toBeLessThan(1e-6)
      })
      const c1 = camera(t, shot())
      const c2 = camera(t + 0.2, shot())
      expect(c1.target.distanceTo(c2.target)).toBeLessThan(1e-6)
      expect(Math.abs(c1.distance - c2.distance)).toBeLessThan(1e-6)
      expect(countersAt(t, cost)).toEqual(countersAt(t + 0.2, cost))
    }
  })
})
