import * as THREE from 'three'
import type { MediaLayout } from './media'

/**
 * The common frame of the molecular sets (scenes 2 to 5), in nanometres (1 scene
 * unit = 1 nm), y up. The membranes extend far in x and -z; the front (+z) is cut open
 * at CUT_Z, scene 1's cutaway convention, so every crossing is seen in section, and the
 * molecules travel just behind the cut.
 *
 * Roughly to scale: bilayers ~5 nm, enzymes 5–7 nm, palmitate ~2 nm. The
 * intermembrane space is ~16 nm here (cryo-ET values vary, ~10–20 nm): flagged as
 * approximate in the tooltips.
 */

export const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z)

export const BILAYER = {
  spacing: 0.88, // head-to-head lattice spacing (~0.67 nm² per lipid)
  headRadius: 0.44,
  headOffset: 1.95, // head centre to mid-plane
  tailLength: 1.5,
  tailRadius: 0.17,
  edgeRows: 3, // full lipids (head + tails) along the cut face
} as const

/** Outer extent of a bilayer from its mid-plane (head surface). */
export const BILAYER_HALF = BILAYER.headOffset + BILAYER.headRadius

/** Clear water between the two membranes (head surface to head surface). */
export const IMS_GAP = 16

/** The plane of the front cut, where channels are sliced through their pore. */
export const CUT_Z = 18

/** Where the molecules travel: just behind the cut, so they stay visible in section. */
export const PATH_Z = CUT_Z - 1.6

/**
 * Scenes 2 and 3 share one place: outer membrane at y = 0, inner membrane below it,
 * cytosol above, matrix below. Media and membranes extend `extent` nm (they fade into
 * haze long before).
 */
export const FRAME = {
  ommY: 0,
  immY: -(IMS_GAP + 2 * BILAYER_HALF),
  extent: 3000,
  cytosolHeight: 600,
  matrixDepth: 600,
} as const

/** The region where a membrane is drawn with instanced lipids (procedural planes beyond). */
export interface MembranePatch {
  minX: number
  maxX: number
  minZ: number
}

export interface ProteinPlacement {
  /** Footprint centre (x, z) on the membrane mid-plane (y). */
  position: THREE.Vector3
  /** Radius of the hole cut in the lipids where the protein spans or anchors in the membrane. */
  footprint: number
  /** Which leaflets the hole goes through. */
  leaflets: 'both' | 'upper' | 'lower' | 'none'
}

/** Cytosol, intermembrane space and matrix of the shared frame; all end at the front cut. */
export function frameMedia(cutZ = CUT_Z): MediaLayout {
  const { extent, cytosolHeight, matrixDepth, ommY, immY } = FRAME
  return [
    {
      kind: 'cytosol',
      box: new THREE.Box3(v(-extent, ommY + BILAYER_HALF, -extent), v(extent, ommY + BILAYER_HALF + cytosolHeight, extent)),
    },
    {
      kind: 'intermembraneSpace',
      box: new THREE.Box3(v(-extent, immY + BILAYER_HALF, -extent), v(extent, ommY - BILAYER_HALF, cutZ)),
    },
    {
      kind: 'matrix',
      box: new THREE.Box3(v(-extent, immY - BILAYER_HALF - matrixDepth, -extent), v(extent, immY - BILAYER_HALF, cutZ)),
    },
  ]
}

/**
 * Orientation for a molecule whose body runs along its local +x (carriers) or whose
 * tail runs along local -x (the chain): local x along `axis`, the zig-zag plane turned
 * toward the camera side (+z), so the shape always reads.
 */
export function facing(axis: THREE.Vector3, toward = v(0.15, 0.25, 1)): THREE.Quaternion {
  const x = axis.clone().normalize()
  const z = toward.clone().sub(x.clone().multiplyScalar(toward.dot(x))).normalize()
  const y = new THREE.Vector3().crossVectors(z, x)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}
