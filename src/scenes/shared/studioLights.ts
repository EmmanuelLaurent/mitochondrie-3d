import * as THREE from 'three'
import type { MitochondrionLights } from '../scene1-exterior/mitochondrionSdf'

/**
 * The house 3-point rig (warm key, cool fill, cyan rim, sky/ground ambient), shared
 * by the raymarched organelle and the mesh scenes so a zoom between them keeps the
 * same light. Colours carry the raymarcher's intensities (radiance, no 1/π).
 */
export const STUDIO = {
  keyDir: new THREE.Vector3(4, 5.5, 3.5),
  keyColor: new THREE.Color(0xffe3bd),
  keyIntensity: 2.4,
  fillDir: new THREE.Vector3(-4.5, 1.5, -1.5),
  fillColor: new THREE.Color(0x4f86c6),
  fillIntensity: 0.6,
  rimDir: new THREE.Vector3(-2.8, 2.6, -4.8),
  rimColor: new THREE.Color(0x7fe3ff),
  rimIntensity: 1.3,
  skyColor: new THREE.Color(0x2a3a4a),
  groundColor: new THREE.Color(0x1a120e),
  ambientIntensity: 0.55,
} as const

export function raymarchLights(): MitochondrionLights {
  return {
    keyDir: STUDIO.keyDir.clone(),
    keyColor: STUDIO.keyColor.clone().multiplyScalar(STUDIO.keyIntensity),
    fillDir: STUDIO.fillDir.clone(),
    fillColor: STUDIO.fillColor.clone().multiplyScalar(STUDIO.fillIntensity),
    rimDir: STUDIO.rimDir.clone(),
    rimColor: STUDIO.rimColor.clone().multiplyScalar(STUDIO.rimIntensity),
    skyColor: STUDIO.skyColor.clone().multiplyScalar(STUDIO.ambientIntensity),
    groundColor: STUDIO.groundColor.clone().multiplyScalar(STUDIO.ambientIntensity),
  }
}

export interface StudioRig {
  group: THREE.Group
  key: THREE.DirectionalLight
  /** Base direction of the key light (unit), jittered over a small disk while accumulating. */
  keyDirection: THREE.Vector3
}

/**
 * The same rig as three.js lights. three's Lambert divides by π where the raymarcher
 * doesn't, so intensities are multiplied by π to match.
 */
export function createStudioRig(): StudioRig {
  const group = new THREE.Group()
  const key = new THREE.DirectionalLight(STUDIO.keyColor, STUDIO.keyIntensity * Math.PI)
  const fill = new THREE.DirectionalLight(STUDIO.fillColor, STUDIO.fillIntensity * Math.PI)
  const rim = new THREE.DirectionalLight(STUDIO.rimColor, STUDIO.rimIntensity * Math.PI)
  fill.position.copy(STUDIO.fillDir)
  rim.position.copy(STUDIO.rimDir)
  const hemi = new THREE.HemisphereLight(STUDIO.skyColor, STUDIO.groundColor, STUDIO.ambientIntensity * Math.PI)
  group.add(key, key.target, fill, rim, hemi)
  return { group, key, keyDirection: STUDIO.keyDir.clone().normalize() }
}

/**
 * Reflection environment matching the raymarcher's analytic studio: a long warm key
 * strip, a vertical cyan rim strip and a dim top panel on a dark gradient.
 */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const envScene = new THREE.Scene()
  envScene.background = new THREE.Color(0x05080c)
  const panel = (color: THREE.Color, intensity: number, width: number, height: number, direction: THREE.Vector3, up: THREE.Vector3): void => {
    const material = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(intensity), side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
    const position = direction.clone().normalize().multiplyScalar(10)
    mesh.position.copy(position)
    mesh.up.copy(up)
    mesh.lookAt(0, 0, 0)
    envScene.add(mesh)
  }
  panel(new THREE.Color(1.0, 0.88, 0.74), 2.4, 22, 3.2, new THREE.Vector3(0.55, 0.75, 0.38), new THREE.Vector3(1, 0, 0))
  panel(new THREE.Color(0.45, 0.88, 1.0), 1.6, 2.4, 18, new THREE.Vector3(-0.72, 0.3, -0.62), new THREE.Vector3(0, 1, 0))
  panel(new THREE.Color(0.8, 0.85, 0.9), 0.25, 18, 18, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(30, 16, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.11, 0.15, 0.21).multiplyScalar(0.6), side: THREE.BackSide }),
  )
  envScene.add(sky)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromScene(envScene, 0.04)
  pmrem.dispose()
  envScene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.isMesh) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
  })
  return target
}
