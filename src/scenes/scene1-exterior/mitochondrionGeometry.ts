import * as THREE from 'three'

/**
 * Forward bend used by both the raymarched organelle (whose shader applies the
 * exact inverse) and anything that must sit on its surface (labels, bounding
 * box). Curves the X axis into a gentle arc of radius `bendRadius` in the XY
 * plane; Y acts as the radial offset from that arc.
 */
export function bendPoint(point: THREE.Vector3, bendRadius: number): THREE.Vector3 {
  const theta = point.x / bendRadius
  const effectiveRadius = bendRadius + point.y
  return new THREE.Vector3(
    effectiveRadius * Math.sin(theta),
    effectiveRadius * Math.cos(theta) - bendRadius,
    point.z,
  )
}

/** World-space bounds of a bent capsule (straight half-length `halfLength`, radius `radius`), padded by `margin`. */
export function bentCapsuleBounds(halfLength: number, radius: number, bendRadius: number, margin: number): THREE.Box3 {
  // heightSegments matter: with a single segment the straight part only has
  // vertices at its two ends, so the apex of the bent arch (mid-length) would be
  // missed and the box would slice the top of the organelle off.
  const geometry = new THREE.CapsuleGeometry(radius, halfLength * 2, 12, 32, 48)
  geometry.rotateZ(Math.PI / 2)
  const position = geometry.attributes.position
  const vertex = new THREE.Vector3()
  const box = new THREE.Box3()
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i)
    box.expandByPoint(bendPoint(vertex, bendRadius))
  }
  geometry.dispose()
  return box.expandByScalar(margin)
}

/** Small deterministic PRNG so the procedural layout is identical on every load (and in frame-by-frame video export). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
