import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export type ProceduralBuilder = () => THREE.Object3D

/**
 * Loads a model, preferring a `.glb` when given one and falling back to the
 * procedural builder otherwise (missing file, network error, bad path).
 * This is the only seam a future PDB-exported .glb needs to plug into —
 * scenes never load GLTFLoader directly. See CLAUDE.md Architecture.
 */
export class AssetLoader {
  private readonly gltfLoader = new GLTFLoader()

  async load(proceduralBuilder: ProceduralBuilder, glbUrl?: string): Promise<THREE.Object3D> {
    if (!glbUrl) return proceduralBuilder()

    try {
      const gltf = await this.gltfLoader.loadAsync(glbUrl)
      return gltf.scene
    } catch (error) {
      console.warn(`AssetLoader: échec du chargement de "${glbUrl}", repli sur le modèle procédural.`, error)
      return proceduralBuilder()
    }
  }
}
