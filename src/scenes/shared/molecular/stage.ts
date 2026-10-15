import * as THREE from 'three'
import { createStudioEnvironment, createStudioRig, type StudioRig } from '../studioLights'
import { createBackdrop, createMediaUniforms, type MediaLayout, type MediaUniforms } from './media'

/** The key light's shadow box over the action (nm). */
export interface ShadowFrame {
  halfSize: number
  near: number
  far: number
  /** Where the key light aims (centre of the action). */
  target: THREE.Vector3
}

/** Distance of the key light from its target along its direction (nm). */
const KEY_DISTANCE = 140

/**
 * The studio of a molecular set: the house 3-point rig with a shadowing key light, the
 * reflection environment, the compartment media and the backdrop that integrates them.
 * During accumulation the key light is jittered over a small disk: soft shadows on the
 * still frame, crisp ones while moving.
 */
export class MolecularStage {
  readonly media: MediaUniforms
  readonly rig: StudioRig
  private envTarget: THREE.WebGLRenderTarget | null
  private readonly jitter = new THREE.Vector3()
  private readonly direction = new THREE.Vector3()

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    root: THREE.Object3D,
    layout: MediaLayout,
    private readonly shadowFrame: ShadowFrame,
  ) {
    this.media = createMediaUniforms(layout)
    this.rig = createStudioRig()
    root.add(this.rig.group)
    this.envTarget = createStudioEnvironment(renderer)
    scene.environment = this.envTarget.texture
    root.add(createBackdrop(this.media))
  }

  configureShadows(low: boolean): void {
    const { key } = this.rig
    key.castShadow = !low
    const shadow = key.shadow
    shadow.mapSize.set(2048, 2048)
    const { halfSize, near, far, target } = this.shadowFrame
    const cam = shadow.camera
    cam.left = -halfSize
    cam.right = halfSize
    cam.top = halfSize
    cam.bottom = -halfSize
    cam.near = near
    cam.far = far
    cam.updateProjectionMatrix()
    shadow.bias = -0.0004
    shadow.normalBias = 0.03
    // Stylised light: proteins shade what is right under them, but a protein in one
    // membrane should not black out a patch of the next membrane 16 nm below.
    shadow.intensity = 0.6
    key.target.position.copy(target)
    key.position.copy(key.target.position).addScaledVector(this.rig.keyDirection, KEY_DISTANCE)
  }

  /** Accumulation: jitter the key light over a small disk = soft shadows on the still frame. */
  setFrame(frame: number, accumulating: boolean): void {
    const { key, keyDirection } = this.rig
    this.jitter.set(0, 0, 0)
    if (accumulating && frame > 0) {
      const u1 = (frame * 0.618034) % 1
      const u2 = (frame * 0.754877) % 1
      const r = 0.05 * Math.sqrt(u1)
      const tangent = new THREE.Vector3().crossVectors(keyDirection, new THREE.Vector3(0, 1, 0)).normalize()
      const bitangent = new THREE.Vector3().crossVectors(keyDirection, tangent)
      this.jitter.addScaledVector(tangent, r * Math.cos(6.2832 * u2)).addScaledVector(bitangent, r * Math.sin(6.2832 * u2))
    }
    this.direction.copy(keyDirection).add(this.jitter).normalize()
    key.position.copy(key.target.position).addScaledVector(this.direction, KEY_DISTANCE)
  }

  /** Shadow maps belong to lights, not to geometries/materials: freed explicitly. */
  dispose(): void {
    this.rig.key.shadow.dispose()
    this.envTarget?.dispose()
    this.envTarget = null
    this.scene.environment = null
  }
}
