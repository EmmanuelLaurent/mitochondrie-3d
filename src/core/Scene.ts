import type * as THREE from 'three'
import type { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { QualitySettings } from './QualitySettings'
import type { AssetLoader } from './AssetLoader'
import type { JourneyState } from './JourneyState'
import type { TooltipLayer } from '../ui/tooltip/TooltipLayer'
import type { ScaleBar } from '../ui/scaleBar/ScaleBar'

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
}

/**
 * One chapter of the pedagogical journey (not to be confused with THREE.Scene,
 * the 3D scene graph each implementation owns internally).
 */
export interface Scene {
  readonly id: string
  readonly threeScene: THREE.Scene
  readonly camera: THREE.Camera

  enter(context: SceneContext): Promise<void> | void
  update(deltaSeconds: number): void
  exit(): void
}
