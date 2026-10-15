import type { CameraShot } from './camera'
import { pose } from './choreography'
import { BILAYER_HALF, FRAME, PATH_Z, facing, v } from './frame'

/**
 * Where one chapter hands over to the next. Scene 2 ends, and scene 3 starts, with the
 * palmitoyl-CoA resting in the matrix just under the inner membrane, seen at the crista
 * tier on the organelle's cut face (marked by its reticle).
 */

/** Where the palmitoyl-CoA rests in the matrix at the end of chapter 2 (pose of its C1 frame). */
export const MATRIX_REST = pose(v(7, FRAME.immY - BILAYER_HALF - 7.5, PATH_Z - 0.5), facing(v(0.85, -0.45, 0.1)))

/** The crista-tier framing around a point of the matrix (the cristae in section all around it). */
export function cristaShotAround(point: ReturnType<typeof v>): CameraShot {
  return { target: point.clone().add(v(95, 70, 0)), distance: 760, azimuth: 0.12, elevation: 0.17 }
}

/** Last frame of chapter 2, first frame of chapter 3. */
export const CRISTA_SHOT: CameraShot = cristaShotAround(MATRIX_REST.position)
