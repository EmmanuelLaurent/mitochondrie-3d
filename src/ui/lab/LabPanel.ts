import { content } from '../../i18n/content'
import { INHIBITORS, labState, type Inhibitor, type LabState } from '../../labo/labModel'
import type { TooltipLayer } from '../tooltip/TooltipLayer'

const text = content.lab
type GaugeKey = keyof LabState
const GAUGES: GaugeKey[] = ['electronFlux', 'oxygenConsumption', 'protonGradient', 'atpProduction', 'heat']
/** Gauges show 0 … 2× the normal condition; the normal level is marked. */
const GAUGE_MAX = 2

/** A word for each level, so the gauges never rely on bar length (or colour) alone. */
export function levelWord(value: number): string {
  if (value < 0.02) return text.levels.none
  if (value < 0.6) return text.levels.low
  if (value < 0.85) return text.levels.reduced
  if (value <= 1.2) return text.levels.normal
  if (value <= 1.6) return text.levels.high
  return text.levels.veryHigh
}

/**
 * The Labo control panel: inhibitors (alone or combined), available ADP, and the
 * gauges computed by the pure model (src/labo/labModel.ts). Emits the new state on
 * every change so the 3D view can follow.
 */
export class LabPanel {
  readonly element: HTMLElement
  private readonly active = new Set<Inhibitor>()
  private adp = 1
  private readonly gaugeBars = new Map<GaugeKey, HTMLElement>()
  private readonly gaugeWords = new Map<GaugeKey, HTMLElement>()
  private readonly toggles = new Map<Inhibitor, HTMLButtonElement>()
  private readonly slider: HTMLInputElement

  constructor(
    container: HTMLElement,
    tooltips: TooltipLayer,
    private readonly onChange: (state: LabState) => void,
  ) {
    this.element = document.createElement('section')
    this.element.className = 'lab-panel'
    this.element.setAttribute('aria-label', text.title)

    const title = document.createElement('h2')
    title.className = 'lab-panel__title'
    title.textContent = text.title
    const intro = document.createElement('p')
    intro.className = 'lab-panel__intro'
    intro.textContent = text.intro

    const inhibitors = document.createElement('div')
    inhibitors.className = 'lab-panel__inhibitors'
    inhibitors.setAttribute('role', 'group')
    inhibitors.setAttribute('aria-label', text.inhibitorsTitle)
    const inhibitorsTitle = document.createElement('p')
    inhibitorsTitle.className = 'hud-label lab-panel__heading'
    inhibitorsTitle.textContent = text.inhibitorsTitle
    for (const inhibitor of INHIBITORS) {
      const row = document.createElement('div')
      row.className = 'lab-panel__inhibitor'
      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'lab-panel__toggle'
      toggle.setAttribute('aria-pressed', 'false')
      const name = document.createElement('span')
      name.className = 'lab-panel__toggle-name'
      name.textContent = text.inhibitors[inhibitor].label
      const target = document.createElement('span')
      target.className = 'lab-panel__toggle-target'
      target.textContent = text.inhibitors[inhibitor].target
      toggle.append(name, target)
      toggle.addEventListener('click', () => this.toggle(inhibitor))
      const info = document.createElement('button')
      info.type = 'button'
      info.className = 'lab-panel__info'
      info.textContent = 'ℹ'
      info.setAttribute('aria-label', `${text.inhibitors[inhibitor].label} : ${content.ui.didYouKnow}`)
      info.addEventListener('click', () => tooltips.show(text.inhibitors[inhibitor].label, text.inhibitors[inhibitor].tooltip))
      row.append(toggle, info)
      inhibitors.append(row)
      this.toggles.set(inhibitor, toggle)
    }

    const adpRow = document.createElement('div')
    adpRow.className = 'lab-panel__adp'
    const adpLabel = document.createElement('label')
    adpLabel.htmlFor = 'lab-adp'
    adpLabel.className = 'hud-label lab-panel__heading'
    adpLabel.textContent = text.adp
    this.slider = document.createElement('input')
    this.slider.id = 'lab-adp'
    this.slider.type = 'range'
    this.slider.min = '0'
    this.slider.max = '100'
    this.slider.value = '100'
    this.slider.addEventListener('input', () => {
      this.adp = Number(this.slider.value) / 100
      this.slider.style.setProperty('--_fill', `${this.slider.value}%`)
      this.update()
    })
    this.slider.style.setProperty('--_fill', '100%')
    adpRow.append(adpLabel, this.slider)

    const gauges = document.createElement('div')
    gauges.className = 'lab-panel__gauges'
    const gaugesTitle = document.createElement('p')
    gaugesTitle.className = 'hud-label lab-panel__heading'
    gaugesTitle.textContent = text.gaugesTitle
    gauges.append(gaugesTitle)
    for (const key of GAUGES) {
      const row = document.createElement('div')
      row.className = 'lab-gauge'
      const label = document.createElement('span')
      label.className = 'lab-gauge__label'
      label.textContent = text.gauges[key]
      const track = document.createElement('span')
      track.className = 'lab-gauge__track'
      track.setAttribute('aria-hidden', 'true')
      const bar = document.createElement('span')
      bar.className = 'lab-gauge__bar'
      const normal = document.createElement('span')
      normal.className = 'lab-gauge__normal'
      normal.style.left = `${(100 / GAUGE_MAX).toFixed(1)}%`
      track.append(bar, normal)
      const word = document.createElement('span')
      word.className = 'lab-gauge__word'
      row.append(label, track, word)
      gauges.append(row)
      this.gaugeBars.set(key, bar)
      this.gaugeWords.set(key, word)
    }
    const legend = document.createElement('p')
    legend.className = 'lab-panel__note'
    legend.textContent = text.normalMark

    const reset = document.createElement('button')
    reset.type = 'button'
    reset.className = 'lab-panel__reset'
    reset.textContent = text.reset
    reset.addEventListener('click', () => this.reset())
    const model = document.createElement('button')
    model.type = 'button'
    model.className = 'lab-panel__model'
    model.textContent = `ℹ ${text.modelTitle}`
    model.addEventListener('click', () => tooltips.show(text.modelTitle, text.modelNote))
    const actions = document.createElement('div')
    actions.className = 'lab-panel__actions'
    actions.append(reset, model)

    this.element.append(title, intro, inhibitorsTitle, inhibitors, adpRow, gauges, legend, actions)
    container.append(this.element)
    this.update()
  }

  dispose(): void {
    this.element.remove()
  }

  private toggle(inhibitor: Inhibitor): void {
    if (this.active.has(inhibitor)) this.active.delete(inhibitor)
    else this.active.add(inhibitor)
    this.toggles.get(inhibitor)?.setAttribute('aria-pressed', String(this.active.has(inhibitor)))
    this.update()
  }

  private reset(): void {
    this.active.clear()
    for (const toggle of this.toggles.values()) toggle.setAttribute('aria-pressed', 'false')
    this.adp = 1
    this.slider.value = '100'
    this.slider.style.setProperty('--_fill', '100%')
    this.update()
  }

  private update(): void {
    const state = labState({ inhibitors: this.active, adp: this.adp })
    for (const key of GAUGES) {
      const value = state[key]
      const bar = this.gaugeBars.get(key)
      const word = this.gaugeWords.get(key)
      if (bar) bar.style.width = `${(Math.min(value, GAUGE_MAX) / GAUGE_MAX) * 100}%`
      if (word) word.textContent = levelWord(value)
    }
    this.onChange(state)
  }
}
