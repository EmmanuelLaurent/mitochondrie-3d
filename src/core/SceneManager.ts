import type * as THREE from 'three'
import type { Scene, SceneContext } from './Scene'

/**
 * State machine owning exactly one active Scene at a time, driving its
 * enter/update/exit lifecycle and rendering it every frame.
 */
export class SceneManager {
  private current: Scene | null = null
  private readonly context: SceneContext

  constructor(deps: SceneContext) {
    this.context = deps
  }

  get activeSceneId(): string | null {
    return this.current?.id ?? null
  }

  get activeCamera(): THREE.Camera | null {
    return this.current?.camera ?? null
  }

  async goTo(scene: Scene): Promise<void> {
    this.current?.exit()
    this.current = scene
    await scene.enter(this.context)
  }

  update(deltaSeconds: number): void {
    this.current?.update(deltaSeconds)
  }

  render(): void {
    if (!this.current) return
    this.context.renderer.render(this.current.threeScene, this.current.camera)
    this.context.labelRenderer.render(this.current.threeScene, this.current.camera)
  }
}
