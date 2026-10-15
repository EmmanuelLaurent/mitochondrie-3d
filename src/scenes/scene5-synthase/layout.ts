import * as THREE from 'three'
import { BILAYER_HALF, CUT_Z, FRAME, IMS_GAP, v } from '../shared/molecular/frame'
import type { CurvedHole } from '../shared/molecular/curvedMembrane'
import { cristaProfile } from '../shared/molecular/curvedMembrane'
import type { MediaLayout } from '../shared/molecular/media'

/**
 * Scene 5's set: the tip of one crista in section, 1 unit = 1 nm, y up. The crista hangs
 * into the matrix: two flanks of inner membrane (mid-planes at x = ±TIP_RADIUS) joined
 * by a half-round tip below y = 0. Inside, the lumen (part of the intermembrane space,
 * where the pumped H⁺ are); outside, the matrix. The ATP synthases sit as dimers on the
 * most curved part, the tip; the hero dimer is in front, its c-ring flush with the cut.
 * The phosphate carrier and the ANT are on the right flank (sliced by the cut, like the
 * CACT of chapter 2); complexes I, III and IV further up both flanks, for the circuit.
 */

/** Mid-plane radius of the tip: the lumen is 16 nm wide head to head, as the IMS of chapters 2–4. */
export const TIP_RADIUS = IMS_GAP / 2 + BILAYER_HALF

/** The flanks rise beyond every shot. */
export const FLANK_TOP = 420

/** The membrane's mid-plane in section: down the left flank, around the tip, up the right flank. */
export const PROFILE = cristaProfile(TIP_RADIUS, FLANK_TOP)

/** Arc length (along PROFILE) of the tip point at polar angle `angle` (π: left, 3π/2: bottom, 2π: right). */
export const tipArc = (angle: number): number => FLANK_TOP + TIP_RADIUS * (angle - Math.PI)

/** Arc length of the point at height y on the left or right flank. */
export const flankArc = (side: -1 | 1, y: number): number => (side < 0 ? FLANK_TOP - y : FLANK_TOP + Math.PI * TIP_RADIUS + y)

/** Point on the membrane's mid-plane at polar angle `angle` of the tip. */
export const tipPoint = (angle: number, z: number): THREE.Vector3 => v(TIP_RADIUS * Math.cos(angle), TIP_RADIUS * Math.sin(angle), z)

/** The lumen's inner boundary (head surface), and the matrix's. */
export const LUMEN_RADIUS = TIP_RADIUS - BILAYER_HALF
export const OUTER_RADIUS = TIP_RADIUS + BILAYER_HALF

// ------------------------------------------------------------------ synthases

/** Each monomer's axis leaves the tip 43° from straight down (the dimer is ~86°, stylised). */
export const DIMER_HALF_ANGLE = THREE.MathUtils.degToRad(43)

/** Plane of the hero dimer: its c-ring's front face is flush with the cut (not sliced). */
export const SYNTHASE_Z = CUT_Z - 2.4

/** Rows of dimers along the tip, every 12 nm behind the hero. */
export const ROW_SPACING = 12
export const ROW_COUNT = 4

/** From the c-ring's centre (on the mid-plane) to the centre of the F1 head, along the axis. */
export const F1_DISTANCE = 11.5

export interface MonomerPlacement {
  /** Polar angle of the axis on the tip. */
  angle: number
  /** Centre of Fo (c-ring), on the membrane mid-plane. */
  fo: THREE.Vector3
  /** Unit axis, from Fo toward F1 (out of the crista, into the matrix). */
  axis: THREE.Vector3
  /** Centre of the F1 head. */
  f1: THREE.Vector3
  /** Mirrored (the partner): its subunit a and stalk are on its own outer side. */
  mirror: boolean
  /** Orientation of the local frame: +y into the lumen (toward the crista's axis), z = world z. */
  quaternion: THREE.Quaternion
}

function monomer(angle: number, z: number, mirror: boolean): MonomerPlacement {
  const axis = v(Math.cos(angle), Math.sin(angle), 0)
  const fo = tipPoint(angle, z)
  // Local +y = −axis (the lumen side); rotation about z.
  const quaternion = new THREE.Quaternion().setFromAxisAngle(v(0, 0, 1), Math.atan2(axis.x, -axis.y))
  return { angle, fo, axis, f1: fo.clone().addScaledVector(axis, F1_DISTANCE), mirror, quaternion }
}

const BOTTOM = 1.5 * Math.PI

/** The hero (right monomer: its subunit a faces the right flank) and its partner. */
export const HERO = monomer(BOTTOM + DIMER_HALF_ANGLE, SYNTHASE_Z, false)
export const PARTNER = monomer(BOTTOM - DIMER_HALF_ANGLE, SYNTHASE_Z, true)

/** The other dimers of the row, behind (context, simplified). */
export const ROW: MonomerPlacement[] = Array.from({ length: ROW_COUNT }, (_, i) => {
  const z = SYNTHASE_Z - ROW_SPACING * (i + 1)
  return [monomer(BOTTOM + DIMER_HALF_ANGLE, z, false), monomer(BOTTOM - DIMER_HALF_ANGLE, z, true)]
}).flat()

// ------------------------------------------------------------------ carriers

export interface FlankPlacement {
  /** On the right flank's mid-plane. */
  position: THREE.Vector3
  /** Local +y (lumen side) → −x; local x → +y. */
  quaternion: THREE.Quaternion
}

const rightFlank = (y: number): FlankPlacement => ({
  position: v(TIP_RADIUS, y, CUT_Z),
  quaternion: new THREE.Quaternion().setFromAxisAngle(v(0, 0, 1), Math.PI / 2),
})

const leftFlank = (y: number): FlankPlacement => ({
  position: v(-TIP_RADIUS, y, CUT_Z),
  quaternion: new THREE.Quaternion().setFromAxisAngle(v(0, 0, 1), -Math.PI / 2),
})

export const PHOSPHATE_CARRIER = rightFlank(8)
export const ANT = rightFlank(17)

/** Respiratory complexes up both flanks (context; they light up in the circuit step). */
export type ComplexKey = 'complexI' | 'complexIII' | 'complexIV'
export const FLANK_COMPLEXES: { key: ComplexKey; placement: FlankPlacement }[] = [
  { key: 'complexIV', placement: leftFlank(34) },
  { key: 'complexIII', placement: leftFlank(58) },
  { key: 'complexI', placement: leftFlank(92) },
  { key: 'complexIII', placement: rightFlank(44) },
  { key: 'complexIV', placement: rightFlank(66) },
  { key: 'complexI', placement: rightFlank(98) },
]

// ------------------------------------------------------------------ membrane

/** Where the lipids are instanced (beyond: procedural sheets): the tip and the carriers. */
export const MEMBRANE_DETAIL = { sMin: flankArc(-1, 22), sMax: flankArc(1, 26), zMin: CUT_Z - 14 } as const

/** Holes in the lipids for every protein crossing the membrane in the detailed zone. */
export function membraneHoles(): CurvedHole[] {
  const holes: CurvedHole[] = []
  for (const m of [HERO, PARTNER]) holes.push({ s: tipArc(m.angle), z: SYNTHASE_Z, radius: 3.4, leaflets: 'both' })
  for (const carrier of [PHOSPHATE_CARRIER, ANT]) holes.push({ s: flankArc(1, carrier.position.y), z: CUT_Z, radius: 2.4, leaflets: 'both' })
  return holes
}

// --------------------------------------------------------------------- media

/**
 * The lumen (IMS): the flanks' box and the tip's half-round end; the matrix: everything
 * outside the crista's outer head surface (left, right, below, and around the tip).
 */
export function cristaMedia(): MediaLayout {
  const e = FRAME.extent
  const top = FLANK_TOP + 600
  return [
    { kind: 'intermembraneSpace', box: new THREE.Box3(v(-LUMEN_RADIUS, 0, -e), v(LUMEN_RADIUS, top, CUT_Z)) },
    {
      kind: 'intermembraneSpace',
      box: new THREE.Box3(v(-LUMEN_RADIUS, -LUMEN_RADIUS, -e), v(LUMEN_RADIUS, 0, CUT_Z)),
      cylinder: { x: 0, y: 0, radius: LUMEN_RADIUS, keep: 'inside' },
    },
    { kind: 'matrix', box: new THREE.Box3(v(-e, -e, -e), v(-OUTER_RADIUS, top, CUT_Z)) },
    { kind: 'matrix', box: new THREE.Box3(v(OUTER_RADIUS, -e, -e), v(e, top, CUT_Z)) },
    { kind: 'matrix', box: new THREE.Box3(v(-OUTER_RADIUS, -e, -e), v(OUTER_RADIUS, -OUTER_RADIUS, CUT_Z)) },
    {
      kind: 'matrix',
      box: new THREE.Box3(v(-OUTER_RADIUS, -OUTER_RADIUS, -e), v(OUTER_RADIUS, 0, CUT_Z)),
      cylinder: { x: 0, y: 0, radius: OUTER_RADIUS, keep: 'outside' },
    },
  ]
}

/** Which compartment a point is in (for the « Vous êtes ici » gauge and tests). */
export type Compartment = 'lumen' | 'innerMembrane' | 'matrix'

export function compartmentOf(p: THREE.Vector3): Compartment {
  // Distance from the crista's mid-surface (negative inside the lumen).
  const d = p.y >= 0 ? Math.abs(p.x) - TIP_RADIUS : Math.hypot(p.x, p.y) - TIP_RADIUS
  if (d < -BILAYER_HALF) return 'lumen'
  if (d > BILAYER_HALF) return 'matrix'
  return 'innerMembrane'
}

// ------------------------------------------------------------------- H⁺ crowd

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Slots of the pumped H⁺ crowd in the lumen (one bead stands for many: the real numbers
 * are tiny), behind the cut, from the tip up the flanks; seeded, never closer than 0.9 nm.
 */
export function lumenSlots(count: number, seed = 5005): THREE.Vector3[] {
  const rand = seeded(seed)
  const slots: THREE.Vector3[] = []
  const r = LUMEN_RADIUS - 0.7
  let guard = 0
  while (slots.length < count && guard++ < 100000) {
    const x = (rand() * 2 - 1) * r
    const y = -r + rand() * (70 + r)
    const z = CUT_Z - 0.7 - rand() * 13
    if (y < 0 && Math.hypot(x, y) > r) continue
    const p = v(x, y, z)
    if (slots.some((other) => other.distanceToSquared(p) < 0.9 * 0.9)) continue
    slots.push(p)
  }
  return slots
}

/** A few H⁺ in the matrix around the synthase (they leave Fo there). */
export function matrixSlots(count: number, seed = 5011): THREE.Vector3[] {
  const rand = seeded(seed)
  const slots: THREE.Vector3[] = []
  let guard = 0
  while (slots.length < count && guard++ < 100000) {
    const angle = BOTTOM + (rand() * 2 - 1) * 1.3
    const radius = OUTER_RADIUS + 1.2 + rand() * 9
    const p = v(Math.cos(angle) * radius, Math.sin(angle) * radius, CUT_Z - 0.8 - rand() * 10)
    // Not inside the F1 heads.
    if ([HERO, PARTNER].some((m) => p.distanceTo(m.f1) < 6.6)) continue
    if (slots.some((other) => other.distanceToSquared(p) < 1.2 * 1.2)) continue
    slots.push(p)
  }
  return slots
}
