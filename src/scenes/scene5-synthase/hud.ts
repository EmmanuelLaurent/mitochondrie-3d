import { content } from '../../i18n/content'
import { fillTemplate, type TemplateValues } from '../../i18n/fill'

const text = content.scenes.scene5
const SVG_NS = 'http://www.w3.org/2000/svg'

const svg = <K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] => {
  const element = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value))
  return element
}

/** Point on a circle of the dial (degrees clockwise from the top). */
const polar = (radius: number, degrees: number): [number, number] => {
  const a = ((degrees - 90) * Math.PI) / 180
  return [50 + radius * Math.cos(a), 50 + radius * Math.sin(a)]
}

const arc = (radius: number, from: number, to: number): string => {
  const [x0, y0] = polar(radius, from)
  const [x1, y1] = polar(radius, to)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

export interface SynthaseState {
  /** Rotor angle of the detailed turn (degrees). */
  theta: number
  notches: number
  atp: number
  /** 0..1: the dial is shown. */
  dial: number
  /** 0..1: the proton-motive force is shown. */
  pmf: number
}

/**
 * The instrument of chapter 5: a dial with one tick per c subunit (the needle is the
 * rotor), three sectors that fill as each ATP leaves F1, and the readouts « Crans n/8 »,
 * « ATP k/3 ». In the gradient step it shows the proton-motive force instead (two
 * segments, Δψ the larger, as in chapter 4). Never colour alone: filled ticks are
 * longer, and every count is written.
 */
export class SynthaseGauge {
  readonly element: HTMLElement
  private readonly dial: HTMLElement
  private readonly needle: SVGLineElement
  private readonly ticks: SVGLineElement[] = []
  private readonly sectors: SVGPathElement[] = []
  private readonly notchLine: HTMLElement
  private readonly atpLine: HTMLElement
  private readonly turnLine: HTMLElement
  private readonly pmf: HTMLElement
  private shown = ''

  constructor(
    container: HTMLElement,
    private readonly values: TemplateValues & { cSubunits: number; atpPerTurn: number },
    electricShare: number,
  ) {
    this.element = document.createElement('aside')
    this.element.className = 'depth-gauge synthase-gauge'
    this.element.setAttribute('aria-label', text.dials.title)
    const title = document.createElement('p')
    title.className = 'depth-gauge__title hud-label'
    title.textContent = text.dials.title

    this.dial = document.createElement('div')
    this.dial.className = 'synthase-gauge__dial'
    const face = svg('svg', { viewBox: '0 0 100 100', class: 'synthase-gauge__face', 'aria-hidden': 'true' })
    face.append(svg('circle', { cx: 50, cy: 50, r: 33, class: 'synthase-gauge__ring' }))
    for (let k = 0; k < values.atpPerTurn; k++) {
      const sector = svg('path', { d: arc(44, (360 / values.atpPerTurn) * k + 3, (360 / values.atpPerTurn) * (k + 1) - 3), class: 'synthase-gauge__sector' })
      this.sectors.push(sector)
      face.append(sector)
    }
    for (let k = 0; k < values.cSubunits; k++) {
      const [x0, y0] = polar(27, (360 / values.cSubunits) * k)
      const [x1, y1] = polar(37, (360 / values.cSubunits) * k)
      const tick = svg('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'synthase-gauge__tick' })
      this.ticks.push(tick)
      face.append(tick)
    }
    this.needle = svg('line', { x1: 50, y1: 50, x2: 50, y2: 21, class: 'synthase-gauge__needle' })
    face.append(this.needle, svg('circle', { cx: 50, cy: 50, r: 3.2, class: 'synthase-gauge__hub' }))
    const readout = document.createElement('div')
    readout.className = 'synthase-gauge__readout'
    this.notchLine = document.createElement('p')
    this.atpLine = document.createElement('p')
    this.turnLine = document.createElement('p')
    this.turnLine.className = 'synthase-gauge__turn'
    readout.append(this.notchLine, this.atpLine, this.turnLine)
    this.dial.append(face, readout)

    // Proton-motive force: the same two-segment bar as chapter 4.
    this.pmf = document.createElement('div')
    this.pmf.className = 'chain-gauge__pmf'
    const pmfTitle = document.createElement('p')
    pmfTitle.className = 'chain-gauge__pmf-title'
    pmfTitle.textContent = text.pmf.title
    const track = document.createElement('div')
    track.className = 'chain-gauge__pmf-track'
    const psi = document.createElement('div')
    psi.className = 'chain-gauge__pmf-psi'
    psi.style.setProperty('--share', String(electricShare))
    psi.textContent = text.pmf.psi
    const ph = document.createElement('div')
    ph.className = 'chain-gauge__pmf-ph'
    ph.style.setProperty('--share', String(1 - electricShare))
    ph.textContent = text.pmf.ph
    track.append(psi, ph)
    const note = document.createElement('p')
    note.className = 'chain-gauge__note'
    note.textContent = text.pmf.typical
    this.pmf.append(pmfTitle, track, note)

    this.element.append(title, this.dial, this.pmf)
    container.append(this.element)
  }

  set(state: SynthaseState): void {
    const key = `${state.theta.toFixed(1)}:${state.notches}:${state.atp}:${state.dial.toFixed(2)}:${state.pmf.toFixed(2)}`
    if (key === this.shown) return
    this.shown = key
    this.element.hidden = state.dial <= 0 && state.pmf <= 0
    this.dial.hidden = state.dial <= 0
    this.dial.style.opacity = String(Math.min(1, state.dial))
    this.pmf.hidden = state.pmf <= 0 || state.dial > 0
    this.pmf.style.opacity = String(Math.min(1, state.pmf))
    this.needle.setAttribute('transform', `rotate(${state.theta.toFixed(2)} 50 50)`)
    this.ticks.forEach((tick, k) => tick.classList.toggle('is-done', k < state.notches))
    this.sectors.forEach((sector, k) => sector.classList.toggle('is-done', k < state.atp))
    const total = this.values.cSubunits
    this.notchLine.textContent = fillTemplate(text.dials.notches, { n: state.notches, total })
    this.atpLine.textContent = fillTemplate(text.dials.atp, { k: state.atp, total: this.values.atpPerTurn })
    this.turnLine.textContent = state.notches >= total ? fillTemplate(text.dials.turn, { total }) : ''
  }

  dispose(): void {
    this.element.remove()
  }
}

/** « Le prix d'un ATP » : the total and the P/O that follow, line by line. */
export function createCostCard(values: TemplateValues): { element: HTMLElement; lines: HTMLElement[] } {
  const element = document.createElement('aside')
  element.className = 'scene2-card cost-card'
  const title = document.createElement('p')
  title.className = 'scene2-card__title hud-label'
  title.textContent = text.costCard.title
  element.append(title)
  const lines = [text.tags.foCost, text.tags.transportCost, text.tags.totalCost, text.tags.poCost].map((template, i) => {
    const line = document.createElement('p')
    line.className = i === 2 ? 'cost-card__line cost-card__line--total' : 'cost-card__line'
    line.textContent = fillTemplate(template, values)
    element.append(line)
    return line
  })
  return { element, lines }
}
