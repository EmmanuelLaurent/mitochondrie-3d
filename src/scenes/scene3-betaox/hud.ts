import { content } from '../../i18n/content'
import type { TemplateValues } from '../../i18n/fill'
import { fillTemplate } from '../../i18n/fill'

const text = content.scenes.scene3

export interface LynenState {
  turn: number
  reaction: number
  carbonsBefore: number
  done: boolean
}

/**
 * « Hélice de Lynen » (replaces « Vous êtes ici », which would always read « Matrice »
 * here): the turn under way out of seven, its four reactions as numbered pips (the one
 * under way highlighted, never by colour alone: it is also outlined and announced), and
 * the shortening of the chain.
 */
export class LynenGauge {
  readonly element: HTMLElement
  private readonly turnLine: HTMLElement
  private readonly changeLine: HTMLElement
  private readonly pips: HTMLElement[] = []
  private shown = ''

  constructor(
    container: HTMLElement,
    private readonly values: TemplateValues,
  ) {
    this.element = document.createElement('aside')
    this.element.className = 'depth-gauge lynen-gauge'
    this.element.setAttribute('aria-label', text.lynen.title)
    const title = document.createElement('p')
    title.className = 'depth-gauge__title hud-label'
    title.textContent = text.lynen.title
    this.turnLine = document.createElement('p')
    this.turnLine.className = 'lynen-gauge__turn'
    const list = document.createElement('ol')
    list.className = 'lynen-gauge__pips'
    text.lynen.reactions.forEach((label, i) => {
      const item = document.createElement('li')
      item.className = 'lynen-gauge__pip'
      const badge = document.createElement('span')
      badge.className = 'lynen-gauge__badge'
      badge.textContent = String(i + 1)
      badge.setAttribute('aria-hidden', 'true')
      const name = document.createElement('span')
      name.className = 'lynen-gauge__name'
      name.textContent = label
      item.append(badge, name)
      list.append(item)
      this.pips.push(item)
    })
    this.changeLine = document.createElement('p')
    this.changeLine.className = 'lynen-gauge__change'
    this.element.append(title, this.turnLine, list, this.changeLine)
    container.append(this.element)
  }

  set(state: LynenState): void {
    const key = `${state.turn}:${state.reaction}:${state.done}`
    if (key === this.shown) return
    this.shown = key
    const total = this.values.turns
    this.turnLine.textContent = state.done
      ? fillTemplate(text.lynen.done, this.values)
      : fillTemplate(text.lynen.turn, { ...this.values, n: state.turn, total })
    const last = state.turn === Number(total)
    const after = last ? 2 : state.carbonsBefore - 2
    this.changeLine.textContent = fillTemplate(text.lynen.change, { from: state.carbonsBefore, to: last ? `${after} + C${after}` : after })
    this.pips.forEach((pip, i) => {
      const index = i + 1
      pip.classList.toggle('is-active', !state.done && index === state.reaction)
      pip.classList.toggle('is-done', state.done || index < state.reaction)
      if (!state.done && index === state.reaction) pip.setAttribute('aria-current', 'step')
      else pip.removeAttribute('aria-current')
    })
  }

  dispose(): void {
    this.element.remove()
  }
}

/**
 * The Krebs box's label: its name with the « Simplification » chip (one button, which
 * opens the black-box explanation), and how many acetyl-CoA went in.
 */
export function createBoxLabel(onOpen: () => void): { element: HTMLElement; count: HTMLElement } {
  const element = document.createElement('div')
  element.className = 'box-label'
  const name = document.createElement('button')
  name.type = 'button'
  name.className = 'scene-label box-label__name'
  const chip = document.createElement('span')
  chip.className = 'box-label__chip'
  chip.textContent = content.ui.simplification
  name.append(text.proteins.krebs, ' ', chip)
  name.addEventListener('click', onOpen)
  const count = document.createElement('span')
  count.className = 'box-label__count'
  count.hidden = true
  element.append(name, count)
  return { element, count }
}
