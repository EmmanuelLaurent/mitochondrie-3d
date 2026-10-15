import * as THREE from 'three'
import type { QualityLevel } from '../../core/QualitySettings'
import { COMPARTMENT_COLORS, SIGNAL_COLOR } from '../../config/palette'
import { bentCapsuleBounds, mulberry32 } from './mitochondrionGeometry'
import { fragmentShader, vertexShader } from './mitochondrionShader'

/**
 * Stylised dimensions (scene units, not to biological scale). Thin membranes and a
 * thin intermembrane space around a large matrix — the earlier thick concentric
 * shells read as a target / fried egg rather than an organelle.
 */
export const MITO = {
  halfLength: 1.25, // straight mid-section; total length ≈ 2 * (1.25 + 0.62) ≈ 3x the diameter
  outerRadius: 0.62,
  outerThickness: 0.035,
  innerRadius: 0.53, // outer face of the inner membrane
  innerThickness: 0.03,
  bendRadius: 5.5,
  lumenHalfWidth: 0.016,
  neckHalfWidth: 0.0065, // crista junction: the lumen narrows where it crosses the boundary membrane
  stepOuter: 0.05, // stepped cutaway: outer membrane cut back less…
  stepMatrix: 0.06, // …matrix recessed more, so cristae stand proud of the matrix face
  imsDensity: 18, // Beer-Lambert density of the intermembrane-space tint, per scene unit
} as const

const MAX_STEPS = 320
const MAX_SHADOW_STEPS = 160
const MAX_SAMPLES = 4

interface MarchParams {
  steps: number
  shadowSteps: number
  samples: number
  aoTaps: number
  rimShadow: boolean
  thickness: boolean
}

// While the view moves: one cheap sample per pixel so interaction stays fluid.
// Once it is still: one richer jittered sample per frame (area light, rim shadow,
// translucency), averaged over many frames by the post-processing chain.
const QUALITY: Record<QualityLevel, { moving: MarchParams; still: MarchParams }> = {
  high: {
    moving: { steps: 240, shadowSteps: 40, samples: 1, aoTaps: 5, rimShadow: false, thickness: false },
    still: { steps: 320, shadowSteps: 120, samples: 1, aoTaps: 8, rimShadow: true, thickness: true },
  },
  low: {
    moving: { steps: 150, shadowSteps: 0, samples: 1, aoTaps: 4, rimShadow: false, thickness: false },
    still: { steps: 200, shadowSteps: 48, samples: 1, aoTaps: 6, rimShadow: false, thickness: true },
  },
}

/**
 * Lamellar cristae: varied depth, width and attachment angle all around the
 * circumference (so U-profiles show on both cut faces), a few short stubs, and
 * smaller tilted ones in the rounded poles. Seeded PRNG: identical on every load,
 * which the frame-by-frame video export relies on.
 */
function layoutCristae(): { a: THREE.Vector4[]; b: THREE.Vector4[] } {
  const rand = mulberry32(20261014)
  const lerp = THREE.MathUtils.lerp
  const { halfLength, innerRadius } = MITO
  const a: THREE.Vector4[] = []
  const b: THREE.Vector4[] = []

  const push = (x: number, phi: number, depthFrac: number, widthFrac: number, tilt: number, localRadius: number): void => {
    const depth = depthFrac * 2 * localRadius
    const yWall = localRadius + 0.12 // beyond the inner membrane, so the lumen stays connected to the IMS
    const yTip = localRadius - depth
    a.push(new THREE.Vector4(x, (yWall + yTip) / 2, (yWall - yTip) / 2, widthFrac * localRadius))
    b.push(new THREE.Vector4(Math.cos(phi), Math.sin(phi), tilt, rand() * Math.PI * 2))
  }

  const spacing = 0.19
  const span = halfLength * 0.98
  const count = Math.floor((2 * span) / spacing) + 1
  const start = -((count - 1) * spacing) / 2
  let deepUsed = false
  for (let i = 0; i < count; i++) {
    const x = start + i * spacing + (rand() - 0.5) * 0.05
    let phi = (i % 2 === 0 ? 0 : Math.PI) + (rand() - 0.5) * 1.0
    if (rand() < 0.2) phi = (rand() < 0.5 ? 0.5 : -0.5) * Math.PI + (rand() - 0.5) * 0.4
    let depthFrac = lerp(0.45, 0.75, rand())
    const roll = rand()
    if (roll < 0.15) depthFrac = lerp(0.25, 0.35, rand())
    else if (roll > 0.9 && !deepUsed) {
      depthFrac = lerp(0.85, 0.9, rand())
      deepUsed = true
    }
    push(x, phi, depthFrac, lerp(0.55, 0.95, rand()), (rand() - 0.5) * 0.3, innerRadius)
  }

  for (const sign of [-1, 1]) {
    for (const offset of [0.14, 0.32]) {
      const localRadius = Math.sqrt(Math.max(0.01, innerRadius ** 2 - offset ** 2))
      push(sign * (halfLength + offset), rand() * Math.PI * 2, lerp(0.4, 0.6, rand()), lerp(0.6, 0.85, rand()), sign * lerp(0.3, 0.45, rand()), localRadius)
    }
  }
  return { a, b }
}

export interface MitochondrionLights {
  keyDir: THREE.Vector3
  keyColor: THREE.Color
  fillDir: THREE.Vector3
  fillColor: THREE.Color
  rimDir: THREE.Vector3
  rimColor: THREE.Color
  skyColor: THREE.Color
  groundColor: THREE.Color
}

/** Focus weights per compartment, 0..1. */
export interface CompartmentFocus {
  outerMembrane: number
  intermembraneSpace: number
  innerMembrane: number
  matrix: number
}

export interface MitochondrionSdf {
  mesh: THREE.Mesh
  /** 0 = closed, 1 = quarter fully cut away down to the long axis. */
  setCut(amount: number): void
  setQuality(level: QualityLevel): void
  /** Called every rendered frame: frame index for stochastic sampling, and whether the view is still. */
  setFrame(frame: number, accumulating: boolean): void
  setFocus(focus: CompartmentFocus, amount: number): void
  /**
   * Dissolve: 0..1 opacity. Below 1 the organelle is drawn as an overlay on top of
   * whatever replaces it (no depth test), a clean cross-fade between two representations.
   */
  setOpacity(opacity: number): void
}

export function createMitochondrionSdf(lights: MitochondrionLights): MitochondrionSdf {
  const bounds = bentCapsuleBounds(MITO.halfLength, MITO.outerRadius + 0.03, MITO.bendRadius, 0.06)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
  geometry.translate(center.x, center.y, center.z)

  const cristae = layoutCristae()
  const cutStart = MITO.outerRadius + MITO.stepOuter + 0.15
  let quality: QualityLevel = 'high'
  let accumulating = false

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    // Coverage-based anti-aliasing: edge pixels blend with what's behind.
    transparent: true,
    depthWrite: true,
    defines: {
      CRISTA_COUNT: cristae.a.length,
      MAX_STEPS,
      MAX_SHADOW_STEPS,
      MAX_SAMPLES,
      HALF_LEN: MITO.halfLength.toFixed(4),
      R_OUT: MITO.outerRadius.toFixed(4),
      T_OM: MITO.outerThickness.toFixed(4),
      R_IN: MITO.innerRadius.toFixed(4),
      T_IM: MITO.innerThickness.toFixed(4),
      BEND_R: MITO.bendRadius.toFixed(4),
      LUMEN_HALF: MITO.lumenHalfWidth.toFixed(4),
      NECK_HALF: MITO.neckHalfWidth.toFixed(4),
      STEP_OM: MITO.stepOuter.toFixed(4),
      STEP_MAT: MITO.stepMatrix.toFixed(4),
      SIGMA_IMS: MITO.imsDensity.toFixed(4),
    },
    uniforms: {
      uProjInv: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uViewProj: { value: new THREE.Matrix4() },
      uModel: { value: new THREE.Matrix4() },
      uModelInv: { value: new THREE.Matrix4() },
      uViewport: { value: new THREE.Vector4(0, 0, 1, 1) },
      uPixelAngle: { value: 0.001 },
      uFrame: { value: 0 },
      uAccumulate: { value: 0 },
      uZc: { value: cutStart },
      uYc: { value: cutStart },
      uSteps: { value: QUALITY.high.moving.steps },
      uShadowSteps: { value: QUALITY.high.moving.shadowSteps },
      uSamples: { value: QUALITY.high.moving.samples },
      uAoTaps: { value: QUALITY.high.moving.aoTaps },
      uRimShadow: { value: 0 },
      uThickness: { value: 0 },
      uBoxMin: { value: bounds.min.clone() },
      uBoxMax: { value: bounds.max.clone() },
      uCristaA: { value: cristae.a },
      uCristaB: { value: cristae.b },
      uKeyDir: { value: lights.keyDir.clone().normalize() },
      uKeyColor: { value: lights.keyColor },
      uFillDir: { value: lights.fillDir.clone().normalize() },
      uFillColor: { value: lights.fillColor },
      uRimDir: { value: lights.rimDir.clone().normalize() },
      uRimColor: { value: lights.rimColor },
      uSkyColor: { value: lights.skyColor },
      uGroundColor: { value: lights.groundColor },
      uOuterColor: { value: new THREE.Color(COMPARTMENT_COLORS.outerMembrane.surface) },
      uOuterCapColor: { value: new THREE.Color(COMPARTMENT_COLORS.outerMembrane.section) },
      uInnerColor: { value: new THREE.Color(COMPARTMENT_COLORS.innerMembrane.surface) },
      uInnerCapColor: { value: new THREE.Color(COMPARTMENT_COLORS.innerMembrane.section) },
      uMatrixColor: { value: new THREE.Color(COMPARTMENT_COLORS.matrix.surface) },
      uMatrixCapColor: { value: new THREE.Color(COMPARTMENT_COLORS.matrix.section) },
      uImsColor: { value: new THREE.Color(COMPARTMENT_COLORS.intermembraneSpace.fluid) },
      uOuterSss: { value: new THREE.Color(1.0, 0.42, 0.25) },
      uInnerSss: { value: new THREE.Color(1.0, 0.25, 0.32) },
      uFocus: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFocusAmt: { value: 0 },
      uSignalColor: { value: new THREE.Color(SIGNAL_COLOR) },
      uOpacity: { value: 1 },
    },
  })

  const applyMarchParams = (): void => {
    const params = accumulating ? QUALITY[quality].still : QUALITY[quality].moving
    material.uniforms.uSteps.value = params.steps
    material.uniforms.uShadowSteps.value = params.shadowSteps
    material.uniforms.uSamples.value = params.samples
    material.uniforms.uAoTaps.value = params.aoTaps
    material.uniforms.uRimShadow.value = params.rimShadow ? 1 : 0
    material.uniforms.uThickness.value = params.thickness ? 1 : 0
    material.uniforms.uAccumulate.value = accumulating && quality === 'high' ? 1 : 0
  }

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'mitochondrion'
  mesh.frustumCulled = false
  const viewport = new THREE.Vector4()
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    const u = material.uniforms
    u.uProjInv.value.copy(camera.projectionMatrixInverse)
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    u.uModel.value.copy(mesh.matrixWorld)
    u.uModelInv.value.copy(mesh.matrixWorld).invert()
    renderer.getCurrentViewport(viewport)
    u.uViewport.value.copy(viewport)
    // World-space size of one pixel per unit of ray distance (filters procedurals, sets epsilons).
    u.uPixelAngle.value = 2 / (camera.projectionMatrix.elements[5] * Math.max(1, viewport.w))
  }

  return {
    mesh,
    setCut(amount) {
      const plane = THREE.MathUtils.lerp(cutStart, 0, THREE.MathUtils.clamp(amount, 0, 1))
      material.uniforms.uZc.value = plane
      material.uniforms.uYc.value = plane
    },
    setQuality(level) {
      quality = level
      applyMarchParams()
    },
    setFrame(frame, isAccumulating) {
      material.uniforms.uFrame.value = frame
      if (isAccumulating !== accumulating) {
        accumulating = isAccumulating
        applyMarchParams()
      }
    },
    setFocus(focus, amount) {
      material.uniforms.uFocus.value.set(focus.outerMembrane, focus.intermembraneSpace, focus.innerMembrane, focus.matrix)
      material.uniforms.uFocusAmt.value = amount
    },
    setOpacity(opacity) {
      material.uniforms.uOpacity.value = opacity
      material.depthTest = opacity >= 1
      mesh.visible = opacity > 0
    },

  }
}
