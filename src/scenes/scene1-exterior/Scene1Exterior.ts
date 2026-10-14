import * as THREE from 'three'
import gsap from 'gsap'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Scene, SceneContext } from '../../core/Scene'
import { disposeObject3D } from '../../core/dispose'
import { content } from '../../i18n/content'
import { bendPoint } from './mitochondrionGeometry'
import { createMitochondrionSdf, MITO, type MitochondrionSdf } from './mitochondrionSdf'

function createBackdropTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 512)
    gradient.addColorStop(0, '#1b2735')
    gradient.addColorStop(0.55, '#0f1621')
    gradient.addColorStop(1, '#070a0e')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 2, 512)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const DEFAULT_CUT = 0.85
const INTERIOR_LABELS_MIN_CUT = 0.45
// Label anchors assume the cut planes near their default depth.
const LABEL_PLANE = THREE.MathUtils.lerp(MITO.outerRadius + MITO.stepOuter + 0.15, 0, DEFAULT_CUT)

type StructureKey = keyof typeof content.scenes.scene1.labels

function anchor(x: number, y: number, z: number): THREE.Vector3 {
  return bendPoint(new THREE.Vector3(x, y, z), MITO.bendRadius)
}

export class Scene1Exterior implements Scene {
  readonly id = 'scene1-exterior'
  readonly threeScene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)

  private readonly group = new THREE.Group()
  private readonly backdropTexture = createBackdropTexture()
  private sdf: MitochondrionSdf | null = null
  private controls: OrbitControls | null = null
  private context: SceneContext | null = null
  private cutawayPanel: HTMLElement | null = null
  private slider: HTMLInputElement | null = null
  private readonly labelElements: HTMLElement[] = []
  private readonly interiorLabels: CSS2DObject[] = []
  private cutTween: gsap.core.Tween | null = null
  private unsubscribeQuality: (() => void) | null = null
  private dirty = true

  constructor() {
    this.threeScene.background = this.backdropTexture
    this.camera.position.set(0.9, 1.75, 3.9)
  }

  async enter(context: SceneContext): Promise<void> {
    this.context = context
    this.dirty = true

    const { clientWidth, clientHeight } = context.container
    this.camera.aspect = clientWidth / Math.max(1, clientHeight)
    this.camera.updateProjectionMatrix()

    this.sdf = createMitochondrionSdf({
      keyDir: new THREE.Vector3(4, 5.5, 3.5),
      keyColor: new THREE.Color(0xffe3bd).multiplyScalar(2.3),
      fillDir: new THREE.Vector3(-4.5, 1.5, -1.5),
      fillColor: new THREE.Color(0x6fa8c9).multiplyScalar(0.55),
      ambient: new THREE.Color(0x2a3a4a).multiplyScalar(0.9),
      rimColor: new THREE.Color(0x7fe3ff).multiplyScalar(1.1),
    })
    this.sdf.setQuality(context.quality.current)
    this.unsubscribeQuality = context.quality.onChange((level) => {
      this.sdf?.setQuality(level)
      this.dirty = true
    })
    this.group.add(this.sdf.mesh)
    this.threeScene.add(this.group)

    this.buildLabels(context)
    this.buildCutawayControl(context)
    this.setCut(0)

    this.controls = new OrbitControls(this.camera, context.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 2.2
    this.controls.maxDistance = 10
    this.controls.target.set(0, -0.1, 0)
    this.controls.addEventListener('change', this.markDirty)
    this.controls.update()

    context.scaleBar.setTier('organelle', 1)
    context.sceneCaption.textContent = `${content.scenes.scene1.title} — ${content.scenes.scene1.keyMessage}`

    this.openCutaway()
  }

  update(deltaSeconds: number): void {
    this.controls?.update(deltaSeconds)
  }

  needsRender(): boolean {
    const wasDirty = this.dirty
    this.dirty = false
    return wasDirty
  }

  exit(): void {
    this.cutTween?.kill()
    this.cutTween = null

    this.unsubscribeQuality?.()
    this.unsubscribeQuality = null

    this.controls?.removeEventListener('change', this.markDirty)
    this.controls?.dispose()
    this.controls = null

    for (const element of this.labelElements) element.remove()
    this.labelElements.length = 0
    this.interiorLabels.length = 0

    this.cutawayPanel?.remove()
    this.cutawayPanel = null
    this.slider = null

    this.context?.tooltipLayer.clear()
    this.context = null

    disposeObject3D(this.group)
    this.group.clear()
    this.sdf = null
  }

  private readonly markDirty = (): void => {
    this.dirty = true
  }

  private setCut(amount: number): void {
    this.sdf?.setCut(amount)
    if (this.slider) {
      const percent = Math.round(amount * 100)
      this.slider.value = String(percent)
      this.slider.style.setProperty('--_fill', `${percent}%`)
    }
    for (const label of this.interiorLabels) label.visible = amount >= INTERIOR_LABELS_MIN_CUT
    this.dirty = true
  }

  /** First impression: the organelle opens by itself so the cristae are seen right away. */
  private openCutaway(): void {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      this.setCut(DEFAULT_CUT)
      return
    }
    const state = { amount: 0 }
    this.cutTween = gsap.to(state, {
      amount: DEFAULT_CUT,
      duration: 2.4,
      delay: 0.7,
      ease: 'power2.inOut',
      onUpdate: () => this.setCut(state.amount),
    })
  }

  private buildLabels(context: SceneContext): void {
    const { halfLength, outerRadius, outerThickness, innerRadius, innerThickness, stepMatrix } = MITO
    const imsRadius = (outerRadius - outerThickness + innerRadius) / 2
    const imRadius = innerRadius - innerThickness / 2

    const anchors: Record<StructureKey, THREE.Vector3> = {
      outerMembrane: anchor(-halfLength * 0.6, outerRadius * 0.93, -outerRadius * 0.36),
      intermembraneSpace: anchor(halfLength * 0.45, Math.sqrt(imsRadius ** 2 - LABEL_PLANE ** 2), LABEL_PLANE + 0.01),
      innerMembrane: anchor(-halfLength * 0.6, LABEL_PLANE, Math.sqrt(imRadius ** 2 - LABEL_PLANE ** 2)),
      matrix: anchor(halfLength * 0.55, LABEL_PLANE - stepMatrix, innerRadius * 0.45),
    }

    for (const key of Object.keys(anchors) as StructureKey[]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `scene1-label scene1-label--${key}`
      button.textContent = content.scenes.scene1.labels[key]
      button.addEventListener('click', () => {
        context.tooltipLayer.show(content.scenes.scene1.labels[key], content.scenes.scene1.tooltips[key])
      })

      const label = new CSS2DObject(button)
      label.position.copy(anchors[key])
      this.group.add(label)
      this.labelElements.push(button)
      if (key !== 'outerMembrane') this.interiorLabels.push(label)
    }

    const infoButton = document.createElement('button')
    infoButton.type = 'button'
    infoButton.className = 'scene1-label scene1-label--info'
    infoButton.textContent = 'ℹ Réseau mitochondrial'
    infoButton.addEventListener('click', () => {
      context.tooltipLayer.show('Le saviez-vous ?', content.scenes.scene1.tooltips.network)
    })
    const infoLabel = new CSS2DObject(infoButton)
    infoLabel.position.copy(anchor(-(halfLength + outerRadius) + 0.1, -outerRadius - 0.28, 0))
    this.group.add(infoLabel)
    this.labelElements.push(infoButton)
  }

  private buildCutawayControl(context: SceneContext): void {
    const panel = document.createElement('div')
    panel.className = 'cutaway-control'

    const label = document.createElement('label')
    label.htmlFor = 'cutaway-slider'
    label.textContent = content.scenes.scene1.cutawaySliderLabel

    const slider = document.createElement('input')
    slider.id = 'cutaway-slider'
    slider.type = 'range'
    slider.min = '0'
    slider.max = '100'
    slider.addEventListener('input', () => {
      this.cutTween?.kill()
      this.cutTween = null
      this.setCut(Number(slider.value) / 100)
    })

    panel.append(label, slider)
    context.container.append(panel)
    this.cutawayPanel = panel
    this.slider = slider
  }
}
