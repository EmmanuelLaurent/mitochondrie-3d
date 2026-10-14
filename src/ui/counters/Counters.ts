import { content } from '../../i18n/content'
import type { JourneyCounters, JourneyState } from '../../core/JourneyState'

const ORDER: (keyof JourneyCounters)[] = [
  'acetylCoA',
  'nadh',
  'fadh2',
  'protonsPumped',
  'oxygenConsumed',
  'atp',
]

const LABEL_KEY: Record<keyof JourneyCounters, keyof typeof content.counters> = {
  acetylCoA: 'acetylCoA',
  nadh: 'nadh',
  fadh2: 'fadh2',
  protonsPumped: 'hPumped',
  oxygenConsumed: 'oxygenConsumed',
  atp: 'atp',
}

export class Counters {
  private readonly valueElements = new Map<keyof JourneyCounters, HTMLElement>()

  constructor(container: HTMLElement, journey: JourneyState) {
    container.classList.add('counters')

    for (const key of ORDER) {
      const item = document.createElement('div')
      item.className = 'counters__item'

      const label = document.createElement('span')
      label.className = 'counters__label'
      label.textContent = content.counters[LABEL_KEY[key]]

      const value = document.createElement('span')
      value.className = 'counters__value'
      value.textContent = '0'

      item.append(label, value)
      container.append(item)
      this.valueElements.set(key, value)
    }

    this.renderValues(journey.current)
    journey.onChange((counters) => this.renderValues(counters))
  }

  private renderValues(counters: Readonly<JourneyCounters>): void {
    for (const [key, element] of this.valueElements) {
      element.textContent = String(counters[key])
    }
  }
}
