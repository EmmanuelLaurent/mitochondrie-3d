import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../../scene1-exterior/mitochondrionGeometry'

/**
 * Everything at molecular scale is built from beads (coarse-grained spheres), the
 * convention of molecular illustration: lipids, proteins and small molecules share
 * one visual language, so shape and colour carry the identity.
 */
export interface Bead {
  position: THREE.Vector3
  radius: number
  color: THREE.Color
}

const unitSpheres = new Map<number, THREE.BufferGeometry>()

/** Indexed icosphere (shared vertices: ~6× fewer than the non-indexed polyhedron). */
function unitSphere(detail: number): THREE.BufferGeometry {
  let geometry = unitSpheres.get(detail)
  if (!geometry) {
    const polyhedron = new THREE.IcosahedronGeometry(1, detail)
    polyhedron.deleteAttribute('uv')
    geometry = mergeVertices(polyhedron)
    geometry.computeVertexNormals()
    polyhedron.dispose()
    unitSpheres.set(detail, geometry)
  }
  return geometry
}

/** Uniform grid over the beads so occlusion only visits near neighbours. */
class BeadGrid {
  private readonly cells = new Map<string, number[]>()
  constructor(
    private readonly beads: Bead[],
    private readonly size: number,
  ) {
    beads.forEach((bead, index) => {
      const key = this.key(bead.position.x, bead.position.y, bead.position.z)
      const list = this.cells.get(key)
      if (list) list.push(index)
      else this.cells.set(key, [index])
    })
  }

  private key(x: number, y: number, z: number): string {
    return `${Math.floor(x / this.size)},${Math.floor(y / this.size)},${Math.floor(z / this.size)}`
  }

  forNear(point: THREE.Vector3, visit: (index: number) => void): void {
    const cx = Math.floor(point.x / this.size)
    const cy = Math.floor(point.y / this.size)
    const cz = Math.floor(point.z / this.size)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const list = this.cells.get(`${cx + dx},${cy + dy},${cz + dz}`)
          if (list) for (const index of list) visit(index)
        }
  }

  get all(): Bead[] {
    return this.beads
  }
}

/**
 * Analytic sphere occlusion (the classic n·d · r²/d² estimate), per vertex: crevices
 * between beads darken, convex bumps stay lit. Baked once into the vertex colours.
 */
function occlusionAt(point: THREE.Vector3, normal: THREE.Vector3, grid: BeadGrid, self: number): number {
  let occlusion = 0
  const d = new THREE.Vector3()
  const beads = grid.all
  grid.forNear(point, (j) => {
    if (j === self) return
    const other = beads[j]
    d.subVectors(other.position, point)
    const dist2 = d.lengthSq()
    const r2 = other.radius * other.radius
    if (dist2 > 36 * r2) return
    const dist = Math.sqrt(dist2)
    const facing = Math.max(0, normal.dot(d) / dist)
    occlusion += facing * Math.min(1, r2 / dist2)
  })
  return occlusion
}

export interface BeadGeometryOptions {
  /** Icosphere subdivision: 1 for crowds, 2 for close-ups. */
  detail?: number
  /** 0 = no baked occlusion, 1 = full. */
  occlusion?: number
}

/** Merges beads into one indexed geometry with baked colour + occlusion (one draw call). */
export function buildBeadGeometry(beads: Bead[], options: BeadGeometryOptions = {}): THREE.BufferGeometry {
  const sphere = unitSphere(options.detail ?? 1)
  const strength = options.occlusion ?? 0.8
  const unitPos = sphere.getAttribute('position')
  const unitNormal = sphere.getAttribute('normal')
  const unitIndex = sphere.getIndex()!
  const perBead = unitPos.count
  const positions = new Float32Array(beads.length * perBead * 3)
  const normals = new Float32Array(beads.length * perBead * 3)
  const colors = new Float32Array(beads.length * perBead * 3)
  const indices = new Uint32Array(beads.length * unitIndex.count)
  beads.forEach((_, b) => {
    for (let i = 0; i < unitIndex.count; i++) indices[b * unitIndex.count + i] = unitIndex.getX(i) + b * perBead
  })
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const maxRadius = beads.reduce((max, bead) => Math.max(max, bead.radius), 0.1)
  const grid = new BeadGrid(beads, 6 * maxRadius)

  beads.forEach((bead, b) => {
    for (let v = 0; v < perBead; v++) {
      n.fromBufferAttribute(unitNormal, v)
      p.fromBufferAttribute(unitPos, v).multiplyScalar(bead.radius).add(bead.position)
      const o = (b * perBead + v) * 3
      positions[o] = p.x
      positions[o + 1] = p.y
      positions[o + 2] = p.z
      normals[o] = n.x
      normals[o + 1] = n.y
      normals[o + 2] = n.z
      const ao = strength > 0 ? 1 - strength * Math.min(0.75, 0.55 * occlusionAt(p, n, grid, b)) : 1
      colors[o] = bead.color.r * ao
      colors[o + 1] = bead.color.g * ao
      colors[o + 2] = bead.color.b * ao
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

/** A signed distance function in nm (negative inside). */
export type Sdf = (p: THREE.Vector3) => number

export const sdEllipsoid =
  (center: THREE.Vector3, radii: THREE.Vector3): Sdf =>
  (p) => {
    // Cheap bound (Quílez): exact enough for packing beads.
    const k0 = Math.hypot((p.x - center.x) / radii.x, (p.y - center.y) / radii.y, (p.z - center.z) / radii.z)
    const k1 = Math.hypot(
      (p.x - center.x) / (radii.x * radii.x),
      (p.y - center.y) / (radii.y * radii.y),
      (p.z - center.z) / (radii.z * radii.z),
    )
    return k1 === 0 ? -Math.min(radii.x, radii.y, radii.z) : (k0 * (k0 - 1)) / k1
  }

export const sdCapsule =
  (a: THREE.Vector3, b: THREE.Vector3, radius: number): Sdf =>
  (p) => {
    const pa = new THREE.Vector3().subVectors(p, a)
    const ba = new THREE.Vector3().subVectors(b, a)
    const h = THREE.MathUtils.clamp(pa.dot(ba) / ba.dot(ba), 0, 1)
    return pa.sub(ba.multiplyScalar(h)).length() - radius
  }

export function smoothUnion(sdfs: Sdf[], k = 0.6): Sdf {
  return (p) => {
    let d = sdfs[0](p)
    for (let i = 1; i < sdfs.length; i++) {
      const b = sdfs[i](p)
      const h = Math.max(k - Math.abs(d - b), 0) / k
      d = Math.min(d, b) - h * h * k * 0.25
    }
    return d
  }
}

export function subtract(base: Sdf, cut: Sdf): Sdf {
  return (p) => Math.max(base(p), -cut(p))
}

export interface FillOptions {
  bounds: THREE.Box3
  spacing: number
  radius: [number, number]
  color: THREE.Color
  /** Keep only beads within this depth under the surface (hidden interior is skipped). */
  shell?: number
  /** Per-bead brightness variation, for an organic, non-CG look. */
  shade?: number
  seed: number
  /** Optional predicate to drop beads (e.g. the half in front of a cut plane). */
  keep?: (p: THREE.Vector3) => boolean
}

/**
 * Packs beads inside a shape (dart throwing with a minimum spacing): the lumpy,
 * coarse-grained surface of a protein. Deterministic for a given seed.
 */
export function fillShape(sdf: Sdf, options: FillOptions): Bead[] {
  const rand = mulberry32(options.seed)
  const size = options.bounds.getSize(new THREE.Vector3())
  const volume = size.x * size.y * size.z
  const attempts = Math.ceil((volume / options.spacing ** 3) * 14)
  const shell = options.shell ?? Infinity
  const beads: Bead[] = []
  const cell = options.spacing
  const grid = new Map<string, THREE.Vector3[]>()
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`
  const minDist2 = options.spacing * options.spacing

  for (let i = 0; i < attempts; i++) {
    const p = new THREE.Vector3(
      options.bounds.min.x + rand() * size.x,
      options.bounds.min.y + rand() * size.y,
      options.bounds.min.z + rand() * size.z,
    )
    const d = sdf(p)
    if (d > 0 || d < -shell) continue
    if (options.keep && !options.keep(p)) continue
    const cx = Math.floor(p.x / cell)
    const cy = Math.floor(p.y / cell)
    const cz = Math.floor(p.z / cell)
    let tooClose = false
    for (let dx = -1; dx <= 1 && !tooClose; dx++)
      for (let dy = -1; dy <= 1 && !tooClose; dy++)
        for (let dz = -1; dz <= 1 && !tooClose; dz++) {
          const list = grid.get(key(cx + dx, cy + dy, cz + dz))
          if (list) tooClose = list.some((q) => q.distanceToSquared(p) < minDist2)
        }
    if (tooClose) continue
    const k = key(cx, cy, cz)
    const list = grid.get(k)
    if (list) list.push(p)
    else grid.set(k, [p])
    const shade = 1 + (rand() - 0.5) * (options.shade ?? 0.12)
    beads.push({
      position: p,
      radius: THREE.MathUtils.lerp(options.radius[0], options.radius[1], rand()),
      color: options.color.clone().multiplyScalar(shade),
    })
  }
  return beads
}

/** Beads along a straight α-helix-like rod (one bead per ~turn), for transmembrane segments. */
export function helixBeads(from: THREE.Vector3, to: THREE.Vector3, radius: number, color: THREE.Color, seed: number): Bead[] {
  const rand = mulberry32(seed)
  const axis = new THREE.Vector3().subVectors(to, from)
  const length = axis.length()
  axis.normalize()
  const side = new THREE.Vector3(1, 0, 0).cross(axis)
  if (side.lengthSq() < 1e-6) side.set(0, 0, 1).cross(axis)
  side.normalize()
  const other = new THREE.Vector3().crossVectors(axis, side)
  const count = Math.max(2, Math.round(length / 0.32))
  const beads: Bead[] = []
  for (let i = 0; i <= count; i++) {
    const t = i / count
    const angle = i * 1.745 // 100° per residue, as in an α-helix
    const offset = side.clone().multiplyScalar(Math.cos(angle) * 0.28).addScaledVector(other, Math.sin(angle) * 0.28)
    beads.push({
      position: from.clone().addScaledVector(axis, t * length).add(offset),
      radius: radius * (0.92 + rand() * 0.16),
      color: color.clone().multiplyScalar(0.95 + rand() * 0.1),
    })
  }
  return beads
}
