import * as THREE from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { AssetLoader } from './core/AssetLoader'
import { JourneyState } from './core/JourneyState'
import { QualitySettings } from './core/QualitySettings'
import { SceneManager } from './core/SceneManager'
import type { Scene } from './core/Scene'
import { content } from './i18n/content'
import { Scene1Exterior } from './scenes/scene1-exterior/Scene1Exterior'
import { Counters } from './ui/counters/Counters'
import { Legend } from './ui/legend/Legend'
import { ModeSwitcher, type AppMode } from './ui/modes/ModeSwitcher'
import { ScaleBar } from './ui/scaleBar/ScaleBar'
import { TooltipLayer } from './ui/tooltip/TooltipLayer'
import './styles/main.css'

const sceneRoot = document.querySelector<HTMLElement>('#scene-root')
const modeSwitcherRoot = document.querySelector<HTMLElement>('#mode-switcher')
const scaleBarRoot = document.querySelector<HTMLElement>('#scale-bar')
const countersRoot = document.querySelector<HTMLElement>('#counters-panel')
const legendRoot = document.querySelector<HTMLElement>('#legend-panel')
const tooltipRoot = document.querySelector<HTMLElement>('#tooltip-layer')
const sceneCaption = document.querySelector<HTMLElement>('#scene-caption')
const fullscreenToggle = document.querySelector<HTMLButtonElement>('#fullscreen-toggle')

if (
  !sceneRoot ||
  !modeSwitcherRoot ||
  !scaleBarRoot ||
  !countersRoot ||
  !legendRoot ||
  !tooltipRoot ||
  !sceneCaption ||
  !fullscreenToggle
) {
  throw new Error('main: missing required DOM root(s) in index.html')
}

document.title = content.app.title

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
sceneRoot.append(renderer.domElement)

const labelRenderer = new CSS2DRenderer()
labelRenderer.domElement.style.position = 'absolute'
labelRenderer.domElement.style.top = '0'
labelRenderer.domElement.style.left = '0'
labelRenderer.domElement.style.pointerEvents = 'none'
sceneRoot.append(labelRenderer.domElement)

function resize(): void {
  const width = sceneRoot!.clientWidth
  const height = sceneRoot!.clientHeight
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap))
  renderer.setSize(width, height)
  labelRenderer.setSize(width, height)

  const camera = sceneManager.activeCamera
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / Math.max(1, height)
    camera.updateProjectionMatrix()
  }
  sceneManager.invalidate()
}

const quality = new QualitySettings('high')
const journey = new JourneyState()
const assetLoader = new AssetLoader()
const tooltipLayer = new TooltipLayer(tooltipRoot)
const scaleBar = new ScaleBar(scaleBarRoot)

const sceneManager = new SceneManager({
  container: sceneRoot,
  renderer,
  labelRenderer,
  quality,
  assetLoader,
  journey,
  tooltipLayer,
  scaleBar,
  sceneCaption,
})

new Counters(countersRoot, journey)
new Legend(legendRoot)

// Dev-only handle for scripted visual checks (camera placement before screenshots).
// Stripped from production builds.
if (import.meta.env.DEV) {
  Object.assign(window, { __app: { sceneManager, quality, journey } })
}

const scenesByMode: Partial<Record<AppMode, () => Scene>> = {
  freeExploration: () => new Scene1Exterior(),
}

const modeSwitcher = new ModeSwitcher(modeSwitcherRoot, (mode) => {
  const factory = scenesByMode[mode]
  if (!factory) {
    tooltipLayer.show(content.modes[mode].label, content.modes[mode].description + ' — à venir dans une prochaine phase.')
    return
  }
  void sceneManager.goTo(factory())
})

fullscreenToggle.addEventListener('click', () => {
  if (document.fullscreenElement) {
    void document.exitFullscreen()
  } else {
    void document.documentElement.requestFullscreen()
  }
})

document.addEventListener('fullscreenchange', () => {
  const isFullscreen = Boolean(document.fullscreenElement)
  fullscreenToggle.setAttribute('aria-pressed', String(isFullscreen))
  fullscreenToggle.textContent = isFullscreen ? content.app.fullscreenExit : content.app.fullscreenEnter
})
fullscreenToggle.textContent = content.app.fullscreenEnter

window.addEventListener('resize', resize)

quality.onChange(resize)

modeSwitcher.select('freeExploration')
resize()

const timer = new THREE.Timer()
timer.connect(document)
function animate(timestamp: number): void {
  timer.update(timestamp)
  sceneManager.update(timer.getDelta())
  sceneManager.render()
  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)
