import { clock } from '../../core/clock'
import { content } from '../../i18n/content'
import type { JourneyCounters, JourneyState } from '../../core/JourneyState'
import type { TooltipLayer } from '../tooltip/TooltipLayer'

type DisplayedCounter = Exclude<keyof JourneyCounters, 'atpInvested'>

const ORDER: DisplayedCounter[] = ['acetylCoA', 'nadh', 'fadh2', 'protonsPumped', 'oxygenConsumed', 'atp']

const LABEL_KEY: Record<DisplayedCounter, keyof typeof content.counters> = {
  acetylCoA: 'acetylCoA',
  nadh: 'nadh',
  fadh2: 'fadh2',
  protonsPumped: 'hPumped',
  oxygenConsumed: 'oxygenConsumed',
  atp: 'atp',
}

/** How long a changed value stays emphasised (a single soft rise, never blinking), in seconds. */
const CHANGE_EMPHASIS_S = 4

/** French number typography: true minus sign (U+2212), decimal comma. */
export function formatCount(value: number): string {
  const text = Number.isInteger(value) ? String(Math.abs(value)) : Math.abs(value).toFixed(1).replace('.', ',')
  return value < 0 ? `−${text}` : text
}

export class Counters {
  private readonly valueElements = new Map<DisplayedCounter, HTMLElement>()
  private readonly itemElements = new Map<DisplayedCounter, HTMLElement>()
  private readonly emphasisedAt = new Map<DisplayedCounter, number>()
  private readonly footnote: HTMLElement
  private previous: JourneyCounters | null = null

  constructor(container: HTMLElement, journey: JourneyState, tooltipLayer: TooltipLayer) {
    container.classList.add('counters')

    const header = document.createElement('div')
    header.className = 'counters__header'
    const title = document.createElement('span')
    title.className = 'hud-label'
    title.textContent = content.counters.title
    const info = document.createElement('button')
    info.type = 'button'
    info.className = 'counters__info'
    info.textContent = 'ℹ'
    info.setAttribute('aria-label', content.counters.scopeHint)
    info.title = content.counters.scopeHint
    info.addEventListener('click', () => tooltipLayer.show(content.counters.title, content.counters.scopeHint))
    header.append(title, info)
    container.append(header)

    for (const key of ORDER) {
      const item = document.createElement('div')
      item.className = 'counters__item'

      const label = document.createElement('span')
      label.className = 'counters__label'
      label.textContent = content.counters[LABEL_KEY[key]]

      const value = document.createElement('span')
      value.className = 'counters__value'

      item.append(label, value)
      container.append(item)
      this.valueElements.set(key, value)
      this.itemElements.set(key, item)
    }

    this.footnote = document.createElement('p')
    this.footnote.className = 'counters__footnote'
    container.append(this.footnote)

    this.renderValues(journey.current)
    journey.onChange((counters) => this.renderValues(counters))
  }

  private renderValues(counters: Readonly<JourneyCounters>): void {
    for (const [key, element] of this.valueElements) {
      const text = formatCount(counters[key])
      element.textContent = text
      element.setAttribute('aria-label', `${content.counters[LABEL_KEY[key]]} : ${text}`)
      if (this.previous && this.previous[key] !== counters[key]) this.emphasise(key)
    }
    const invested = counters.atpInvested
    this.footnote.hidden = invested === 0
    this.footnote.textContent = content.counters.activationChip.replace('{value}', formatCount(-invested))
    this.previous = { ...counters }
  }

  private emphasise(key: DisplayedCounter): void {
    this.itemElements.get(key)?.classList.add('counters__item--changed')
    this.emphasisedAt.set(key, clock.now())
  }

  /** Called every frame: ends the emphasis after a few seconds of app time. */
  tick(): void {
    const now = clock.now()
    for (const [key, at] of this.emphasisedAt) {
      if (now - at <= CHANGE_EMPHASIS_S) continue
      this.itemElements.get(key)?.classList.remove('counters__item--changed')
      this.emphasisedAt.delete(key)
    }
  }
}
