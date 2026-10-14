import * as THREE from 'three'

function disposeMaterial(material: THREE.Material): void {
  // Dispose any texture maps the material might hold, without assuming which ones exist.
  for (const key of Object.keys(material)) {
    const value = (material as unknown as Record<string, unknown>)[key]
    if (value instanceof THREE.Texture) value.dispose()
  }
  material.dispose()
}

/**
 * Recursively frees GPU resources (geometries, materials, textures) under `root`.
 * Every Scene MUST call this on its own root group during exit() — see CLAUDE.md Conventions.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()

    const material = (object as THREE.Mesh).material
    if (Array.isArray(material)) material.forEach(disposeMaterial)
    else if (material) disposeMaterial(material)
  })
}
