import * as THREE from 'three'
import gsap from 'gsap'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { NarrationControl, Scene, SceneContext } from '../../core/Scene'
import { disposeObject3D } from '../../core/dispose'
import { COMPARTMENT_COLORS } from '../../config/palette'
import { ORGANELLE_MODEL_DIAMETER_M } from '../../config/science.config'
import { content } from '../../i18n/content'
import { raymarchLights } from '../shared/studioLights'
import { ramp } from '../shared/molecular/choreography'
import { StepPlayer, type PlayerStep } from '../../ui/player/StepPlayer'
import { Quiz } from '../../ui/quiz/Quiz'
import { createChapterEndCard } from '../../ui/chapterEnd/ChapterEndCard'
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

const text = content.scenes.scene1

/** Narrated steps (seconds): the cut opens in the first one, then each compartment is lifted in turn. */
const STEP_STARTS = { outside: 0, outerMembrane: 8, intermembraneSpace: 15, innerMembrane: 22, matrix: 29, message: 36 } as const
const DURATION = 43
const CUT_OPENING: [number, number] = [1.5, 4.5]
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
  private focusTween: gsap.core.Tween | null = null
  private readonly focusState = { amount: 0 }
  private hoverFocus: CompartmentFocus | null = null
  private timeline: gsap.core.Timeline | null = null
  private player: StepPlayer | null = null
  private quiz: Quiz | null = null
  private endCard: HTMLElement | null = null
  /** The student moved the cut slider: it wins over the timeline until the next step. */
  private cutOverride: number | null = null
  private lastTime = -1
  private unsubscribeQuality: (() => void) | null = null
  private dirty = true

  constructor() {
    this.threeScene.background = this.backdropTexture
    this.camera.position.set(1.4, 2.77, 6.05)
  }

  readonly narration: NarrationControl = {
    duration: DURATION,
    seek: (seconds: number): void => {
      this.player?.pause()
      this.timeline?.seek(seconds, false)
    },
  }

  async enter(context: SceneContext): Promise<void> {
    this.context = context
    this.dirty = true

    const { clientWidth, clientHeight } = context.container
    this.camera.aspect = clientWidth / Math.max(1, clientHeight)
    this.camera.updateProjectionMatrix()

    this.sdf = createMitochondrionSdf(raymarchLights())
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

    context.scaleBar.setTier('organelle')
    context.sceneCaption.textContent = ''
    context.journey.reset()

    this.endCard = createChapterEndCard({
      title: text.title,
      keyMessage: text.keyMessage,
      onQuiz: () => {
        this.player?.pause()
        this.quiz?.close()
        this.quiz = new Quiz(context.container, `${content.quiz.open} — ${text.title}`, text.questions, text.needsTeacherReview)
      },
      nextTitle: content.chapters.items.scene2,
      onNext: context.visit.goNext,
    })
    this.endCard.hidden = true
    context.container.append(this.endCard)

    this.timeline = gsap.timeline({ paused: true })
    this.timeline.to({}, { duration: DURATION })
    for (const [id, start] of Object.entries(STEP_STARTS)) this.timeline.addLabel(id, start)
    const steps: PlayerStep[] = text.steps.map((step) => ({
      label: step.id,
      title: step.title,
      narration: step.narration,
      infos: step.infos.map((key) => {
        const tooltip = key as keyof typeof text.tooltips
        return { label: text.tooltipTitles[tooltip], open: () => context.tooltipLayer.show(text.tooltipTitles[tooltip], text.tooltips[tooltip]) }
      }),
    }))
    this.applyTime(0)
    this.player = new StepPlayer(context.playerRoot, {
      timeline: this.timeline,
      steps,
      reducedMotion: prefersReducedMotion(),
      autoplay: context.visit.guided,
      onUpdate: () => {},
      onComplete: () => context.visit.onComplete(),
      onStepChange: () => {
        this.cutOverride = null
        context.tooltipLayer.clear()
      },
    })
  }

  update(deltaSeconds: number): void {
    this.controls?.update(deltaSeconds)
    const t = this.timeline?.time() ?? 0
    if (t !== this.lastTime) this.applyTime(t)
  }

  /** Everything the timeline drives, as a function of its time (seek-safe). */
  private applyTime(t: number): void {
    this.lastTime = t
    this.setCut(this.cutOverride ?? DEFAULT_CUT * ramp(t, CUT_OPENING[0], CUT_OPENING[1]))
    this.refreshFocus()
    if (this.endCard) this.endCard.hidden = t < STEP_STARTS.message + 1
  }

  /** Compartment lifted by the narration at time t, unless a label is hovered. */
  private timelineFocus(t: number): { focus: CompartmentFocus; amount: number } {
    const windows: [StructureKey, number, number][] = [
      ['outerMembrane', STEP_STARTS.outerMembrane, STEP_STARTS.intermembraneSpace],
      ['intermembraneSpace', STEP_STARTS.intermembraneSpace, STEP_STARTS.innerMembrane],
      ['innerMembrane', STEP_STARTS.innerMembrane, STEP_STARTS.matrix],
      ['matrix', STEP_STARTS.matrix, STEP_STARTS.message],
    ]
    for (const [key, start, end] of windows) {
      if (t >= start && t < end) {
        const amount = ramp(t, start + 0.2, start + 0.9) * (1 - ramp(t, end - 0.3, end))
        return { focus: FOCUS_FOR[key], amount: 0.9 * amount }
      }
    }
    return { focus: NO_FOCUS, amount: 0 }
  }

  private refreshFocus(): void {
    if (!this.sdf) return
    if (this.hoverFocus || this.focusState.amount > 0) {
      this.sdf.setFocus(this.hoverFocus ?? NO_FOCUS, this.focusState.amount)
    } else {
      const { focus, amount } = this.timelineFocus(this.lastTime)
      this.sdf.setFocus(focus, amount)
    }
    this.dirty = true
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
    this.player?.dispose()
    this.player = null
    this.timeline?.kill()
    this.timeline = null
    this.quiz?.close()
    this.quiz = null
    this.endCard?.remove()
    this.endCard = null
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
    if (this.context) this.context.sceneCaption.textContent = ''
    this.context = null

    disposeObject3D(this.group)
    this.group.clear()
    this.backdropTexture.dispose()
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

  /** Lift one compartment and mute the rest while its label is hovered or focused (wins over the narration). */
  private focusOn(focus: CompartmentFocus | null): void {
    if (!this.sdf) return
    if (focus) this.hoverFocus = focus
    this.focusTween?.kill()
    const target = focus ? 1 : 0
    const done = (): void => {
      if (!focus) this.hoverFocus = null
      this.refreshFocus()
    }
    if (prefersReducedMotion()) {
      this.focusState.amount = target
      done()
      return
    }
    this.focusTween = gsap.to(this.focusState, {
      amount: target,
      duration: 0.3,
      ease: 'power2.out',
      onUpdate: () => this.refreshFocus(),
      onComplete: done,
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
    infoButton.textContent = content.scenes.scene1.networkButton
    infoButton.addEventListener('click', () => {
      context.tooltipLayer.show(content.ui.didYouKnow, content.scenes.scene1.tooltips.network)
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
      this.player?.pause()
      this.cutOverride = Number(slider.value) / 100
      this.setCut(this.cutOverride)
    })

    panel.append(label, slider)
    context.container.append(panel)
    this.cutawayPanel = panel
    this.slider = slider
  }
}
