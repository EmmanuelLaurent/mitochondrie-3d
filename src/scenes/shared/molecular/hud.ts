import { content } from '../../../i18n/content'

export type SwatchTexture = 'bilayer' | 'fluid' | 'granular' | 'open'

export interface GaugeRow<K extends string> {
  key: K
  label: string
  /** Scene 1's numbered badge ('' for none). */
  badge: string
  color: string
  texture: SwatchTexture
}

/**
 * « Vous êtes ici » : the stack of compartments in the same order as the 3D section,
 * with scene 1's numbered badges and the legend textures, and a marker on the
 * compartment where the followed molecule is.
 */
export class DepthGauge<K extends string> {
  readonly element: HTMLElement
  private readonly rows = new Map<K, HTMLElement>()
  private current: K | null = null

  constructor(container: HTMLElement, rows: readonly GaugeRow<K>[]) {
    this.element = document.createElement('aside')
    this.element.className = 'depth-gauge'
    this.element.setAttribute('aria-label', content.ui.youAreHere)
    const title = document.createElement('p')
    title.className = 'depth-gauge__title hud-label'
    title.textContent = content.ui.youAreHere
    const list = document.createElement('ol')
    list.className = 'depth-gauge__list'
    for (const row of rows) {
      const item = document.createElement('li')
      item.className = 'depth-gauge__row'
      const swatch = document.createElement('span')
      swatch.className = `depth-gauge__swatch legend__swatch--${row.texture}`
      swatch.style.setProperty('--swatch', row.color)
      swatch.setAttribute('aria-hidden', 'true')
      if (row.badge) swatch.textContent = row.badge
      const label = document.createElement('span')
      label.textContent = row.label
      item.append(swatch, label)
      list.append(item)
      this.rows.set(row.key, item)
    }
    this.element.append(title, list)
    container.append(this.element)
  }

  set(key: K): void {
    if (key === this.current) return
    this.current = key
    for (const [rowKey, row] of this.rows) {
      if (rowKey === key) row.setAttribute('aria-current', 'location')
      else row.removeAttribute('aria-current')
    }
  }

  dispose(): void {
    this.element.remove()
  }
}

export interface RecapOptions {
  title: string
  keyMessage: string
  /** Optional diagram (SVG markup in a 300-wide viewBox) with its text alternative. */
  map?: { svg: string; viewBox: string; label: string }
  net: string
  bridge: string
  nextChapter: string
  onNext: (() => void) | null
  onQuiz: () => void
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** End-of-chapter card: key message, actions, optional map, net balance, bridge to the next chapter. */
export function createRecapCard(options: RecapOptions): HTMLElement {
  const card = document.createElement('aside')
  card.className = 'scene2-card scene2-card--recap'
  const title = document.createElement('p')
  title.className = 'scene2-card__title hud-label'
  title.textContent = options.title
  const key = document.createElement('p')
  key.className = 'scene2-card__key'
  key.textContent = options.keyMessage
  card.append(title, key)
  // The actions come right after the key message: visible without scrolling on small screens.
  const actions = document.createElement('div')
  actions.className = 'scene2-card__actions'
  card.append(actions)
  if (options.map) {
    const map = document.createElementNS(SVG_NS, 'svg')
    map.setAttribute('viewBox', options.map.viewBox)
    map.setAttribute('class', 'scene2-card__map')
    map.setAttribute('role', 'img')
    map.setAttribute('aria-label', options.map.label)
    map.innerHTML = options.map.svg
    card.append(map)
  }
  const net = document.createElement('p')
  net.className = 'scene2-card__body'
  net.textContent = options.net
  const bridge = document.createElement('p')
  bridge.className = 'scene2-card__body scene2-card__body--dim'
  bridge.textContent = options.bridge
  const next = document.createElement('button')
  next.type = 'button'
  next.className = 'scene2-card__next'
  next.textContent = content.player.nextChapter.replace('{title}', options.nextChapter)
  if (options.onNext) next.addEventListener('click', options.onNext)
  else {
    next.disabled = true
    next.title = content.chapters.upcoming
    next.textContent += ` (${content.chapters.upcoming})`
  }
  const quiz = document.createElement('button')
  quiz.type = 'button'
  quiz.className = 'quiz-open'
  quiz.textContent = content.quiz.open
  quiz.addEventListener('click', options.onQuiz)
  actions.append(quiz, next)
  card.append(net, bridge)
  return card
}
