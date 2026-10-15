import * as THREE from 'three'
import { layoutCristae, MITO } from '../../scene1-exterior/mitochondrionSdf'

/**
 * A CPU copy of the raymarched organelle's inner-solid distance field (the same formulas
 * as mitochondrionShader.ts: bend, wobble, capsule, lamellar cristae), so a tier change
 * can land exactly on a feature of the organelle — e.g. the wall of a crista on the
 * matrix cut face — and orient the molecular set to match it.
 */

const BEND_R = MITO.bendRadius
const T_IM = MITO.innerThickness
const LUMEN_HALF = MITO.lumenHalfWidth
const NECK_HALF = MITO.neckHalfWidth

const cristae = layoutCristae()

const smin = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
const smax = (a: number, b: number, k: number): number => -smin(-a, -b, k)
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Organelle coordinates (bent) → coordinates along the straightened capsule. */
export function unbend(p: THREE.Vector3): THREE.Vector3 {
  const cx = p.x
  const cy = p.y + BEND_R
  return new THREE.Vector3(Math.atan2(cx, cy) * BEND_R, Math.hypot(cx, cy) - BEND_R, p.z)
}

/** The inverse of unbend. */
export function bend(q: THREE.Vector3): THREE.Vector3 {
  const angle = q.x / BEND_R
  const radius = q.y + BEND_R
  return new THREE.Vector3(radius * Math.sin(angle), radius * Math.cos(angle) - BEND_R, q.z)
}

function wobble(q: THREE.Vector3): number {
  return 0.011 * Math.sin(3.1 * q.x + 1.7 * Math.sin(2.3 * q.z)) * Math.cos(2.7 * q.y + q.x) + 0.004 * Math.sin(5.3 * q.x + 2.0 * q.z + 1.3)
}

function sdCapsuleX(q: THREE.Vector3, halfLength: number, radius: number): number {
  const dx = q.x - THREE.MathUtils.clamp(q.x, -halfLength, halfLength)
  return Math.hypot(dx, q.y, q.z) - radius
}

function cristaeLumen(q: THREE.Vector3, dIn: number): number {
  let d = 1e9
  const neck = 1 - smoothstep(-(T_IM + 0.07), -(T_IM + 0.012), dIn)
  for (let i = 0; i < cristae.a.length; i++) {
    const a = cristae.a[i]
    const b = cristae.b[i]
    let px = q.x - a.x
    let py = b.x * q.y + b.y * q.z
    const pz = -b.y * q.y + b.x * q.z
    py -= a.y
    const ct = Math.cos(b.z)
    const st = Math.sin(b.z)
    const rx = ct * px + st * py
    const ry = -st * px + ct * py
    px = rx - (0.022 * Math.sin(5.0 * pz + b.w) + 0.014 * Math.sin(6.5 * ry + 1.7 * b.w))
    py = ry
    const rc = 0.8 * Math.min(a.z, a.w)
    const ex = Math.abs(py) - a.z + rc
    const ey = Math.abs(pz) - a.w + rc
    const outline = Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0) - rc
    let hw = LUMEN_HALF * (1 + 0.18 * Math.sin(4.0 * pz + 2.0 * b.w))
    hw = THREE.MathUtils.lerp(NECK_HALF, hw, neck)
    const wx = outline
    const wy = Math.abs(px) - hw
    d = Math.min(d, Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)))
  }
  return d
}

/** Distance to the outer face of the inner membrane (negative inside the matrix + membrane). */
export function innerSolid(p: THREE.Vector3): number {
  const q = unbend(p)
  const w = wobble(q)
  const dIn = sdCapsuleX(q, MITO.halfLength, MITO.innerRadius) + w
  if (dIn > 0.2) return dIn
  return smax(dIn, -cristaeLumen(q, dIn), 0.012)
}

export interface CristaWall {
  /** On the inner membrane's mid-surface, on the matrix cut face (organelle units). */
  point: THREE.Vector3
  /** Unit normal of the membrane there, pointing into the crista lumen (= the IMS). */
  normal: THREE.Vector3
}

export interface CristaTip {
  /** Where the crista's lumen ends, on the matrix cut face (organelle units). */
  point: THREE.Vector3
  /** Unit direction up the crista (from its tip back toward the boundary membrane), in the cut plane. */
  axis: THREE.Vector3
}

/** The matrix cut face, and the inner membrane's (the cristae stand proud of the matrix face). */
const FACE_Z = -MITO.stepMatrix - 0.004
export const INNER_MEMBRANE_FACE_Z = -0.004

/** The lumen run (x interval) on a cut face at height y (straightened) nearest to x, or null. */
function lumenRunNear(x: number, y: number, span: number, faceZ = FACE_Z): { from: number; to: number } | null {
  const step = 0.0015
  let best: { from: number; to: number } | null = null
  let runStart: number | null = null
  for (let sx = x - span; sx <= x + span; sx += step) {
    const inside = innerSolid(bend(new THREE.Vector3(sx, y, faceZ))) > 0
    if (inside && runStart === null) runStart = sx
    if (!inside && runStart !== null) {
      const run = { from: runStart, to: sx }
      const center = (run.from + run.to) / 2
      if (run.to - run.from > 0.006 && (!best || Math.abs(center - x) < Math.abs((best.from + best.to) / 2 - x))) best = run
      runStart = null
    }
  }
  return best
}

/**
 * Finds the tip of a crista on the matrix cut face (cut fully open): starting from the
 * lumen nearest `x` at height `y` near the boundary membrane, follows the lumen toward the
 * organelle's axis until it ends. Among the candidates around `x`, keeps the closest one
 * that ends inside the matrix (a finger, not a crista crossing the whole section).
 */
export function findCristaTip(x: number, y: number, faceZ = FACE_Z): CristaTip {
  const toward = -Math.sign(y)
  const candidates: { tip: CristaTip; distance: number }[] = []
  for (let k = 0; k <= 40; k++) {
    const startX = x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.03
    let run = lumenRunNear(startX, y, 0.02, faceZ)
    if (!run) continue
    let cx = (run.from + run.to) / 2
    let cy = y
    const centers: THREE.Vector3[] = [new THREE.Vector3(cx, cy, faceZ)]
    for (let i = 0; i < 400; i++) {
      const ny = cy + toward * 0.0015
      run = lumenRunNear(cx, ny, 0.012, faceZ)
      if (!run) break
      cx = (run.from + run.to) / 2
      cy = ny
      centers.push(new THREE.Vector3(cx, cy, faceZ))
    }
    // A finger: long enough, and ending inside the matrix, well before the opposite side.
    if (Math.abs(cy) > 0.4 || Math.abs(cy - y) < 0.15) continue
    const end = centers[centers.length - 1]
    const back = centers[Math.max(0, centers.length - 1 - 40)]
    const point = bend(end)
    const axis = bend(back).sub(point).setZ(0).normalize()
    candidates.push({ tip: { point, axis }, distance: Math.abs(startX - x) })
    if (candidates.length >= 3) break
  }
  if (!candidates.length) throw new Error('findCristaTip: no crista tip near this point')
  candidates.sort((a, b) => a.distance - b.distance)
  return candidates[0].tip
}

/**
 * Finds the wall of a crista crossing the matrix cut face (cut fully open), on a line
 * at height `y` (straightened coordinates), the lumen closest to `x`. The returned
 * point lies on the inner membrane's mid-surface on the matrix side of that lumen.
 */
export function findCristaWall(x: number, y: number): CristaWall {
  const faceZ = -MITO.stepMatrix - 0.004
  const step = 0.0015
  // Lumens along the line: runs where the inner solid's distance is positive.
  let best: { from: number; to: number } | null = null
  let runStart: number | null = null
  for (let sx = x - 0.5; sx <= x + 0.5; sx += step) {
    const inside = innerSolid(bend(new THREE.Vector3(sx, y, faceZ))) > 0
    if (inside && runStart === null) runStart = sx
    if (!inside && runStart !== null) {
      const run = { from: runStart, to: sx }
      const center = (run.from + run.to) / 2
      if (run.to - run.from > 0.008 && (!best || Math.abs(center - x) < Math.abs((best.from + best.to) / 2 - x))) best = run
      runStart = null
    }
  }
  if (!best) throw new Error('findCristaWall: no crista lumen on this line')
  // Walk from the lumen's lower-x edge into the solid until the membrane's mid-surface.
  let sx = best.from
  while (innerSolid(bend(new THREE.Vector3(sx, y, faceZ))) > -T_IM / 2 && sx > best.from - 0.1) sx -= step / 10
  const point = bend(new THREE.Vector3(sx, y, faceZ))
  const e = 1e-4
  const normal = new THREE.Vector3(
    innerSolid(point.clone().add(new THREE.Vector3(e, 0, 0))) - innerSolid(point.clone().add(new THREE.Vector3(-e, 0, 0))),
    innerSolid(point.clone().add(new THREE.Vector3(0, e, 0))) - innerSolid(point.clone().add(new THREE.Vector3(0, -e, 0))),
    0,
  ).normalize()
  return { point, normal }
}
