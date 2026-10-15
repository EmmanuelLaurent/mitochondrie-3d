import * as THREE from 'three'
import type { NarrationControl, Scene, SceneContext } from '../../core/Scene'
import { disposeObject3D } from '../../core/dispose'
import {
  BETA_OXIDATION,
  computePalmitateBalance,
  ELECTRON_TRANSPORT_PUMPING,
  KREBS_PER_ACETYL_COA,
  oxphosATP,
  PO_RATIOS,
  type POConvention,
} from '../../config/science.config'
import { content } from '../../i18n/content'
import { createFill, formatNumber, type TemplateValues } from '../../i18n/fill'
import { StepPlayer } from '../../ui/player/StepPlayer'
import { Quiz } from '../../ui/quiz/Quiz'
import type { MitochondrionSdf } from '../scene1-exterior/mitochondrionSdf'
import { placeCamera, type CameraShot } from '../shared/molecular/camera'
import { ramp, stepIndexAt } from '../shared/molecular/choreography'
import { frameMedia, v } from '../shared/molecular/frame'
import { createStepTimeline, playerSteps } from '../shared/molecular/narration'
import { createNanoOrganelle, scene1Shot } from '../shared/molecular/organelle'
import { MolecularStage } from '../shared/molecular/stage'

/**
 * Chapter 6, the bilan: back to the organelle of chapter 1 (the same picture, cut open),
 * the whole balance of our palmitate filled in row by row, the P/O convention switch
 * (current 2.5 / 1.5 → 106 ATP; legacy 3 / 2 → 129) and the final quiz. Every number is
 * computed from the science config.
 */

const text = content.scenes.scene6
const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const STEP_STARTS = { bilan: 0, conventions: 16, end: 28 } as const
export const DURATION = 40

/** When each row of the table appears (the table is complete at the end of the first step). */
export const ROW_TIMES = [2.0, 3.6, 5.2, 6.8, 8.4, 10.0] as const

const ROWS = ['activation', 'betaOx', 'krebs', 'chain', 'synthase', 'total'] as const

/** The texts' values for one P/O convention (everything from the config). */
export function valuesFor(convention: POConvention): TemplateValues {
  const balance = computePalmitateBalance(convention)
  const legacy = computePalmitateBalance('legacy')
  const cycles = BETA_OXIDATION.cyclesForPalmitate
  return {
    cost: BETA_OXIDATION.activationCostATP,
    turns: cycles,
    acetylCoA: balance.acetylCoA,
    betaNadh: cycles * BETA_OXIDATION.nadhPerCycle,
    betaFadh2: cycles * BETA_OXIDATION.fadh2PerCycle,
    krebsNadh: balance.acetylCoA * KREBS_PER_ACETYL_COA.nadh,
    krebsFadh2: balance.acetylCoA * KREBS_PER_ACETYL_COA.fadh2,
    gtp: balance.gtp,
    co2: balance.co2,
    protons: balance.protonsPumped,
    perNadh: ELECTRON_TRANSPORT_PUMPING.perNADH,
    oxygen: balance.o2Consumed,
    water: balance.water,
    nadh: balance.nadh,
    fadh2: balance.fadh2,
    poNadh: formatNumber(PO_RATIOS[convention].nadh),
    poFadh2: formatNumber(PO_RATIOS[convention].fadh2),
    poNadhLegacy: formatNumber(PO_RATIOS.legacy.nadh),
    poFadh2Legacy: formatNumber(PO_RATIOS.legacy.fadh2),
    oxphos: oxphosATP(convention),
    atpNet: balance.atpNet,
    atpGross: balance.atpNet + BETA_OXIDATION.activationCostATP,
    atpNetLegacy: legacy.atpNet,
  }
}

export class Scene6Bilan implements Scene {
  readonly id = 'scene6-bilan'
  readonly threeScene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50000)
  readonly multisampling = 4

  private context: SceneContext | null = null
  private readonly root = new THREE.Group()
  private stage: MolecularStage | null = null
  private sdf: MitochondrionSdf | null = null
  private timeline: gsap.core.Timeline | null = null
  private player: StepPlayer | null = null
  private card: HTMLElement | null = null
  private rows: { row: HTMLElement; value: HTMLElement; key: (typeof ROWS)[number] }[] = []
  private conventionGroup: HTMLElement | null = null
  private quiz: Quiz | null = null
  private convention: POConvention = 'current'
  private fill = createFill(valuesFor('current'))
  private readonly shot: CameraShot = { target: new THREE.Vector3(), distance: 1, azimuth: 0, elevation: 0 }
  private lastTime = -1
  private dirty = true
  private labelledStep = -1

  constructor() {
    this.threeScene.add(this.root)
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
    const { clientWidth, clientHeight } = context.container
    this.camera.aspect = clientWidth / Math.max(1, clientHeight)
    this.camera.updateProjectionMatrix()

    // Chapter 1's picture: the organelle cut open, the studio backdrop, no media.
    this.stage = new MolecularStage(context.renderer, this.threeScene, this.root, frameMedia(), {
      halfSize: 40,
      near: 20,
      far: 320,
      target: v(0, 0, 0),
    })
    this.stage.configureShadows(true)
    this.stage.media.uMediaAmount.value = 0
    this.sdf = createNanoOrganelle(context.quality.current)
    this.sdf.setCut(1)
    this.root.add(this.sdf.mesh)
    // Scene 1's framing, the organelle slid to the left of the bilan card.
    const base = scene1Shot(new THREE.Vector3())
    this.shot.target.copy(base.target).add(v(780, -120, 0))
    this.shot.distance = base.distance * 1.08
    this.shot.azimuth = base.azimuth
    this.shot.elevation = base.elevation
    placeCamera(this.camera, this.shot, null, 20000)

    this.buildCard(context)
    context.scaleBar.setTier('organelle')
    context.sceneCaption.textContent = ''
    context.legend.setHighlighted([])
    this.applyCounters()

    await context.renderer.compileAsync(this.threeScene, this.camera)
    if (this.context !== context) return

    this.timeline = createStepTimeline(STEP_STARTS, DURATION)
    const tooltips = text.tooltips as Record<string, string>
    const titles = text.tooltipTitles as Record<string, string>
    this.player = new StepPlayer(context.playerRoot, {
      timeline: this.timeline,
      steps: playerSteps(text.steps, (template) => this.fill(template), (key) => ({ title: titles[key], text: this.fill(tooltips[key]) }), (title, body) => context.tooltipLayer.show(title, body)),
      reducedMotion: prefersReducedMotion(),
      autoplay: context.visit.guided,
      onUpdate: () => {},
      onComplete: () => context.visit.onComplete(),
      onStepChange: () => context.tooltipLayer.clear(),
    })
    this.applyTime(0)
  }

  update(): void {
    const t = this.timeline?.time() ?? 0
    if (t !== this.lastTime) this.applyTime(t)
  }

  needsRender(): boolean {
    const dirty = this.dirty
    this.dirty = false
    return dirty
  }

  setFrame(frame: number, accumulating: boolean): void {
    this.sdf?.setFrame(frame, accumulating)
    this.stage?.setFrame(frame, accumulating)
  }

  afterRender(): void {
    if (!this.context) return
    const viewHeight = 2 * this.shot.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
    this.context.scaleBar.setPixelsPerMeter((this.context.container.clientHeight / viewHeight) * 1e9)
  }

  exit(): void {
    this.player?.dispose()
    this.player = null
    this.timeline?.kill()
    this.timeline = null
    this.quiz?.close()
    this.quiz = null
    this.card?.remove()
    this.card = null
    if (this.context) {
      this.context.renderer.domElement.removeAttribute('role')
      this.context.renderer.domElement.removeAttribute('aria-label')
      this.context.tooltipLayer.clear()
    }
    this.context = null
    this.stage?.dispose()
    this.stage = null
    disposeObject3D(this.root)
    this.root.clear()
    this.sdf = null
  }

  // ------------------------------------------------------------------ card

  private buildCard(context: SceneContext): void {
    const card = document.createElement('aside')
    card.className = 'scene2-card bilan-card'
    card.setAttribute('aria-label', text.card.title)
    const title = document.createElement('p')
    title.className = 'scene2-card__title hud-label'
    title.textContent = text.card.title
    const table = document.createElement('dl')
    table.className = 'bilan-card__table'
    this.rows = ROWS.map((key) => {
      const row = document.createElement('div')
      row.className = key === 'total' ? 'bilan-card__row bilan-card__row--total' : 'bilan-card__row'
      const label = document.createElement('dt')
      label.textContent = this.fill(text.card.rows[key][0])
      const value = document.createElement('dd')
      row.append(label, value)
      table.append(row)
      return { row, value, key }
    })

    // The P/O convention: two radio buttons (keyboard: arrows).
    const group = document.createElement('fieldset')
    group.className = 'bilan-card__convention'
    const legend = document.createElement('legend')
    legend.className = 'hud-label'
    legend.textContent = text.card.convention
    group.append(legend)
    for (const convention of ['current', 'legacy'] as const) {
      const label = document.createElement('label')
      label.className = 'bilan-card__option'
      const input = document.createElement('input')
      input.type = 'radio'
      input.name = 'po-convention'
      input.value = convention
      input.checked = convention === this.convention
      input.addEventListener('change', () => {
        if (!input.checked) return
        this.convention = convention
        this.fill = createFill(valuesFor(convention))
        this.refreshValues()
        this.applyCounters()
      })
      const span = document.createElement('span')
      span.textContent = createFill(valuesFor('current'))(text.card[convention])
      label.append(input, span)
      group.append(label)
    }
    this.conventionGroup = group

    const actions = document.createElement('div')
    actions.className = 'scene2-card__actions'
    const quiz = document.createElement('button')
    quiz.type = 'button'
    quiz.className = 'quiz-open'
    quiz.textContent = text.card.quiz
    quiz.addEventListener('click', () => {
      this.player?.pause()
      this.quiz?.close()
      const questions = text.questions.map((question) => ({
        ...question,
        question: this.fill(question.question),
        choices: question.choices.map((choice) => this.fill(choice)),
        explanation: this.fill(question.explanation),
      }))
      this.quiz = new Quiz(context.container, `${content.quiz.open} — ${text.title}`, questions, text.needsTeacherReview)
    })
    const restart = document.createElement('button')
    restart.type = 'button'
    restart.className = 'scene2-card__next'
    restart.textContent = text.card.restart
    restart.addEventListener('click', () => context.visit.goNext?.())
    restart.hidden = !context.visit.goNext
    actions.append(quiz, restart)

    card.append(title, table, group, actions)
    context.container.append(card)
    this.card = card
    this.refreshValues()
  }

  private refreshValues(): void {
    for (const { value, key, row } of this.rows) {
      value.textContent = this.fill(text.card.rows[key][1])
      row.querySelector('dt')!.textContent = this.fill(text.card.rows[key][0])
    }
  }

  private applyCounters(): void {
    const balance = computePalmitateBalance(this.convention)
    this.context?.journey.set({
      acetylCoA: balance.acetylCoA,
      nadh: balance.nadh,
      fadh2: balance.fadh2,
      protonsPumped: balance.protonsPumped,
      oxygenConsumed: balance.o2Consumed,
      atp: balance.atpNet,
      atpInvested: BETA_OXIDATION.activationCostATP,
      gtp: balance.gtp,
    })
  }

  // ------------------------------------------------------------------ time

  private applyTime(t: number): void {
    const context = this.context
    if (!context) return
    this.lastTime = t
    this.rows.forEach(({ row }, i) => {
      const shown = ramp(t, ROW_TIMES[i], ROW_TIMES[i] + 0.6)
      row.style.opacity = String(shown)
      row.hidden = shown <= 0
    })
    if (this.conventionGroup) {
      this.conventionGroup.classList.toggle('is-highlighted', t >= STEP_STARTS.conventions && t < STEP_STARTS.end)
    }
    const stepIndex = stepIndexAt(STEP_STARTS, t)
    if (stepIndex !== this.labelledStep) {
      this.labelledStep = stepIndex
      context.renderer.domElement.setAttribute('role', 'img')
      context.renderer.domElement.setAttribute('aria-label', `${text.title} — ${this.fill(text.steps[stepIndex].title)}`)
    }
  }
}
