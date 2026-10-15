import * as THREE from 'three'
import { PROTEIN_COLOR } from '../../../config/palette'
import { buildBeadGeometry, fillShape, type Bead, type Sdf } from './beads'

/**
 * Building blocks of the stylised coarse-grained proteins (procedural, no PDB data):
 * recognisable silhouettes and the right topology, not atomic structures. Each protein
 * has its own local frame (origin on the membrane mid-plane at its footprint for
 * membrane proteins, at its centre for soluble ones).
 */

export interface ProteinModel {
  group: THREE.Group
  /** Named sub-parts that move (domain motions, gates), already in `group`. */
  parts: Record<string, THREE.Object3D>
  /** Binding / passage points in the protein's local frame. */
  sites: Record<string, THREE.Vector3>
  /** Focus + context: 1 dims the protein (the active actor stays lit). */
  dim: THREE.IUniform<number>
  /** Where its callout points (local frame). */
  labelAnchor: THREE.Vector3
}

export type MaterialFactory = (dim: THREE.IUniform<number>) => THREE.Material

/** Proteins share one neutral colour; slight shade differences only help separate overlapping silhouettes. */
export const shadeOf = (k: number): string => '#' + new THREE.Color(PROTEIN_COLOR).multiplyScalar(k).getHexString()

export interface BlobSpec {
  sdf: Sdf
  bounds: THREE.Box3
  seed: number
  color: string
  keep?: (p: THREE.Vector3) => boolean
  shell?: number
  /** Bead spacing and radius range (defaults: atom-cluster scale, for close-ups). */
  spacing?: number
  radius?: [number, number]
}

/** Packs beads in a shape: reads as a space-filling protein model up close. */
export function blobBeads(spec: BlobSpec): Bead[] {
  return fillShape(spec.sdf, {
    bounds: spec.bounds,
    spacing: spec.spacing ?? 0.5,
    radius: spec.radius ?? [0.34, 0.45],
    color: new THREE.Color(spec.color),
    shell: spec.shell ?? 1.2,
    shade: 0.16,
    seed: spec.seed,
    keep: spec.keep,
  })
}

export function boundsOf(center: THREE.Vector3, radii: THREE.Vector3, pad = 0.8): THREE.Box3 {
  return new THREE.Box3(center.clone().sub(radii).subScalar(pad), center.clone().add(radii).addScalar(pad))
}

export function meshFromBeads(beads: Bead[], material: THREE.Material, detail = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(buildBeadGeometry(beads, { detail, occlusion: 0.85 }), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** A protein with nothing but a dim uniform, a group and its sites (for scene-specific builders). */
export function emptyModel(material: MaterialFactory): { model: ProteinModel; mat: THREE.Material } {
  const dim = { value: 0 }
  return {
    model: { group: new THREE.Group(), parts: {}, sites: {}, dim, labelAnchor: new THREE.Vector3() },
    mat: material(dim),
  }
}
