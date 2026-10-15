import type * as THREE from 'three'
import type { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { QualitySettings } from './QualitySettings'
import type { AssetLoader } from './AssetLoader'
import type { JourneyState } from './JourneyState'
import type { TooltipLayer } from '../ui/tooltip/TooltipLayer'
import type { ScaleBar } from '../ui/scaleBar/ScaleBar'
import type { Legend } from '../ui/legend/Legend'

export interface SceneContext {
  container: HTMLElement
  renderer: THREE.WebGLRenderer
  labelRenderer: CSS2DRenderer
  quality: QualitySettings
  assetLoader: AssetLoader
  journey: JourneyState
  tooltipLayer: TooltipLayer
  scaleBar: ScaleBar
  sceneCaption: HTMLElement
  legend: Legend
  /** Where a narrated scene mounts its step player (bottom centre). */
  playerRoot: HTMLElement
  visit: SceneVisit
}

/** How the scene is being visited, set on every SceneManager.goTo(). */
export interface SceneVisit {
  /** Guided tour: play the narrated timeline straight through, then call onComplete. */
  guided: boolean
  onComplete: () => void
  /** Opens the next chapter (« Chapitre suivant »); null when it is not built yet. */
  goNext: (() => void) | null
}

/**
 * One chapter of the pedagogical journey (not to be confused with THREE.Scene,
 * the 3D scene graph each implementation owns internally).
 */
export interface Scene {
  readonly id: string
  readonly threeScene: THREE.Scene
  readonly camera: THREE.Camera
  /** MSAA samples wanted on the scene render target (mesh scenes); 0/omitted for raymarched ones. */
  readonly multisampling?: number

  enter(context: SceneContext): Promise<void> | void
  update(deltaSeconds: number): void
  exit(): void

  /**
   * Optional render-on-demand: return false when nothing changed since the last
   * frame. The SceneManager then refines the still image progressively and finally
   * leaves the GPU idle. Omit to render every frame.
   */
  needsRender?(): boolean

  /** Called before each rendered frame: sample index (0 while moving) and whether the view is still. */
  setFrame?(frame: number, accumulating: boolean): void

  /** Called after each rendered frame (e.g. to lay out screen-space callouts). */
  afterRender?(): void

  /**
   * Narrated scenes: total length of the timeline and a deterministic seek, used by
   * the guided tour and the frame-by-frame video export.
   */
  readonly narration?: NarrationControl
}

export interface NarrationControl {
  readonly duration: number
  seek(seconds: number): void
}
