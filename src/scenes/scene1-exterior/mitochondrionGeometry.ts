import * as THREE from 'three'

/**
 * Deforms a sphere into a stylised bean/kidney shape: elongated along X,
 * with a concave indent carved into one face (the bean's "waist").
 * Deliberately non-photorealistic — see CLAUDE.md Conventions (direction artistique).
 */
export function createBeanGeometry(radius: number, segments = 48): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, segments, segments)
  const position = geometry.attributes.position
  const vertex = new THREE.Vector3()
  const normalized = new THREE.Vector3()

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i)
    normalized.copy(vertex).normalize()

    vertex.x *= 1.5

    // Localised notch (kidney-bean "waist"): strongest at the mid-length, fading
    // toward the two rounded ends and toward the poles, so it reads as a notch
    // rather than a groove running the whole length.
    const lengthFalloff = Math.max(0, 1 - Math.abs(normalized.x) * 1.1)
    const indentProfile = Math.max(0, normalized.z) * Math.max(0, 1 - Math.abs(normalized.y) * 1.3) * lengthFalloff
    const indent = indentProfile * indentProfile * radius * 0.45
    vertex.addScaledVector(normalized, -indent)

    position.setXYZ(i, vertex.x, vertex.y, vertex.z)
  }

  geometry.computeVertexNormals()
  return geometry
}

/** Adds a gentle rippled wobble to suggest folded cristae at organelle-view scale. */
export function addCristaeWobble(geometry: THREE.BufferGeometry, amplitude: number): THREE.BufferGeometry {
  const position = geometry.attributes.position
  const vertex = new THREE.Vector3()
  const normalized = new THREE.Vector3()

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i)
    normalized.copy(vertex).normalize()

    const theta = Math.atan2(normalized.z, normalized.x)
    const phi = Math.acos(THREE.MathUtils.clamp(normalized.y, -1, 1))
    const wobble = Math.sin(theta * 10) * Math.sin(phi * 14) * amplitude

    vertex.addScaledVector(normalized, wobble)
    position.setXYZ(i, vertex.x, vertex.y, vertex.z)
  }

  geometry.computeVertexNormals()
  return geometry
}

/** Approximate maximum |z| extent of a bean built with createBeanGeometry (for clip-plane ranges). */
export function beanZExtent(radius: number): number {
  return radius * 1.15
}
