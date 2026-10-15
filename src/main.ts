import * as THREE from 'three'
import gsap from 'gsap'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { AssetLoader } from './core/AssetLoader'
import { useClock } from './core/clock'
import { JourneyState } from './core/JourneyState'
import { PerformanceGovernor } from './core/PerformanceGovernor'
import { PostProcessing } from './core/PostProcessing'
import { QualitySettings } from './core/QualitySettings'
import { SceneManager } from './core/SceneManager'
import type { Scene } from './core/Scene'
import { content } from './i18n/content'
import { Scene1Exterior } from './scenes/scene1-exterior/Scene1Exterior'
import { ChapterBar, CHAPTER_ORDER, type ChapterId } from './ui/chapters/ChapterBar'
import { Counters } from './ui/counters/Counters'
import { Legend } from './ui/legend/Legend'
import { ModeSwitcher, type AppMode } from './ui/modes/ModeSwitcher'
import { ScaleBar } from './ui/scaleBar/ScaleBar'
import { TooltipLayer } from './ui/tooltip/TooltipLayer'
import './styles/main.css'

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`main: missing required DOM root ${selector} in index.html`)
  return element
}

const sceneRoot = required<HTMLElement>('#scene-root')
const modeSwitcherRoot = required<HTMLElement>('#mode-switcher')
const chapterBarRoot = required<HTMLElement>('#chapter-bar')
const scaleBarRoot = required<HTMLElement>('#scale-bar')
const countersRoot = required<HTMLElement>('#counters-panel')
const legendRoot = required<HTMLElement>('#legend-panel')
const tooltipRoot = required<HTMLElement>('#tooltip-layer')
const sceneCaption = required<HTMLElement>('#scene-caption')
const playerRoot = required<HTMLElement>('#player-root')
const fullscreenToggle = required<HTMLButtonElement>('#fullscreen-toggle')
const qualityToggle = required<HTMLButtonElement>('#quality-toggle')

document.title = content.app.title

// No MSAA on the canvas: everything renders into the post-processing targets (MSAA is
// set there per scene); the final pass to screen is a full-screen quad.
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
sceneRoot.append(renderer.domElement)

const post = new PostProcessing(renderer)

const labelRenderer = new CSS2DRenderer()
labelRenderer.domElement.style.position = 'absolute'
labelRenderer.domElement.style.top = '0'
labelRenderer.domElement.style.left = '0'
labelRenderer.domElement.style.pointerEvents = 'none'
sceneRoot.append(labelRenderer.domElement)

function resize(): void {
  const width = sceneRoot.clientWidth
  const height = sceneRoot.clientHeight
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap))
  renderer.setSize(width, height)
  post.setSize(width, height, renderer.getPixelRatio())
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
const legend = new Legend(legendRoot)

const sceneManager = new SceneManager(
  {
    container: sceneRoot,
    renderer,
    labelRenderer,
    quality,
    assetLoader,
    journey,
    tooltipLayer,
    scaleBar,
    sceneCaption,
    legend,
    playerRoot,
  },
  post,
)

const counters = new Counters(countersRoot, journey, tooltipLayer)

// Dev-only handle for scripted visual checks (camera placement before screenshots,
// interactive snapshots). Stripped from production builds.
if (import.meta.env.DEV) {
  Object.assign(window, { __app: { sceneManager, quality, journey, goToChapter: (id: ChapterId) => goToChapter(id), goToLab: () => modeSwitcher.select('lab') } })
}

// ------------------------------------------------------------------ chapters

// Chapter 1 ships with the page; the others are loaded on demand (smaller first download).
const SCENES: Partial<Record<ChapterId, () => Promise<Scene>>> = {
  scene1: async () => new Scene1Exterior(),
  scene2: async () => new (await import('./scenes/scene2-shuttle/Scene2Shuttle')).Scene2Shuttle(),
  scene3: async () => new (await import('./scenes/scene3-betaox/Scene3BetaOx')).Scene3BetaOx(),
  scene4: async () => new (await import('./scenes/scene4-chain/Scene4Chain')).Scene4Chain(),
  scene5: async () => new (await import('./scenes/scene5-synthase/Scene5Synthase')).Scene5Synthase(),
  scene6: async () => new (await import('./scenes/scene6-bilan/Scene6Bilan')).Scene6Bilan(),
}

let mode: AppMode = 'freeExploration'
let chapter: ChapterId = 'scene1'

function nextChapter(id: ChapterId): ChapterId | null {
  const next = CHAPTER_ORDER[CHAPTER_ORDER.indexOf(id) + 1]
  return next && SCENES[next] ? next : null
}

/** Frame-by-frame video export (scripts/export-video.mjs): `?export` in the URL. */
const exportMode = new URLSearchParams(window.location.search).has('export')

/** Bumped on every navigation: a scene still loading when another is chosen is dropped. */
let navigation = 0

async function goToChapter(id: ChapterId): Promise<void> {
  const factory = SCENES[id]
  if (!factory) return
  const ticket = ++navigation
  chapter = id
  chapterBar.setCurrent(id)
  tooltipLayer.clear()
  const next = nextChapter(id)
  const scene = await factory()
  if (ticket !== navigation) return
  return sceneManager.goTo(scene, {
    guided: mode === 'guidedTour' && !exportMode,
    onComplete: () => {
      if (mode === 'guidedTour' && next && !exportMode) void goToChapter(next)
    },
    // The last chapter's « next » starts the journey again.
    goNext: next ? () => void goToChapter(next) : () => void goToChapter(CHAPTER_ORDER[0]),
  })
}

/** The Labo: the proton circuit of chapter 5 at the crista tier, driven by the inhibitors and ADP. */
async function goToLab(): Promise<void> {
  const ticket = ++navigation
  chapterBar.setCurrent(null)
  tooltipLayer.clear()
  const { Scene5Synthase } = await import('./scenes/scene5-synthase/Scene5Synthase')
  if (ticket !== navigation) return
  return sceneManager.goTo(new Scene5Synthase('lab'), { guided: false, onComplete: () => {}, goNext: null })
}

const chapterBar = new ChapterBar(chapterBarRoot, new Set(Object.keys(SCENES) as ChapterId[]), (id) => {
  chapter = id
  // Leaving the Labo by the chapter bar: back to free exploration of that chapter.
  if (mode === 'lab') modeSwitcher.select('freeExploration')
  else void goToChapter(id)
})

const modeSwitcher = new ModeSwitcher(modeSwitcherRoot, (selected) => {
  mode = selected
  if (selected === 'lab') void goToLab()
  else void goToChapter(chapter)
})

// ------------------------------------------------------------ app controls

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

function renderQualityToggle(): void {
  qualityToggle.textContent = quality.current === 'high' ? content.app.qualityHigh : content.app.qualityLow
  qualityToggle.title = content.app.qualityHint
}
qualityToggle.addEventListener('click', () => {
  governor.disable() // an explicit choice wins over automatic downgrading
  quality.set(quality.current === 'high' ? 'low' : 'high')
})
renderQualityToggle()

window.addEventListener('resize', resize)

quality.onChange(resize)
quality.onChange(renderQualityToggle)

modeSwitcher.select('freeExploration')
resize()

const governor = new PerformanceGovernor(quality)
const timer = new THREE.Timer()
timer.connect(document)
function animate(timestamp: number): void {
  timer.update(timestamp)
  const delta = timer.getDelta()
  sceneManager.update(delta)
  governor.record(delta, sceneManager.render())
  scaleBar.tick()
  counters.tick()
  requestAnimationFrame(animate)
}

if (exportMode) {
  // Deterministic: no animation loop, no GSAP clock; the exporter sets the time of
  // every frame, renders a few accumulated samples, then screenshots the page.
  document.documentElement.classList.add('export-mode')
  gsap.globalTimeline.pause()
  governor.disable()
  let videoTime = 0
  let chapterStart = 0
  useClock(() => videoTime)
  Object.assign(window, {
    __export: {
      chapters: CHAPTER_ORDER.filter((id) => SCENES[id]),
      async start(id: ChapterId): Promise<number> {
        mode = 'guidedTour'
        chapterStart = videoTime + 1
        await goToChapter(id)
        return sceneManager.activeScene?.narration?.duration ?? 4
      },
      frame(seconds: number, samples: number): void {
        videoTime = chapterStart + seconds
        sceneManager.activeScene?.narration?.seek(seconds)
        sceneManager.update(1 / 30)
        sceneManager.invalidate()
        for (let i = 0; i < Math.max(1, samples); i++) {
          sceneManager.update(0)
          sceneManager.render()
        }
        scaleBar.tick()
        counters.tick()
      },
    },
  })
} else {
  requestAnimationFrame(animate)
}
