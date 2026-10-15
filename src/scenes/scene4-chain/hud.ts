import { content } from '../../i18n/content'
import { fillTemplate } from '../../i18n/fill'

const text = content.scenes.scene4

function bar(className: string): { root: HTMLElement; fill: HTMLElement; label: HTMLElement; value: HTMLElement } {
  const root = document.createElement('div')
  root.className = `chain-gauge__row ${className}`
  const head = document.createElement('div')
  head.className = 'chain-gauge__head'
  const label = document.createElement('span')
  const value = document.createElement('span')
  value.className = 'chain-gauge__value'
  head.append(label, value)
  const track = document.createElement('div')
  track.className = 'chain-gauge__track'
  const fill = document.createElement('div')
  fill.className = 'chain-gauge__fill'
  track.append(fill)
  root.append(head, track)
  return { root, fill, label, value }
}

/**
 * The flux gauge of chapter 4: how many of our NADH and FADH₂ have given their
 * electrons, and the H⁺ pumped so far; in the last step the H⁺ bar turns into the
 * proton-motive force, split into its two parts (Δψ, the larger, and ΔpH).
 */
export class ChainGauge {
  readonly element: HTMLElement
  private readonly nadh = bar('chain-gauge__row--nadh')
  private readonly fadh2 = bar('chain-gauge__row--fadh2')
  private readonly protons = bar('chain-gauge__row--protons')
  private readonly pmf: HTMLElement
  private readonly psi: HTMLElement
  private readonly ph: HTMLElement
  private shown = ''

  constructor(
    container: HTMLElement,
    private readonly totals: { nadh: number; fadh2: number; protons: number },
    electricShare: number,
  ) {
    this.element = document.createElement('aside')
    this.element.className = 'depth-gauge chain-gauge'
    this.element.setAttribute('aria-label', text.flux.title)
    const title = document.createElement('p')
    title.className = 'depth-gauge__title hud-label'
    title.textContent = text.flux.title
    this.protons.label.textContent = text.flux.protons

    // Proton-motive force: two segments, Δψ (charges) and ΔpH, lengths from the config.
    this.pmf = document.createElement('div')
    this.pmf.className = 'chain-gauge__pmf'
    this.pmf.hidden = true
    const pmfTitle = document.createElement('p')
    pmfTitle.className = 'chain-gauge__pmf-title'
    pmfTitle.textContent = text.flux.pmf
    const track = document.createElement('div')
    track.className = 'chain-gauge__pmf-track'
    this.psi = document.createElement('div')
    this.psi.className = 'chain-gauge__pmf-psi'
    this.psi.style.setProperty('--share', String(electricShare))
    this.psi.textContent = text.flux.psi
    this.ph = document.createElement('div')
    this.ph.className = 'chain-gauge__pmf-ph'
    this.ph.style.setProperty('--share', String(1 - electricShare))
    this.ph.textContent = text.flux.ph
    track.append(this.psi, this.ph)
    const note = document.createElement('p')
    note.className = 'chain-gauge__note'
    note.textContent = text.flux.typical
    this.pmf.append(pmfTitle, track, note)

    this.element.append(title, this.nadh.root, this.fadh2.root, this.protons.root, this.pmf)
    container.append(this.element)
  }

  set(state: { nadh: number; fadh2: number; protons: number; pmf: number }): void {
    const key = `${state.nadh}:${state.fadh2}:${state.protons}:${state.pmf.toFixed(2)}`
    if (key === this.shown) return
    this.shown = key
    this.nadh.label.textContent = fillTemplate(text.flux.nadh, { n: state.nadh, total: this.totals.nadh })
    this.fadh2.label.textContent = fillTemplate(text.flux.fadh2, { n: state.fadh2, total: this.totals.fadh2 })
    this.nadh.fill.style.width = `${(100 * state.nadh) / this.totals.nadh}%`
    this.fadh2.fill.style.width = `${(100 * state.fadh2) / this.totals.fadh2}%`
    this.protons.value.textContent = String(state.protons)
    this.protons.fill.style.width = `${(100 * state.protons) / this.totals.protons}%`
    // The H⁺ bar gives way to the proton-motive force (same panel, same place).
    this.protons.root.hidden = state.pmf >= 1
    this.pmf.hidden = state.pmf <= 0
    this.pmf.style.opacity = String(Math.min(1, state.pmf))
  }

  dispose(): void {
    this.element.remove()
  }
}
