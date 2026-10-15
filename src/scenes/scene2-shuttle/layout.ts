import { BILAYER_HALF, CUT_Z, FRAME, PATH_Z, v, type MembranePatch, type ProteinPlacement } from '../shared/molecular/frame'

/**
 * Scene 2's molecular set, in the shared frame (shared/molecular/frame.ts): cytosol on
 * top, outer membrane, intermembrane space, inner membrane, matrix at the bottom. The
 * shuttle runs left to right and top to bottom, just behind the front cut.
 */

export const SET = {
  ...FRAME,
  /** High-detail patch of instanced lipids; beyond it, procedural continuation planes. */
  patch: { minX: -58, maxX: 58, minZ: -26 } satisfies MembranePatch,
} as const

export type ProteinKey = 'acsl' | 'cpt1' | 'porin' | 'cact' | 'cpt2' | 'pyrophosphatase'

// Left to right in the order the molecule meets them. Channels sit on the cut plane
// (sliced through their pore); enzymes sit just behind it, whole.
export const PROTEINS: Record<ProteinKey, ProteinPlacement> = {
  acsl: { position: v(-20, SET.ommY, PATH_Z - 2.4), footprint: 1.1, leaflets: 'upper' },
  cpt1: { position: v(-9.5, SET.ommY, PATH_Z - 2.8), footprint: 2.2, leaflets: 'both' },
  porin: { position: v(-2, SET.ommY, CUT_Z), footprint: 2.5, leaflets: 'both' },
  cact: { position: v(9, SET.immY, CUT_Z), footprint: 2.5, leaflets: 'both' },
  cpt2: { position: v(15.5, SET.immY, PATH_Z - 2.4), footprint: 1.5, leaflets: 'lower' },
  // Cytosolic, not in a membrane: placed above the outer membrane, behind and left of ACSL.
  pyrophosphatase: { position: v(-25.8, SET.ommY + BILAYER_HALF + 5.8, PATH_Z - 3.2), footprint: 0, leaflets: 'none' },
}
