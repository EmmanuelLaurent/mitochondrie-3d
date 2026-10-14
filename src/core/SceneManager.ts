import type * as THREE from 'three'
import type { Scene, SceneContext } from './Scene'
import type { PostProcessing } from './PostProcessing'

/** Samples accumulated once the view is still; after that the GPU idles. */
const MAX_ACCUMULATED_SAMPLES = 48

export type RenderOutcome = 'changed' | 'refined' | 'idle'

/**
 * State machine owning exactly one active Scene at a time, driving its
 * enter/update/exit lifecycle and rendering it through the post-processing chain:
 * a full frame whenever something changes, then progressive refinement while still.
 */
export class SceneManager {
  private current: Scene | null = null
  private readonly context: SceneContext
  private forceRender = true
  private sampleIndex = 0

  constructor(
    deps: SceneContext,
    private readonly post: PostProcessing,
  ) {
    this.context = deps
  }

  /** Forces the next frame to render even if the scene reports nothing changed (e.g. after a resize). */
  invalidate(): void {
    this.forceRender = true
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
    this.forceRender = true
    await scene.enter(this.context)
  }

  update(deltaSeconds: number): void {
    this.current?.update(deltaSeconds)
  }

  render(): RenderOutcome {
    const scene = this.current
    if (!scene) return 'idle'

    const changed = (scene.needsRender?.() ?? true) || this.forceRender
    this.forceRender = false

    let outcome: RenderOutcome
    if (changed) {
      this.sampleIndex = 0
      scene.setFrame?.(0, false)
      this.post.render(scene.threeScene, scene.camera, null)
      outcome = 'changed'
    } else if (this.sampleIndex < MAX_ACCUMULATED_SAMPLES) {
      scene.setFrame?.(this.sampleIndex + 1, true)
      this.post.render(scene.threeScene, scene.camera, this.sampleIndex)
      this.sampleIndex += 1
      outcome = 'refined'
    } else {
      return 'idle'
    }
    this.context.labelRenderer.render(scene.threeScene, scene.camera)
    scene.afterRender?.()
    return outcome
  }
}
