import * as THREE from 'three'
import { shot, type CameraShot } from '../shared/molecular/camera'
import { v } from '../shared/molecular/frame'
import { NM_PER_UNIT } from '../shared/molecular/organelle'
import { findCristaTip, findCristaWall, INNER_MEMBRANE_FACE_Z } from '../shared/molecular/organelleField'
import { LANDING } from './layout'

/**
 * Where chapter 5 takes over from chapter 4, and where chapter 6 takes over from chapter 5,
 * at the crista tier on the organelle's cut face. Chapter 4 ends on one of the organelle's
 * crista walls, laid flat (its LANDING), framed LANDING + (30, 55, 0) from 760 nm; chapter 5
 * opens on the very same picture, then slides the organelle until the tip of a crista
 * hanging from the boundary membrane (where the cutaway shows it, on the inner membrane's
 * cut face) sits on this set's LANDING, its axis up, before diving × 10 there. It ends back
 * on that tip, where chapter 6 starts.
 */

/** Crista tier on the organelle's cut face around the landing point (= chapter 4's first and last framing). */
export const CRISTA_SHOT: CameraShot = shot(LANDING.clone().add(v(30, 55, 0)), 760, 0.14, 0.16)

/** Chapter 4's crista wall (Scene4Chain: findCristaWall(0.1, 0.36)). */
export const WALL = findCristaWall(0.1, 0.36)

/** This chapter's crista: a finger hanging from the top, inside the quarter the cutaway opens. */
export const TIP = findCristaTip(0.38, 0.42, INNER_MEMBRANE_FACE_Z)

const WALL_ANGLE = Math.atan2(WALL.normal.x, WALL.normal.y)
const TIP_ANGLE = Math.atan2(TIP.axis.x, TIP.axis.y)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

/**
 * Places the organelle (in nanometres): u = 0, chapter 4's wall on LANDING (its last
 * picture); u = 1, the crista tip on LANDING, the crista's axis up.
 */
export function placeOrganelle(object: THREE.Object3D, u: number): void {
  object.quaternion.setFromAxisAngle(Z_AXIS, THREE.MathUtils.lerp(WALL_ANGLE, TIP_ANGLE, u))
  const anchor = WALL.point.clone().lerp(TIP.point, u).multiplyScalar(NM_PER_UNIT).applyQuaternion(object.quaternion)
  object.position.copy(LANDING).sub(anchor)
}
