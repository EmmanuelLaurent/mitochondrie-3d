import * as THREE from 'three'
import type { QualityLevel } from '../../core/QualitySettings'
import { bentCapsuleBounds, mulberry32 } from './mitochondrionGeometry'

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
  cristaCount: 11,
  cristaSpan: 1.15, // cristae sit in |x| <= span (cylindrical part only)
  lumenHalfWidth: 0.016,
  stepOuter: 0.05, // stepped cutaway: outer membrane cut back less…
  stepMatrix: 0.06, // …matrix recessed more, so cristae stand proud of the matrix face
} as const

const MAX_STEPS = 160
const MAX_SHADOW_STEPS = 32

interface QualityParams {
  steps: number
  shadowSteps: number
}

const QUALITY: Record<QualityLevel, QualityParams> = {
  high: { steps: 160, shadowSteps: 28 },
  low: { steps: 90, shadowSteps: 0 },
}

function layoutCristae(): { a: THREE.Vector4[]; rot: THREE.Vector2[] } {
  const rand = mulberry32(20261014)
  const a: THREE.Vector4[] = []
  const rot: THREE.Vector2[] = []
  const { cristaCount, cristaSpan, innerRadius } = MITO

  for (let i = 0; i < cristaCount; i++) {
    const t = (i + 0.5) / cristaCount
    const x = THREE.MathUtils.lerp(-cristaSpan, cristaSpan, t) + (rand() - 0.5) * 0.07
    let side = i % 2 === 0 ? 1 : -1
    if (rand() > 0.78) side = -side
    const depth = THREE.MathUtils.lerp(0.5, 0.82, rand()) * 2 * innerRadius
    const halfZ = THREE.MathUtils.lerp(0.6, 0.92, rand()) * innerRadius
    const tilt = (rand() - 0.5) * 0.3

    // The lumen slab starts beyond the inner membrane (in the intermembrane space, so
    // it stays connected to it — a crista junction) and ends at a rounded tip in the matrix.
    const yWall = side * (innerRadius + 0.12)
    const yTip = side * (innerRadius - depth)
    a.push(new THREE.Vector4(x, (yWall + yTip) / 2, Math.abs(yWall - yTip) / 2, halfZ))
    rot.push(new THREE.Vector2(Math.cos(tilt), Math.sin(tilt)))
  }
  return { a, rot }
}

const vertexShader = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const fragmentShader = /* glsl */ `
varying vec3 vWorldPos;

uniform float uZc;
uniform float uYc;
uniform int uSteps;
uniform int uShadowSteps;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;

uniform vec4 uCristaA[CRISTA_COUNT];
uniform vec2 uCristaRot[CRISTA_COUNT];

uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uFillDir;
uniform vec3 uFillColor;
uniform vec3 uAmbient;
uniform vec3 uRimColor;

uniform vec3 uOuterColor;
uniform vec3 uOuterCapColor;
uniform vec3 uInnerColor;
uniform vec3 uInnerCapColor;
uniform vec3 uMatrixColor;
uniform vec3 uMatrixCapColor;

vec3 unbend(vec3 p) {
  vec2 c = vec2(p.x, p.y + BEND_R);
  return vec3(atan(c.x, c.y) * BEND_R, length(c) - BEND_R, p.z);
}

float sdCapsuleX(vec3 q, float halfLen, float r) {
  vec3 d = q;
  d.x -= clamp(q.x, -halfLen, halfLen);
  return length(d) - r;
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// Polynomial form on purpose: the mix()-based smin cancels catastrophically in
// float32 when one operand is a large sentinel (no crista nearby -> 1e9),
// collapsing the distance to ~0 and producing NaN normals at the organelle ends.
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

// Gentle organic undulation shared by both membranes so they stay parallel.
float wobble(vec3 q) {
  return 0.014 * sin(3.1 * q.x + 1.7 * sin(2.3 * q.z)) * cos(2.7 * q.y + q.x);
}

float cristaeLumen(vec3 q) {
  float d = 1e9;
  for (int i = 0; i < CRISTA_COUNT; i++) {
    vec4 c = uCristaA[i];
    // Thin slabs: anything this far away in x can't be the nearest, and skipping
    // it only makes the distance more conservative.
    if (abs(q.x - c.x) > 0.14) continue;
    vec3 p = q - vec3(c.x, c.y, 0.0);
    vec2 r = uCristaRot[i];
    p.xy = mat2(r.x, -r.y, r.y, r.x) * p.xy;
    d = min(d, sdRoundBox(p, vec3(LUMEN_HALF, c.z, c.w), LUMEN_HALF * 0.95));
  }
  return d;
}

// Inner compartment (inner membrane + matrix) with the cristae lumens carved out:
// the inner membrane is the boundary of this region, so it folds into each lumen.
float innerSolid(vec3 q, float w) {
  float dIn = sdCapsuleX(q, HALF_LEN, R_IN) + w;
  if (dIn > 0.2) return dIn;
  return smax(dIn, -cristaeLumen(q), 0.02);
}

// x: distance, y: material id
// 1 outer membrane, 2 outer membrane section, 3 inner membrane, 4 inner membrane section,
// 5 matrix, 6 matrix section
vec2 map(vec3 p) {
  vec3 q = unbend(p);
  float w = wobble(q);
  float dOut = sdCapsuleX(q, HALF_LEN, R_OUT) + w;
  if (dOut > 0.25) return vec2(dOut * 0.9, 0.0);

  float dOM = abs(dOut + 0.5 * T_OM) - 0.5 * T_OM;
  float dS = innerSolid(q, w);
  float dIM = abs(dS + 0.5 * T_IM) - 0.5 * T_IM;
  float dMat = dS + T_IM;

  // Stepped quarter cutaway: remove {y > yc, z > zc}, each layer offset.
  float remOM = max((uZc + STEP_OM) - q.z, (uYc + STEP_OM) - q.y);
  float remIM = max(uZc - q.z, uYc - q.y);
  float remMat = max((uZc - STEP_MAT) - q.z, (uYc - STEP_MAT) - q.y);

  float kOM = max(dOM, -remOM);
  float kIM = max(dIM, -remIM);
  float kMat = max(dMat, -remMat);

  vec2 res = vec2(kOM, -remOM > dOM ? 2.0 : 1.0);
  if (kIM < res.x) res = vec2(kIM, -remIM > dIM ? 4.0 : 3.0);
  if (kMat < res.x) res = vec2(kMat, -remMat > dMat ? 6.0 : 5.0);
  return res;
}

vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.0009;
  return normalize(
    k.xyy * map(p + k.xyy * e).x +
    k.yyx * map(p + k.yyx * e).x +
    k.yxy * map(p + k.yxy * e).x +
    k.xxx * map(p + k.xxx * e).x
  );
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.008 + 0.075 * float(i) / 4.0;
    occ += (h - map(p + h * n).x) * sca;
    sca *= 0.82;
  }
  return clamp(1.0 - 4.5 * occ, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.012;
  for (int i = 0; i < MAX_SHADOW_STEPS; i++) {
    if (i >= uShadowSteps) break;
    float h = map(ro + rd * t).x;
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.008, 0.12);
    if (res < 0.002 || t > 2.5) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec2 boxIntersect(vec3 ro, vec3 rd) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (uBoxMin - ro) * inv;
  vec3 t1 = (uBoxMax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Phospholipid bilayer seen edge-on: two darker leaflets around a lighter core.
float bilayer(float s) {
  float x = (abs(s) - 0.6) / 0.22;
  return exp(-x * x);
}

vec3 surfaceColor(float id, vec3 p) {
  vec3 q = unbend(p);
  float w = wobble(q);

  if (id < 1.5) return uOuterColor;
  if (id < 2.5) {
    float s = (sdCapsuleX(q, HALF_LEN, R_OUT) + w + 0.5 * T_OM) / (0.5 * T_OM);
    return mix(uOuterCapColor, uOuterCapColor * 0.62, bilayer(s));
  }
  if (id < 3.5) return uInnerColor;
  if (id < 4.5) {
    float s = (innerSolid(q, w) + 0.5 * T_IM) / (0.5 * T_IM);
    return mix(uInnerCapColor, uInnerCapColor * 0.6, bilayer(s));
  }
  if (id < 5.5) return uMatrixColor;

  // Matrix section: sparse darker granules (ribosomes, mtDNA nucleoids) for texture.
  vec3 g = q * 42.0;
  vec3 cell = floor(g);
  vec3 f = fract(g) - (0.25 + 0.5 * hash33(cell));
  float dots = smoothstep(0.2, 0.07, length(f)) * step(0.6, hash13(cell + 17.0));
  return uMatrixCapColor * (1.0 - 0.28 * dots);
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - cameraPosition);
  vec2 tb = boxIntersect(ro, rd);
  if (tb.x > tb.y || tb.y < 0.0) discard;

  float t = max(tb.x, 0.0);
  float id = -1.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= uSteps) break;
    vec2 m = map(ro + rd * t);
    if (m.x < 0.0004 + 0.0006 * t) { id = m.y; break; }
    t += m.x * 0.8;
    if (t > tb.y) break;
  }
  if (id < 0.5) discard;

  vec3 pos = ro + rd * t;
  vec3 n = calcNormal(pos);
  vec3 v = -rd;
  vec3 base = surfaceColor(id, pos);
  float ao = calcAO(pos, n);

  float nk = dot(n, uKeyDir);
  float sh = nk > 0.0 ? softShadow(pos + n * 0.003, uKeyDir) : 0.0;
  float wrap = clamp((nk + 0.4) / 1.4, 0.0, 1.0);
  vec3 lin = uKeyColor * wrap * mix(0.25, 1.0, sh);
  lin += uFillColor * clamp(0.5 + 0.5 * dot(n, uFillDir), 0.0, 1.0) * ao;
  lin += uAmbient * (0.6 + 0.4 * n.y) * ao;

  vec3 col = base * lin;

  vec3 h = normalize(uKeyDir + v);
  float spe = pow(clamp(dot(n, h), 0.0, 1.0), 56.0) * clamp(nk, 0.0, 1.0) * sh;
  float isOuterSkin = id < 1.5 ? 1.0 : 0.0;
  col += uKeyColor * spe * mix(0.25, 0.7, isOuterSkin);

  float fre = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  col += uRimColor * fre * ao * mix(0.15, 0.9, isOuterSkin);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export interface MitochondrionSdf {
  mesh: THREE.Mesh
  /** 0 = closed, 1 = quarter fully cut away down to the long axis. */
  setCut(amount: number): void
  setQuality(level: QualityLevel): void
}

export function createMitochondrionSdf(lights: {
  keyDir: THREE.Vector3
  keyColor: THREE.Color
  fillDir: THREE.Vector3
  fillColor: THREE.Color
  ambient: THREE.Color
  rimColor: THREE.Color
}): MitochondrionSdf {
  const bounds = bentCapsuleBounds(MITO.halfLength, MITO.outerRadius + 0.03, MITO.bendRadius, 0.06)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
  geometry.translate(center.x, center.y, center.z)

  const cristae = layoutCristae()
  const cutStart = MITO.outerRadius + MITO.stepOuter + 0.15

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    defines: {
      CRISTA_COUNT: MITO.cristaCount,
      MAX_STEPS,
      MAX_SHADOW_STEPS,
      HALF_LEN: MITO.halfLength.toFixed(4),
      R_OUT: MITO.outerRadius.toFixed(4),
      T_OM: MITO.outerThickness.toFixed(4),
      R_IN: MITO.innerRadius.toFixed(4),
      T_IM: MITO.innerThickness.toFixed(4),
      BEND_R: MITO.bendRadius.toFixed(4),
      LUMEN_HALF: MITO.lumenHalfWidth.toFixed(4),
      STEP_OM: MITO.stepOuter.toFixed(4),
      STEP_MAT: MITO.stepMatrix.toFixed(4),
    },
    uniforms: {
      uZc: { value: cutStart },
      uYc: { value: cutStart },
      uSteps: { value: QUALITY.high.steps },
      uShadowSteps: { value: QUALITY.high.shadowSteps },
      uBoxMin: { value: bounds.min.clone() },
      uBoxMax: { value: bounds.max.clone() },
      uCristaA: { value: cristae.a },
      uCristaRot: { value: cristae.rot },
      uKeyDir: { value: lights.keyDir.clone().normalize() },
      uKeyColor: { value: lights.keyColor },
      uFillDir: { value: lights.fillDir.clone().normalize() },
      uFillColor: { value: lights.fillColor },
      uAmbient: { value: lights.ambient },
      uRimColor: { value: lights.rimColor },
      uOuterColor: { value: new THREE.Color(0xe98b6d) },
      uOuterCapColor: { value: new THREE.Color(0xf6b49a) },
      uInnerColor: { value: new THREE.Color(0xb8435a) },
      uInnerCapColor: { value: new THREE.Color(0xd8667c) },
      uMatrixColor: { value: new THREE.Color(0xf2c6a6) },
      uMatrixCapColor: { value: new THREE.Color(0xf7d7bf) },
    },
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'mitochondrion'
  mesh.frustumCulled = false

  return {
    mesh,
    setCut(amount) {
      const plane = THREE.MathUtils.lerp(cutStart, 0, THREE.MathUtils.clamp(amount, 0, 1))
      material.uniforms.uZc.value = plane
      material.uniforms.uYc.value = plane
    },
    setQuality(level) {
      material.uniforms.uSteps.value = QUALITY[level].steps
      material.uniforms.uShadowSteps.value = QUALITY[level].shadowSteps
    },
  }
}
