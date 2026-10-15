import { content } from '../../i18n/content'

export interface PlayerStep {
  /** Label in the master timeline where this step starts. */
  label: string
  title: string
  narration: string
  /** « Réaction » / « Transport » tag (a chemical change in place vs a change of compartment). */
  kind?: string
  /** Shown as real text under the narration (screen readers read it). */
  equation?: string
  /** « En savoir plus » chips opening tooltips. */
  infos?: { label: string; open: () => void }[]
}

export interface StepPlayerOptions {
  timeline: gsap.core.Timeline
  steps: PlayerStep[]
  /** Under prefers-reduced-motion: no autoplay, and stepping jumps straight to each step's end state. */
  reducedMotion: boolean
  /** Guided tour: play straight through. Otherwise only the first step plays, then the student drives. */
  autoplay: boolean
  /** Called whenever the playhead moves (the scene re-renders). */
  onUpdate: () => void
  /** Called once the playhead reaches the end of the last step. */
  onComplete?: () => void
  /** Called when the displayed step changes (e.g. to close a tooltip that would go stale). */
  onStepChange?: (index: number) => void
}

const SPEEDS = [0.5, 1, 1.5, 2]
/** "Previous" restarts the current step when we are this far into it (seconds), like a media player. */
const RESTART_THRESHOLD = 1.5

/**
 * « Étape précédente » : restarts the current step when well into it (like a media
 * player), otherwise goes back one step. Under reduced motion the playhead always sits
 * at a step's end state, so it always goes back one step.
 */
export function previousStepIndex(current: number, intoStep: number, reducedMotion: boolean): number {
  if (!reducedMotion && intoStep > RESTART_THRESHOLD) return current
  return Math.max(current - 1, 0)
}

/** A modal (the chapter quiz) is open: keys belong to it, not to the scene behind. */
export function modalOpen(): boolean {
  return document.querySelector('dialog[open]') !== null
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
}

/**
 * Drives a scene's master GSAP timeline step by step: continuous playback, or one
 * step at a time (each "next" plays exactly one step and stops), speed control,
 * keyboard (Space, ← →). Narration is on-screen text, announced politely.
 */
export class StepPlayer {
  private readonly root: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly narrationEl: HTMLElement
  private readonly counterEl: HTMLElement
  private readonly kindEl: HTMLElement
  private readonly equationEl: HTMLElement
  private readonly infosEl: HTMLElement
  private readonly playButton: HTMLButtonElement
  private readonly dots: HTMLButtonElement[] = []
  private readonly timeline: gsap.core.Timeline
  private readonly steps: PlayerStep[]
  private segment: gsap.core.Tween | null = null
  private speed = 1
  private shownStep = -1
  private endNotified = false

  constructor(
    container: HTMLElement,
    private readonly options: StepPlayerOptions,
  ) {
    this.timeline = options.timeline
    this.steps = options.steps
    this.timeline.pause(0)
    this.timeline.eventCallback('onUpdate', () => this.onPlayhead())
    this.timeline.eventCallback('onComplete', () => this.onReachedEnd())

    this.root = document.createElement('section')
    this.root.className = 'step-player'

    const header = document.createElement('div')
    header.className = 'step-player__header'
    this.counterEl = document.createElement('span')
    this.counterEl.className = 'step-player__counter hud-label'
    this.titleEl = document.createElement('h2')
    this.titleEl.className = 'step-player__title'
    this.kindEl = document.createElement('span')
    this.kindEl.className = 'step-player__kind'
    header.append(this.counterEl, this.titleEl, this.kindEl)

    this.narrationEl = document.createElement('p')
    this.narrationEl.className = 'step-player__narration'
    this.narrationEl.setAttribute('aria-live', 'polite')
    this.equationEl = document.createElement('p')
    this.equationEl.className = 'step-player__equation'
    this.infosEl = document.createElement('div')
    this.infosEl.className = 'step-player__infos'

    const controls = document.createElement('div')
    controls.className = 'step-player__controls'

    const prev = this.iconButton('⏮', content.player.previous, () => this.previous())
    this.playButton = this.iconButton('▶', content.player.play, () => this.togglePlay())
    this.playButton.classList.add('step-player__button--play')
    const next = this.iconButton('⏭', content.player.next, () => this.next())

    const dots = document.createElement('div')
    dots.className = 'step-player__dots'
    this.steps.forEach((step, index) => {
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.className = 'step-player__dot'
      dot.title = step.title
      dot.setAttribute('aria-label', `${index + 1}. ${step.title}`)
      dot.addEventListener('click', () => this.goToStep(index))
      dots.append(dot)
      this.dots.push(dot)
    })

    const speed = document.createElement('select')
    speed.className = 'step-player__speed'
    speed.setAttribute('aria-label', content.player.speed)
    speed.title = content.player.speed
    for (const rate of SPEEDS) {
      const option = document.createElement('option')
      option.value = String(rate)
      option.textContent = `${String(rate).replace('.', ',')}×`
      option.selected = rate === 1
      speed.append(option)
    }
    speed.addEventListener('change', () => this.setSpeed(Number(speed.value)))

    // Keyboard help folded behind a small button: the panel stays short so the scene shows.
    const hint = document.createElement('p')
    hint.className = 'step-player__hint'
    hint.id = `step-player-hint-${Math.round(Math.random() * 1e6)}`
    hint.textContent = content.player.keyboardHint
    hint.hidden = true
    const keys = this.iconButton('⌨', content.player.keyboardHint, () => {
      hint.hidden = !hint.hidden
      keys.setAttribute('aria-expanded', String(!hint.hidden))
    })
    keys.classList.add('step-player__button--small')
    keys.setAttribute('aria-expanded', 'false')
    keys.setAttribute('aria-controls', hint.id)
    controls.append(prev, this.playButton, next, dots, speed, keys)
    const progress = document.createElement('div')
    progress.className = 'step-player__progress'
    progress.setAttribute('aria-hidden', 'true')

    this.root.append(header, this.narrationEl, this.equationEl, this.infosEl, controls, hint, progress)
    container.append(this.root)

    document.addEventListener('keydown', this.onKey)
    this.showStep(0)
    this.renderPlayState()
    if (!options.reducedMotion) {
      if (options.autoplay) this.play()
      else this.goToStep(0)
    } else {
      this.timeline.seek(this.stepEnd(0) - 0.001)
      options.onUpdate()
    }
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKey)
    this.segment?.kill()
    this.segment = null
    this.timeline.eventCallback('onUpdate', null)
    this.timeline.eventCallback('onComplete', null)
    this.root.remove()
  }

  get isPlaying(): boolean {
    return !this.timeline.paused() || (this.segment?.isActive() ?? false)
  }

  play(): void {
    this.segment?.kill()
    this.segment = null
    if (this.timeline.progress() >= 1) this.timeline.seek(0)
    this.timeline.timeScale(this.speed).play()
    this.renderPlayState()
  }

  pause(): void {
    this.segment?.kill()
    this.segment = null
    this.timeline.pause()
    this.renderPlayState()
  }

  togglePlay(): void {
    if (this.isPlaying) this.pause()
    else this.play()
  }

  next(): void {
    this.goToStep(Math.min(this.currentIndex() + 1, this.steps.length - 1))
  }

  previous(): void {
    const current = this.currentIndex()
    const intoStep = this.timeline.time() - this.labelTime(current)
    this.goToStep(previousStepIndex(current, intoStep, this.options.reducedMotion))
  }

  /** Plays exactly one step (or jumps to its end state under reduced motion), then stops. */
  goToStep(index: number): void {
    this.pause()
    const start = this.labelTime(index)
    const end = this.stepEnd(index)
    if (this.options.reducedMotion) {
      this.timeline.seek(end - 0.001)
      this.showStep(index)
      this.options.onUpdate()
      return
    }
    this.timeline.seek(start)
    this.segment = this.timeline.tweenFromTo(start, end, { ease: 'none' })
    this.segment.timeScale(this.speed)
    this.segment.eventCallback('onComplete', () => {
      this.renderPlayState()
      if (end >= this.timeline.duration()) this.onReachedEnd()
    })
    this.renderPlayState()
  }

  setSpeed(rate: number): void {
    this.speed = rate
    this.timeline.timeScale(rate)
    this.segment?.timeScale(rate)
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    // Shift + arrows belong to the 3D view (orbit), not to the player.
    if (modalOpen() || isTypingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault()
      this.togglePlay()
    } else if (event.key === 'ArrowRight') {
      this.next()
    } else if (event.key === 'ArrowLeft') {
      this.previous()
    } else if (event.key === 'Home') {
      this.goToStep(0)
    } else if (event.key === 'End') {
      this.goToStep(this.steps.length - 1)
    }
  }

  private iconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'step-player__button'
    button.textContent = icon
    button.setAttribute('aria-label', label)
    button.title = label
    button.addEventListener('click', onClick)
    return button
  }

  private labelTime(index: number): number {
    return this.timeline.labels[this.steps[index].label] ?? 0
  }

  private stepEnd(index: number): number {
    return index + 1 < this.steps.length ? this.labelTime(index + 1) : this.timeline.duration()
  }

  private currentIndex(): number {
    const time = this.timeline.time()
    let current = 0
    this.steps.forEach((_, index) => {
      if (this.labelTime(index) <= time + 1e-4) current = index
    })
    return current
  }

  private onPlayhead(): void {
    const index = this.currentIndex()
    if (index !== this.shownStep) this.showStep(index)
    const progress = this.timeline.progress()
    if (progress < 1) this.endNotified = false
    this.root.style.setProperty('--progress', progress.toFixed(4))
    this.options.onUpdate()
  }

  /** Both the timeline and a final segment can report the end: notify once per arrival. */
  private onReachedEnd(): void {
    this.renderPlayState()
    if (this.endNotified) return
    this.endNotified = true
    this.options.onComplete?.()
  }

  private showStep(index: number): void {
    const changed = index !== this.shownStep
    // If focus is on an info chip that is about to be replaced, it moves to the new step
    // (first chip, or the title) instead of falling back to the page.
    const focusInChips = this.infosEl.contains(document.activeElement)
    this.shownStep = index
    const step = this.steps[index]
    this.titleEl.textContent = step.title
    this.narrationEl.textContent = step.narration
    this.kindEl.textContent = step.kind ?? ''
    this.kindEl.hidden = !step.kind
    this.equationEl.textContent = step.equation ?? ''
    this.equationEl.hidden = !step.equation
    this.infosEl.replaceChildren(
      ...(step.infos ?? []).map((info) => {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'step-player__info'
        chip.textContent = `ℹ ${info.label}`
        chip.addEventListener('click', () => {
          this.pause()
          info.open()
        })
        return chip
      }),
    )
    this.infosEl.hidden = !step.infos?.length
    if (focusInChips) {
      const first = this.infosEl.querySelector<HTMLButtonElement>('button')
      if (first) first.focus()
      else {
        this.titleEl.tabIndex = -1
        this.titleEl.focus()
      }
    }
    if (changed) this.options.onStepChange?.(index)
    this.counterEl.textContent = content.player.stepOf
      .replace('{current}', String(index + 1))
      .replace('{total}', String(this.steps.length))
    this.dots.forEach((dot, i) => {
      dot.classList.toggle('is-done', i < index)
      if (i === index) dot.setAttribute('aria-current', 'step')
      else dot.removeAttribute('aria-current')
    })
  }

  private renderPlayState(): void {
    const playing = this.isPlaying
    this.playButton.textContent = playing ? '⏸' : '▶'
    const label = playing ? content.player.pause : content.player.play
    this.playButton.setAttribute('aria-label', label)
    this.playButton.title = label
  }
}
