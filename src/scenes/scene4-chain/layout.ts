import * as THREE from 'three'
import { BILAYER_HALF, CUT_Z, FRAME, IMS_GAP, PATH_Z, v, type MembranePatch, type ProteinPlacement } from '../shared/molecular/frame'
import type { MediaLayout } from '../shared/molecular/media'

/**
 * Scene 4's set: the wall of a crista in section, 1 unit = 1 nm, y up. The inner
 * membrane (mid-plane y = 0) carries the respiratory chain; above it, the lumen of the
 * crista — part of the intermembrane space, where the pumped H⁺ accumulate; above the
 * lumen, the opposite wall of the crista (drawn empty, flagged); below the membrane, and
 * beyond the opposite wall, the matrix. The complexes are centred on the front cut and
 * sliced by it, so their electron relays and H⁺ channels are seen on the section face.
 * Left to right: I, III, ETF-QO, II, IV — every Q path to III stays clear of the
 * transmembrane proteins, and every cytochrome c path runs above proteins that have no
 * domain in the intermembrane space.
 */

export const IMM_Y = 0
/** Mid-plane of the crista's opposite wall. */
export const WALL_Y = IMS_GAP + 2 * BILAYER_HALF
export const LUMEN = { bottom: IMM_Y + BILAYER_HALF, top: WALL_Y - BILAYER_HALF } as const

export const PATCH: MembranePatch = { minX: -92, maxX: 80, minZ: -14 }

export type ComplexKey = 'complexI' | 'complexIII' | 'etfQo' | 'complexII' | 'complexIV'
export type ProteinKey = ComplexKey | 'acad' | 'etf'

export const PROTEINS: Record<ProteinKey, ProteinPlacement> = {
  complexI: { position: v(-39, IMM_Y, CUT_Z), footprint: 0, leaflets: 'none' },
  complexIII: { position: v(0, IMM_Y, CUT_Z), footprint: 0, leaflets: 'none' },
  etfQo: { position: v(11, IMM_Y, CUT_Z - 3.2), footprint: 1.4, leaflets: 'lower' },
  complexII: { position: v(21, IMM_Y, CUT_Z), footprint: 0, leaflets: 'none' },
  complexIV: { position: v(31, IMM_Y, CUT_Z), footprint: 0, leaflets: 'none' },
  acad: { position: v(4.5, IMM_Y - 11.5, PATH_Z - 2), footprint: 0, leaflets: 'none' },
  etf: { position: v(14.5, IMM_Y - 14.2, PATH_Z - 2.0), footprint: 0, leaflets: 'none' },
}

/**
 * Holes for the transmembrane complexes (sliced by the cut): ellipses approximated by a
 * few circles along x, through both leaflets.
 */
export const MEMBRANE_HOLES: ProteinPlacement[] = [
  ...[-46.5, -42.5, -38.5, -34.5, -31].map((x) => ({ position: v(x, IMM_Y, CUT_Z), footprint: 2.6, leaflets: 'both' as const })),
  ...[-2.6, 2.6].map((x) => ({ position: v(x, IMM_Y, CUT_Z), footprint: 2.9, leaflets: 'both' as const })),
  { position: v(21, IMM_Y, CUT_Z), footprint: 2.2, leaflets: 'both' },
  { position: v(31, IMM_Y, CUT_Z), footprint: 3.3, leaflets: 'both' },
  PROTEINS.etfQo,
]

/** Where the cytochromes c rest, in the lumen just above the head groups. */
export const CYT_C_Y = LUMEN.bottom + 3.2

/** The front plane of the section, where the relay studs and channels are drawn. */
export const SECTION_Z = CUT_Z + 0.05

/** The three aqueous slabs: matrix below, the crista lumen (IMS), matrix beyond the opposite wall. */
export function chainMedia(): MediaLayout {
  const extent = FRAME.extent
  return [
    { kind: 'matrix', box: new THREE.Box3(v(-extent, IMM_Y - BILAYER_HALF - 600, -extent), v(extent, IMM_Y - BILAYER_HALF, CUT_Z)) },
    { kind: 'intermembraneSpace', box: new THREE.Box3(v(-extent, LUMEN.bottom, -extent), v(extent, LUMEN.top, CUT_Z)) },
    { kind: 'matrix', box: new THREE.Box3(v(-extent, WALL_Y + BILAYER_HALF, -extent), v(extent, WALL_Y + BILAYER_HALF + 600, CUT_Z)) },
  ]
}

/**
 * The 400 lumen slots of the pumped H⁺ (one bead per H⁺): seeded, spread through the
 * crista lumen behind the cut, denser near the membrane that pumps them.
 */
export function protonSlots(count: number, seed = 4004): THREE.Vector3[] {
  let s = seed >>> 0
  const rand = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const slots: THREE.Vector3[] = []
  while (slots.length < count) {
    const x = THREE.MathUtils.lerp(-58, 44, rand())
    const y = LUMEN.bottom + 0.6 + Math.pow(rand(), 1.4) * (LUMEN.top - LUMEN.bottom - 1.2)
    const z = CUT_Z - 0.6 - rand() * 13
    const p = v(x, y, z)
    // Keep the beads off the cytochrome c lane at the front and off the complexes' heads
    // in the intermembrane space (complex III's dimer, complex IV's CuA domain).
    if (z > CUT_Z - 3.4 && Math.abs(y - (CYT_C_Y + 0.6)) < 2.0) continue
    if (z > CUT_Z - 3.4 && y < LUMEN.bottom + 4.8 && (Math.abs(x) < 5.4 || Math.abs(x - 31.7) < 2.9)) continue
    if (slots.some((other) => other.distanceToSquared(p) < 0.85 * 0.85)) continue
    slots.push(p)
  }
  return slots
}
