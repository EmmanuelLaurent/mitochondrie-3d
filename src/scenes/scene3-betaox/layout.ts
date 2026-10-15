import { BILAYER_HALF, CUT_Z, FRAME, PATH_Z, v, type MembranePatch, type ProteinPlacement } from '../shared/molecular/frame'

/**
 * Scene 3's molecular set, in the shared frame (the same place as scene 2: the
 * palmitoyl-CoA starts where scene 2 left it, under the inner membrane). Everything
 * happens in the matrix, under the inner membrane's matrix face, left to right in the
 * order of the pathway: VLCAD, ETF-QO (with the soluble ETF), the trifunctional protein
 * with its three pockets, the soluble enzymes of short chains, the acetyl-CoA queue, and
 * the Krebs « black box » under complex II. The chain travels in front (z ≈ PATH_Z),
 * the electrons of the FADH₂ behind it, so the two routes never cross.
 */

export const SET = {
  ...FRAME,
  patch: { minX: -20, maxX: 74, minZ: -18 } satisfies MembranePatch,
} as const

/** The inner membrane's matrix face (head surface). */
export const MATRIX_FACE = SET.immY - BILAYER_HALF

export type ProteinKey = 'cpt2' | 'vlcad' | 'etfQo' | 'etf' | 'tfp' | 'soluble' | 'complexII'

export const PROTEINS: Record<ProteinKey, ProteinPlacement> = {
  // Context: where the palmitoyl-CoA came from (scene 2), dimmed.
  cpt2: { position: v(15.5, SET.immY, PATH_Z - 2.4), footprint: 1.5, leaflets: 'lower' },
  // Long-chain enzymes on the matrix face: VLCAD and the TFP are peripheral (they rest on
  // the head groups), ETF-QO is monotopic (inserted in the matrix leaflet), complex II
  // spans the membrane. Holes stay clear of the rows of lipids along the cut face.
  vlcad: { position: v(21, SET.immY, 15.4), footprint: 0, leaflets: 'none' },
  etfQo: { position: v(28, SET.immY, 14.0), footprint: 1.4, leaflets: 'lower' },
  tfp: { position: v(37, SET.immY, 14.0), footprint: 0, leaflets: 'none' },
  complexII: { position: v(61, SET.immY, 14.6), footprint: 1.7, leaflets: 'both' },
  // Soluble: ETF at rest (it moves), the medium/short-chain enzymes.
  etf: { position: v(25, MATRIX_FACE - 11.3, 12.0), footprint: 0, leaflets: 'none' },
  soluble: { position: v(47.5, MATRIX_FACE - 13.6, 14.4), footprint: 0, leaflets: 'none' },
}

/** The three pockets of the trifunctional protein (reactions 2, 3, 4), on its cut face. */
export const TFP_POCKETS = {
  hydratase: v(32.5, MATRIX_FACE - 4.1, PATH_Z + 0.2),
  dehydrogenase: v(36.5, MATRIX_FACE - 4.3, PATH_Z + 0.2),
  thiolase: v(40.5, MATRIX_FACE - 4.1, PATH_Z + 0.2),
} as const

/** The Krebs cycle black box (a symbol, not a protein): 12 × 8 × 8 nm, under complex II. */
export const KREBS_BOX = {
  center: v(60, MATRIX_FACE - 8.3, 12.6),
  size: v(12, 8, 8),
} as const

/** Entry slot (left face) and exit slot (front face) of the box. */
export const BOX_ENTRY = KREBS_BOX.center.clone().add(v(-KREBS_BOX.size.x / 2 - 0.4, 0, 1.2))
export const BOX_EXIT = KREBS_BOX.center.clone().add(v(-1.5, -1.2, KREBS_BOX.size.z / 2 + 0.6))

/**
 * Eight queue slots for the acetyl-CoA, between the TFP and the box, in front: the first
 * acetyl-CoA nearest the box (it enters first), the last one (our last two carbons)
 * farthest. Each hangs from its losange, so the eight losanges line up to be counted.
 */
export const QUEUE = Array.from({ length: 8 }, (_, i) => v(52.0 - i * 1.2, MATRIX_FACE - 6.2, CUT_Z - 0.8))

/** Where the products of one Krebs turn line up, in front of the box (on its dark face). */
export const PRODUCT_ROW = Array.from({ length: 7 }, (_, i) => v(55.4 + i * 1.5, MATRIX_FACE - 9.4, CUT_Z - 0.4))

/** Where new CoA molecules come from (out of frame, deep in the matrix). */
export const COA_RESERVOIR = v(44, MATRIX_FACE - 22, PATH_Z + 1)

