import * as THREE from 'three'
import gsap from 'gsap'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Scene, SceneContext } from '../../core/Scene'
import { disposeObject3D } from '../../core/dispose'
import { COMPARTMENT_COLORS } from '../../config/palette'
import { ORGANELLE_MODEL_DIAMETER_M } from '../../config/science.config'
import { content } from '../../i18n/content'
import { bendPoint } from './mitochondrionGeometry'
import { createMitochondrionSdf, MITO, type CompartmentFocus, type MitochondrionSdf } from './mitochondrionSdf'

/** Studio backdrop: deep vertical gradient plus a soft cool glow behind the subject. */
function createBackdropTexture(): THREE.Texture {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const vertical = ctx.createLinearGradient(0, 0, 0, size)
    vertical.addColorStop(0, '#16212d')
    vertical.addColorStop(0.55, '#0c121a')
    vertical.addColorStop(1, '#05070a')
    ctx.fillStyle = vertical
    ctx.fillRect(0, 0, size, size)

    const glow = ctx.createRadialGradient(size * 0.42, size * 0.4, 0, size * 0.42, size * 0.4, size * 0.6)
    glow.addColorStop(0, 'rgba(70, 120, 150, 0.30)')
    glow.addColorStop(0.45, 'rgba(40, 70, 95, 0.12)')
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const DEFAULT_CUT = 0.85
const INTERIOR_LABELS_MIN_CUT = 0.45
// Label anchors assume the cut planes near their default depth.
const LABEL_PLANE = THREE.MathUtils.lerp(MITO.outerRadius + MITO.stepOuter + 0.15, 0, DEFAULT_CUT)

type StructureKey = keyof typeof content.scenes.scene1.labels

// Numbered outside-in (a code that doesn't rely on colour), with the leader line
// going up or down so pills stay clear of the cut.
const CALLOUTS: Record<StructureKey, { order: number; direction: 'up' | 'down' }> = {
  outerMembrane: { order: 1, direction: 'up' },
  intermembraneSpace: { order: 2, direction: 'up' },
  innerMembrane: { order: 3, direction: 'down' },
  matrix: { order: 4, direction: 'down' },
}

const COMPARTMENT_SWATCH: Record<StructureKey, string> = {
  outerMembrane: COMPARTMENT_COLORS.outerMembrane.surface,
  intermembraneSpace: COMPARTMENT_COLORS.intermembraneSpace.fluid,
  innerMembrane: COMPARTMENT_COLORS.innerMembrane.section,
  matrix: COMPARTMENT_COLORS.matrix.section,
}

const NO_FOCUS: CompartmentFocus = { outerMembrane: 0, intermembraneSpace: 0, innerMembrane: 0, matrix: 0 }
const FOCUS_FOR: Record<StructureKey, CompartmentFocus> = {
  outerMembrane: { ...NO_FOCUS, outerMembrane: 1 },
  intermembraneSpace: { ...NO_FOCUS, intermembraneSpace: 1 },
  innerMembrane: { ...NO_FOCUS, innerMembrane: 1 },
  matrix: { ...NO_FOCUS, matrix: 1 },
}

function anchor(x: number, y: number, z: number): THREE.Vector3 {
  return bendPoint(new THREE.Vector3(x, y, z), MITO.bendRadius)
}

export class Scene1Exterior implements Scene {
  readonly id = 'scene1-exterior'
  readonly threeScene = new THREE.Scene()
  // Longer lens (30°) than a phone-like 45°: less perspective ballooning of the near end.
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)

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
  private focusTween: gsap.core.Tween | null = null
  private readonly focusState = { amount: 0 }
  private unsubscribeQuality: (() => void) | null = null
  private dirty = true

  constructor() {
    this.threeScene.background = this.backdropTexture
    this.camera.position.set(1.4, 2.77, 6.05)
  }

  async enter(context: SceneContext): Promise<void> {
    this.context = context
    this.dirty = true

    const { clientWidth, clientHeight } = context.container
    this.camera.aspect = clientWidth / Math.max(1, clientHeight)
    this.camera.updateProjectionMatrix()

    this.sdf = createMitochondrionSdf({
      keyDir: new THREE.Vector3(4, 5.5, 3.5),
      keyColor: new THREE.Color(0xffe3bd).multiplyScalar(2.4),
      fillDir: new THREE.Vector3(-4.5, 1.5, -1.5),
      fillColor: new THREE.Color(0x4f86c6).multiplyScalar(0.6),
      rimDir: new THREE.Vector3(-2.8, 2.6, -4.8),
      rimColor: new THREE.Color(0x7fe3ff).multiplyScalar(1.3),
      skyColor: new THREE.Color(0x2a3a4a).multiplyScalar(0.55),
      groundColor: new THREE.Color(0x1a120e).multiplyScalar(0.55),
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
    this.controls.minDistance = 3.4
    this.controls.maxDistance = 15
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

  setFrame(frame: number, accumulating: boolean): void {
    this.sdf?.setFrame(frame, accumulating)
  }

  /** Keeps the scale bar a true ruler at the organelle's depth. */
  afterRender(): void {
    if (!this.context || !this.controls) return
    const distance = this.camera.position.distanceTo(this.controls.target)
    const viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
    const pxPerUnit = this.context.container.clientHeight / viewHeight
    const metersPerUnit = ORGANELLE_MODEL_DIAMETER_M / (2 * MITO.outerRadius)
    this.context.scaleBar.setPixelsPerMeter(pxPerUnit / metersPerUnit)
  }

  exit(): void {
    this.cutTween?.kill()
    this.cutTween = null
    this.focusTween?.kill()
    this.focusTween = null

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
    if (prefersReducedMotion()) {
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

  /** Lift one compartment and mute the rest while its label is hovered or focused. */
  private focusOn(focus: CompartmentFocus | null): void {
    if (!this.sdf) return
    if (focus) this.sdf.setFocus(focus, this.focusState.amount)
    this.focusTween?.kill()
    const target = focus ? 1 : 0
    const apply = (): void => {
      this.sdf?.setFocus(focus ?? NO_FOCUS, this.focusState.amount)
      this.dirty = true
    }
    if (prefersReducedMotion()) {
      this.focusState.amount = target
      apply()
      return
    }
    this.focusTween = gsap.to(this.focusState, { amount: target, duration: 0.3, ease: 'power2.out', onUpdate: apply })
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
      const { order, direction } = CALLOUTS[key]

      // Callout: a numbered pill offset from the structure, a leader line, and a dot
      // on the structure itself, so the pill never covers what it names.
      const wrapper = document.createElement('div')
      wrapper.className = `callout callout--${direction}`

      const button = document.createElement('button')
      button.type = 'button'
      button.className = `scene1-label scene1-label--${key}`
      const badge = document.createElement('span')
      badge.className = 'callout__badge'
      badge.textContent = String(order)
      badge.style.setProperty('--swatch', COMPARTMENT_SWATCH[key])
      badge.setAttribute('aria-hidden', 'true')
      const text = document.createElement('span')
      text.textContent = content.scenes.scene1.labels[key]
      button.append(badge, text)
      button.addEventListener('click', () => {
        context.tooltipLayer.show(content.scenes.scene1.labels[key], content.scenes.scene1.tooltips[key])
      })
      button.addEventListener('pointerenter', () => this.focusOn(FOCUS_FOR[key]))
      button.addEventListener('focus', () => this.focusOn(FOCUS_FOR[key]))
      button.addEventListener('pointerleave', () => this.focusOn(null))
      button.addEventListener('blur', () => this.focusOn(null))

      const line = document.createElement('span')
      line.className = 'callout__line'
      const dot = document.createElement('span')
      dot.className = 'callout__dot'
      if (direction === 'up') wrapper.append(button, line, dot)
      else wrapper.append(dot, line, button)

      const label = new CSS2DObject(wrapper)
      label.center.set(0.5, direction === 'up' ? 1 : 0)
      label.position.copy(anchors[key])
      this.group.add(label)
      this.labelElements.push(wrapper)
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
