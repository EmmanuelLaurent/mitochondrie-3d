import * as THREE from 'three'
import { modalOpen } from '../../../ui/player/StepPlayer'
import { EASE, ramp, type Actor, type Ease } from './choreography'

/** A framing chosen by the storyboard: look at `target` from a direction and distance. */
export interface CameraShot {
  target: THREE.Vector3
  distance: number
  /** Radians around y; 0 looks from +z (the front cut). */
  azimuth: number
  /** Radians above the horizontal. */
  elevation: number
}

const ROTATE_SPEED = 0.005
const KEY_STEP = 0.12
const DAMPING = 10

/**
 * The student's own orbit, layered on top of the scripted framing: dragging (or
 * Shift + arrows, +/-) turns and zooms around the followed molecule without fighting
 * the storyboard; double-click or "0" recentres.
 */
export class OrbitOffsets {
  azimuth = 0
  elevation = 0
  zoom = 1
  enabled = true
  private readonly goal = { azimuth: 0, elevation: 0, zoom: 1 }
  private dragging: { x: number; y: number; id: number } | null = null

  constructor(
    private readonly element: HTMLElement,
    private readonly limits = { minZoom: 0.45, maxZoom: 2.2, maxElevation: 1.2 },
  ) {
    element.addEventListener('pointerdown', this.onPointerDown)
    element.addEventListener('pointermove', this.onPointerMove)
    element.addEventListener('pointerup', this.onPointerUp)
    element.addEventListener('pointercancel', this.onPointerUp)
    element.addEventListener('wheel', this.onWheel, { passive: false })
    element.addEventListener('dblclick', this.reset)
    document.addEventListener('keydown', this.onKey)
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown)
    this.element.removeEventListener('pointermove', this.onPointerMove)
    this.element.removeEventListener('pointerup', this.onPointerUp)
    this.element.removeEventListener('pointercancel', this.onPointerUp)
    this.element.removeEventListener('wheel', this.onWheel)
    this.element.removeEventListener('dblclick', this.reset)
    document.removeEventListener('keydown', this.onKey)
  }

  readonly reset = (): void => {
    this.goal.azimuth = 0
    this.goal.elevation = 0
    this.goal.zoom = 1
  }

  /** Damps toward the goal; true while still moving. */
  update(deltaSeconds: number): boolean {
    const k = 1 - Math.exp(-DAMPING * Math.min(deltaSeconds, 0.1))
    const before = this.azimuth + this.elevation + this.zoom
    this.azimuth += (this.goal.azimuth - this.azimuth) * k
    this.elevation += (this.goal.elevation - this.elevation) * k
    this.zoom += (this.goal.zoom - this.zoom) * k
    const settled =
      Math.abs(this.goal.azimuth - this.azimuth) < 1e-4 &&
      Math.abs(this.goal.elevation - this.elevation) < 1e-4 &&
      Math.abs(this.goal.zoom - this.zoom) < 1e-4
    if (settled) {
      this.azimuth = this.goal.azimuth
      this.elevation = this.goal.elevation
      this.zoom = this.goal.zoom
    }
    return Math.abs(this.azimuth + this.elevation + this.zoom - before) > 1e-6
  }

  get isOffset(): boolean {
    return this.goal.azimuth !== 0 || this.goal.elevation !== 0 || this.goal.zoom !== 1
  }

  private clampGoal(): void {
    this.goal.elevation = THREE.MathUtils.clamp(this.goal.elevation, -this.limits.maxElevation, this.limits.maxElevation)
    this.goal.zoom = THREE.MathUtils.clamp(this.goal.zoom, this.limits.minZoom, this.limits.maxZoom)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) return
    this.dragging = { x: event.clientX, y: event.clientY, id: event.pointerId }
    this.element.setPointerCapture(event.pointerId)
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.dragging.id) return
    this.goal.azimuth -= (event.clientX - this.dragging.x) * ROTATE_SPEED
    this.goal.elevation += (event.clientY - this.dragging.y) * ROTATE_SPEED
    this.dragging.x = event.clientX
    this.dragging.y = event.clientY
    this.clampGoal()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.dragging?.id === event.pointerId) this.dragging = null
  }

  private readonly onWheel = (event: WheelEvent): void => {
    // Ctrl + wheel (and trackpad pinch) is the browser's page zoom: leave it alone.
    if (!this.enabled || event.ctrlKey) return
    event.preventDefault()
    this.goal.zoom *= Math.exp(event.deltaY * 0.001)
    this.clampGoal()
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    // Ctrl/Cmd + '+', '−', '0' are the browser's zoom (WCAG 1.4.4); a modal owns the keys.
    if (!this.enabled || event.ctrlKey || event.metaKey || event.altKey || modalOpen()) return
    const target = event.target
    if (target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
    if (event.shiftKey && event.key === 'ArrowLeft') this.goal.azimuth += KEY_STEP
    else if (event.shiftKey && event.key === 'ArrowRight') this.goal.azimuth -= KEY_STEP
    else if (event.shiftKey && event.key === 'ArrowUp') this.goal.elevation += KEY_STEP
    else if (event.shiftKey && event.key === 'ArrowDown') this.goal.elevation -= KEY_STEP
    else if (event.key === '+' || event.key === '=') this.goal.zoom /= 1.15
    else if (event.key === '-') this.goal.zoom *= 1.15
    else if (event.key === '0') this.reset()
    else return
    event.preventDefault()
    this.clampGoal()
  }
}

const lookAhead = new THREE.Vector3()
const cameraUp = new THREE.Vector3()

/**
 * Places the camera for a shot plus the student's offsets; near/far follow the distance.
 * @param lift fraction of the view height by which the target is raised above the
 * centre of the picture (keeps the subject clear of the narration panel at the bottom).
 */
export function placeCamera(camera: THREE.PerspectiveCamera, shot: CameraShot, offsets: OrbitOffsets | null, farExtra = 250, lift = 0): void {
  const azimuth = shot.azimuth + (offsets?.azimuth ?? 0)
  const elevation = THREE.MathUtils.clamp(shot.elevation + (offsets?.elevation ?? 0), -1.35, 1.35)
  const distance = shot.distance * (offsets?.zoom ?? 1)
  const cosEl = Math.cos(elevation)
  camera.position.set(
    shot.target.x + distance * Math.sin(azimuth) * cosEl,
    shot.target.y + distance * Math.sin(elevation),
    shot.target.z + distance * Math.cos(azimuth) * cosEl,
  )
  camera.up.set(0, 1, 0)
  camera.lookAt(shot.target)
  if (lift !== 0) {
    // Slide the camera down its own up axis: the target rises on screen, nothing rotates.
    camera.updateMatrixWorld()
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1)
    const viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    const shift = -lift * viewHeight
    camera.position.addScaledVector(cameraUp, shift)
    lookAhead.copy(shot.target).addScaledVector(cameraUp, shift)
    camera.lookAt(lookAhead)
  }
  camera.near = Math.max(0.05, distance * 0.01)
  camera.far = distance * 3 + farExtra
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}

/** Blend between two shots: the target eases linearly, the distance geometrically (constant zoom speed). */
export function mixShots(a: CameraShot, b: CameraShot, u: number, out: CameraShot): CameraShot {
  out.target.lerpVectors(a.target, b.target, u)
  out.distance = a.distance * Math.pow(b.distance / a.distance, u)
  let dAz = b.azimuth - a.azimuth
  if (dAz > Math.PI) dAz -= Math.PI * 2
  if (dAz < -Math.PI) dAz += Math.PI * 2
  out.azimuth = a.azimuth + dAz * u
  out.elevation = THREE.MathUtils.lerp(a.elevation, b.elevation, u)
  return out
}

export const shot = (target: THREE.Vector3, distance: number, azimuth: number, elevation: number): CameraShot => ({
  target,
  distance,
  azimuth,
  elevation,
})

/** A camera key of the storyboard: at time `t`, the framing is `shot` (fixed or moving). */
export interface ShotKey {
  t: number
  shot: CameraShot | ((t: number) => CameraShot)
  /** Easing of the move that arrives at this key. */
  ease?: Ease
  /**
   * Big zooms: the aim drifts in proportion to the framed size, so the subject stays in
   * view while the field of view grows (or shrinks) by orders of magnitude.
   */
  aimFollowsZoom?: boolean
}

/** The camera as a pure function of time, through the storyboard's keys. */
export function createShotTrack(keys: ShotKey[]): (t: number, out: CameraShot) => CameraShot {
  const a: CameraShot = { target: new THREE.Vector3(), distance: 1, azimuth: 0, elevation: 0 }
  const b: CameraShot = { target: new THREE.Vector3(), distance: 1, azimuth: 0, elevation: 0 }
  const evaluate = (key: ShotKey, t: number, out: CameraShot): CameraShot => {
    const resolved = typeof key.shot === 'function' ? key.shot(t) : key.shot
    out.target.copy(resolved.target)
    out.distance = resolved.distance
    out.azimuth = resolved.azimuth
    out.elevation = resolved.elevation
    return out
  }
  return (t, out) => {
    if (t <= keys[0].t) return evaluate(keys[0], t, out)
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i].t) {
        const u = ramp(t, keys[i - 1].t, keys[i].t, keys[i].ease ?? EASE.inOut)
        evaluate(keys[i - 1], t, a)
        evaluate(keys[i], t, b)
        mixShots(a, b, u, out)
        if (keys[i].aimFollowsZoom && b.distance !== a.distance) {
          const k = (out.distance - a.distance) / (b.distance - a.distance)
          out.target.lerpVectors(a.target, b.target, THREE.MathUtils.clamp(k, 0, 1))
        }
        return out
      }
    }
    return evaluate(keys[keys.length - 1], t, out)
  }
}

/**
 * A close shot that follows an actor through a short trailing average of its smooth
 * path (no jitter, and still a pure function of time). `point` is the followed point in
 * the actor's frame (e.g. the middle of a chain).
 */
export function followShot(actor: Actor, point: THREE.Vector3, offset: THREE.Vector3, distance: number, azimuth: number, elevation: number): (t: number) => CameraShot {
  const sample = new THREE.Vector3()
  return (t) => {
    const target = new THREE.Vector3()
    const samples = 6
    for (let i = 0; i < samples; i++) {
      const p = actor.poseAt(Math.max(0, t - (i / samples) * 0.6), undefined, false)
      target.add(sample.copy(point).applyQuaternion(p.quaternion).add(p.position))
    }
    target.multiplyScalar(1 / samples).add(offset)
    return { target, distance, azimuth, elevation }
  }
}
