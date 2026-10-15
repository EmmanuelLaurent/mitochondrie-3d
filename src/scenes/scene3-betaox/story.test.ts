import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { BETA_OXIDATION, computePalmitateBalance, SOLUBLE_ENZYMES_FROM_CARBONS } from '../../config/science.config'
import { content } from '../../i18n/content'
import type { CameraShot } from '../shared/molecular/camera'
import { createComplexII, createEtf, createEtfQo, createSolubleEnzymes, createTfp, createVlcad } from './proteins'
import { createCpt2 } from '../scene2-shuttle/proteins'
import {
  ARRET,
  BETA_OX_ELECTRON_ROUTE,
  BetaOxStory,
  carbonsAt,
  chainHasCoA,
  coaBond,
  coaRelease,
  countersAt,
  createCameraTrack,
  DURATION,
  hasAcetyl,
  KREBS,
  lynenAt,
  markAt,
  reticleAt,
  STEP_STARTS,
  T,
  TURNS,
} from './story'

const cost = BETA_OXIDATION.activationCostATP
const starts = Object.values(STEP_STARTS)
const ends = [...starts.slice(1), DURATION]
const endOf = (step: keyof typeof STEP_STARTS): number => ends[Object.keys(STEP_STARTS).indexOf(step)] - 0.001

describe('scene 3 — counters, a pure function of the playhead', () => {
  // The storyboard's table: [acetyl-CoA, NADH, FADH₂, net ATP] at the end of each step.
  const table: Record<keyof typeof STEP_STARTS, [number, number, number, number]> = {
    zoom: [0, 0, 0, -2],
    dehydrogenation: [0, 0, 1, -2],
    electrons: [0, 0, 1, -2],
    hydration: [0, 0, 1, -2],
    oxidation: [0, 1, 1, -2],
    thiolysis: [1, 1, 1, -2],
    turn2: [2, 2, 2, -2],
    fastTurns: [6, 6, 6, -2],
    lastTurn: [8, 7, 7, -2],
    krebs: [8, 10, 8, -1],
    bilan: [8, 31, 15, 6],
  }

  it.each(Object.entries(table))('ends « %s » with the right bilan', (step, [acetylCoA, nadh, fadh2, atp]) => {
    const counters = countersAt(endOf(step as keyof typeof STEP_STARTS), cost)
    expect([counters.acetylCoA, counters.nadh, counters.fadh2, counters.atp]).toEqual([acetylCoA, nadh, fadh2, atp])
  })

  it('ends on the config balance (both P/O conventions share these)', () => {
    const balance = computePalmitateBalance()
    const end = countersAt(DURATION, cost)
    expect(end.acetylCoA).toBe(balance.acetylCoA)
    expect(end.nadh).toBe(balance.nadh)
    expect(end.fadh2).toBe(balance.fadh2)
    expect(end.gtp).toBe(balance.gtp)
    expect(end.atp).toBe(balance.gtp - cost)
    expect(computePalmitateBalance('legacy').nadh).toBe(balance.nadh)
  })

  it('never pumps H⁺ nor consumes O₂ (that is chapter 4)', () => {
    for (let t = 0; t <= DURATION; t += 0.5) {
      const counters = countersAt(t, cost)
      expect(counters.protonsPumped).toBe(0)
      expect(counters.oxygenConsumed).toBe(0)
    }
  })

  it('only ever counts up (a production bilan: nothing drops when acetyl-CoA enters the cycle)', () => {
    let previous = countersAt(0, cost)
    for (let t = 0.1; t <= DURATION; t += 0.1) {
      const now = countersAt(t, cost)
      expect(now.acetylCoA).toBeGreaterThanOrEqual(previous.acetylCoA)
      expect(now.nadh).toBeGreaterThanOrEqual(previous.nadh)
      expect(now.fadh2).toBeGreaterThanOrEqual(previous.fadh2)
      expect(now.atp).toBeGreaterThanOrEqual(previous.atp)
      previous = now
    }
  })
})

describe('scene 3 — the Lynen helix (rule 3)', () => {
  it('runs the four reactions in order in every turn: FADH₂, then H₂O, then NADH, then the cut', () => {
    for (const turn of TURNS) {
      expect(turn.dehydrogenation).toBeLessThan(turn.hydration)
      expect(turn.hydration).toBeLessThan(turn.oxidation)
      expect(turn.oxidation).toBeLessThan(turn.cut)
      expect(turn.cut).toBeLessThan(turn.acetylFormed)
    }
  })

  it('takes 7 turns, two carbons each, the last one splitting C4 into two acetyl-CoA', () => {
    expect(TURNS).toHaveLength(BETA_OXIDATION.cyclesForPalmitate)
    const lengths = TURNS.map((turn) => carbonsAt(turn.cut - 0.01))
    expect(lengths).toEqual([16, 14, 12, 10, 8, 6, 4])
    expect(carbonsAt(DURATION)).toBe(2)
    expect(countersAt(TURNS[6].acetylFormed, cost).acetylCoA - countersAt(TURNS[6].acetylFormed - 0.01, cost).acetylCoA).toBe(2)
  })

  it('marks the β-carbon: C=C, then –OH, then C=O, cleared by the cut', () => {
    const [first] = TURNS
    expect(markAt(first.dehydrogenation - 0.1)).toBe('none')
    expect(markAt(first.dehydrogenation + 0.5)).toBe('enoyl')
    expect(markAt(first.hydration + 0.1)).toBe('hydroxy')
    expect(markAt(first.oxidation + 0.1)).toBe('keto')
    expect(markAt(first.cut + 0.1)).toBe('none')
  })

  it('hands the chain to the soluble enzymes at the config threshold, after the two membrane-bound turns', () => {
    expect(carbonsAt(T.toSoluble[0])).toBe(SOLUBLE_ENZYMES_FROM_CARBONS)
    // The storyboard shows two turns at the membrane-bound enzymes: a new threshold must
    // fail here rather than silently desynchronise the narration and the animation.
    expect((BETA_OXIDATION.chainCarbons - SOLUBLE_ENZYMES_FROM_CARBONS) / 2).toBe(2)
  })

  it('reports the turn and reaction under way', () => {
    expect(lynenAt(0)).toMatchObject({ turn: 1, reaction: 0, done: false })
    expect(lynenAt(TURNS[1].oxidation + 0.1)).toMatchObject({ turn: 2, reaction: 3, carbonsBefore: 14 })
    expect(lynenAt(DURATION)).toMatchObject({ turn: 7, reaction: 4, done: true })
  })
})

describe('scene 3 — rule 4: the β-oxidation FADH₂ goes through ETF and ETF-QO, never complex II', () => {
  it('routes its electrons VLCAD → ETF → ETF-QO', () => {
    expect(BETA_OX_ELECTRON_ROUTE).toEqual(['vlcad', 'etf', 'etfQo'])
    expect(BETA_OX_ELECTRON_ROUTE).not.toContain('complexII')
  })

  it('makes complex II FADH₂ only in the Krebs cycle (after the β-oxidation)', () => {
    for (const krebs of KREBS) expect(krebs.fadh2).toBeGreaterThan(TURNS[TURNS.length - 1].acetylFormed)
  })
})

describe('scene 3 — CoA hand-overs at the thiolase', () => {
  it('bonds each new CoA only once the previous one has left with the two carbons', () => {
    for (let k = 1; k < 8; k++) {
      const cut = TURNS[k - 1].cut
      expect(coaBond(k)[0]).toBeGreaterThan(cut)
      expect(coaRelease(k - 1)).toBeLessThanOrEqual(coaBond(k)[0])
    }
  })

  it('carries each acetyl group from its release until it enters the cycle', () => {
    for (let k = 0; k < 8; k++) {
      expect(hasAcetyl(k, coaRelease(k) - 0.01)).toBe(false)
      expect(hasAcetyl(k, coaRelease(k) + 0.01)).toBe(true)
      expect(hasAcetyl(k, KREBS[k].enter[1] + 0.01)).toBe(false)
    }
  })

  it('holds the shortened chain on the thiolase between each cut and the new CoA', () => {
    TURNS.forEach((turn, i) => {
      expect(chainHasCoA(turn.cut - 0.01)).toBe(true)
      expect(chainHasCoA(turn.cut + 0.01)).toBe(false)
      expect(chainHasCoA(coaBond(i + 1)[1] + 0.01)).toBe(true)
    })
  })

  it('has a name for every state of the chain the reticle shows', () => {
    const names = content.scenes.scene3.names.acyl as Record<string, string | undefined>
    for (let t = 0; t <= DURATION; t += 0.05) {
      const subject = reticleAt(t)
      if (subject.kind !== 'chain' || subject.mark !== 'none' || subject.bound) continue
      expect(names[String(subject.carbons)], `t = ${t.toFixed(2)} s, C${subject.carbons}`).toBeTruthy()
    }
  })

  it('follows the chain, then the last acetyl-CoA, then the box', () => {
    expect(reticleAt(0).kind).toBe('chain')
    expect(reticleAt(STEP_STARTS.lastTurn + 8)).toEqual({ kind: 'acetyl', index: 7 })
    expect(reticleAt(STEP_STARTS.krebs + 1)).toEqual({ kind: 'acetyl', index: 0 })
    expect(reticleAt(DURATION).kind).toBe('box')
  })
})

describe('scene 3 — every step ends on a still state (arrêt)', () => {
  const material = (): THREE.Material => new THREE.MeshBasicMaterial()
  const models = {
    cpt2: createCpt2(material),
    vlcad: createVlcad(material),
    etfQo: createEtfQo(material),
    etf: createEtf(material),
    tfp: createTfp(material),
    soluble: createSolubleEnzymes(material),
    complexII: createComplexII(material),
  }
  const sites = Object.fromEntries(Object.entries(models).map(([key, model]) => [key, model.sites])) as never
  const object = (): THREE.Object3D => new THREE.Object3D()
  const story = new BetaOxStory({
    chain: object(),
    bondPoint: new THREE.Vector3(0.36, -0.08, 0),
    coas: Array.from({ length: 8 }, object),
    etf: object(),
    electrons: Array.from({ length: 4 }, object),
    nads: [object(), object()],
    water: object(),
    products: { coa: object(), co2: [object(), object()], nadh: [object(), object(), object()], gtp: object() },
    sites,
  })
  const camera = createCameraTrack(story)
  const shot = (): CameraShot => ({ target: new THREE.Vector3(), distance: 1, azimuth: 0, elevation: 0 })

  it('takes the electrons of turn 2 to ETF-QO as well (rule 4)', () => {
    const docked = story.etf.poseAt(T.etfToQo[1] + 0.2).position
    expect(story.etf.poseAt(T.etfToQo2[1] + 0.2).position.distanceTo(docked)).toBeLessThan(0.5)
  })

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
      expect(carbonsAt(t)).toBe(carbonsAt(t + 0.2))
      expect(markAt(t)).toBe(markAt(t + 0.2))
      expect(countersAt(t, cost)).toEqual(countersAt(t + 0.2, cost))
    }
  })
})
