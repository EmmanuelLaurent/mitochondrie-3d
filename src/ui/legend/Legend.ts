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

export class Legend {
  private expanded = true

  constructor(private readonly container: HTMLElement) {
    this.render()
  }

  private render(): void {
    this.container.classList.add('legend')

    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'legend__toggle'
    toggle.textContent = content.legend.title
    toggle.setAttribute('aria-expanded', 'true')

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

    toggle.addEventListener('click', () => this.toggle(toggle, list))
    this.container.append(toggle, list)
  }

  private toggle(button: HTMLButtonElement, list: HTMLUListElement): void {
    this.expanded = !this.expanded
    button.setAttribute('aria-expanded', String(this.expanded))
    list.hidden = !this.expanded
  }
}
