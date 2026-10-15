import * as THREE from 'three'
import { ORGANELLE_MODEL_DIAMETER_M } from '../../../config/science.config'
import type { QualityLevel } from '../../../core/QualitySettings'
import { createMitochondrionSdf, MITO, type MitochondrionSdf } from '../../scene1-exterior/mitochondrionSdf'
import { raymarchLights } from '../studioLights'
import type { CameraShot } from './camera'

/**
 * Scene 1's raymarched organelle placed in a molecular set's nanometre world, for the
 * tier changes: a ×10 or ×100 dive dissolves it into the molecular set at the same place,
 * a ÷10 pull-back dissolves the set back into it.
 */

/** Nanometres per organelle-model unit (the organelle's diameter stands for ~1 µm). */
export const NM_PER_UNIT = ORGANELLE_MODEL_DIAMETER_M / 1e-9 / (2 * MITO.outerRadius)

/** Top edge of the organelle's cut on the outer membrane (cut fully open), in organelle units. */
export const OUTER_CUT_EDGE = new THREE.Vector3(0, Math.sqrt((MITO.outerRadius - 0.004) ** 2 - MITO.stepOuter ** 2), MITO.stepOuter)

/** On the matrix cut face, just under the inner membrane, between two cristae (organelle units). */
export const MATRIX_VIEWPOINT = new THREE.Vector3(0.095, 0.4, -MITO.stepMatrix + 0.006)

/** Where to put the organelle so that its point `local` (organelle units) lands on `world` (nm). */
export function organellePosition(local: THREE.Vector3, world: THREE.Vector3): THREE.Vector3 {
  return world.clone().sub(local.clone().multiplyScalar(NM_PER_UNIT))
}

/** Scene 1's camera, (1.4, 2.87, 6.05) looking at (0, -0.1, 0), as a shot on an organelle placed at `position`. */
export function scene1Shot(position: THREE.Vector3): CameraShot {
  const target = position.clone().add(new THREE.Vector3(0, -0.1, 0).multiplyScalar(NM_PER_UNIT))
  const offset = new THREE.Vector3(1.4, 2.87, 6.05).multiplyScalar(NM_PER_UNIT)
  return {
    target,
    distance: offset.length(),
    azimuth: Math.atan2(offset.x, offset.z),
    elevation: Math.asin(offset.y / offset.length()),
  }
}

/** The organelle of scene 1, in nanometres. */
export function createNanoOrganelle(quality: QualityLevel): MitochondrionSdf {
  const sdf = createMitochondrionSdf(raymarchLights())
  sdf.setQuality(quality)
  sdf.mesh.scale.setScalar(NM_PER_UNIT)
  return sdf
}
