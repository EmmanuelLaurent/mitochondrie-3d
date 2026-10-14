import { content } from '../../i18n/content'

type LegendKey = keyof typeof content.legend.items

// The shape is the real differentiator (colour is never the sole carrier of meaning).
const ELEMENT_GLYPHS: Record<LegendKey, string> = {
  electron: '⚡',
  proton: '●',
  nadh: '⬭',
  fadh2: '⬮',
  atp: '⬡',
  adp: '⬠',
  oxygen: '◍',
  acetylCoA: '◆',
  carbonChain: '⸺',
}

/** Collapsed by default ("panneau rappelable", SPEC §0) so it never covers the scene; always one click away. */
export class Legend {
  private expanded: boolean

  constructor(
    private readonly container: HTMLElement,
    initiallyExpanded = false,
  ) {
    this.expanded = initiallyExpanded
    this.render()
  }

  private render(): void {
    this.container.classList.add('legend')

    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'legend__toggle'
    toggle.textContent = content.legend.title

    const list = document.createElement('ul')
    list.className = 'legend__list'

    for (const [key, item] of Object.entries(content.legend.items) as [LegendKey, { label: string }][]) {
      const entry = document.createElement('li')
      entry.className = `legend__item legend__item--${key}`

      const swatch = document.createElement('span')
      swatch.className = 'legend__swatch'
      swatch.setAttribute('aria-hidden', 'true')
      swatch.textContent = ELEMENT_GLYPHS[key]

      const label = document.createElement('span')
      label.textContent = item.label

      entry.append(swatch, label)
      list.append(entry)
    }

    toggle.addEventListener('click', () => this.setExpanded(toggle, list, !this.expanded))
    this.container.append(toggle, list)
    this.setExpanded(toggle, list, this.expanded)
  }

  private setExpanded(button: HTMLButtonElement, list: HTMLUListElement, expanded: boolean): void {
    this.expanded = expanded
    button.setAttribute('aria-expanded', String(expanded))
    list.hidden = !expanded
  }
}
