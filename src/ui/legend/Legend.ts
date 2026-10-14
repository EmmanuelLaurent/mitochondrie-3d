import { content } from '../../i18n/content'
import { COMPARTMENT_COLORS } from '../../config/palette'

type LegendKey = keyof typeof content.legend.items
type CompartmentKey = keyof typeof content.legend.compartments

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

// Compartments: colour + texture (bilayer band, clear fluid, granules), mirroring the 3D cut.
const COMPARTMENT_SWATCHES: Record<CompartmentKey, { color: string; texture: 'bilayer' | 'fluid' | 'granular' }> = {
  outerMembrane: { color: COMPARTMENT_COLORS.outerMembrane.section, texture: 'bilayer' },
  intermembraneSpace: { color: COMPARTMENT_COLORS.intermembraneSpace.fluid, texture: 'fluid' },
  innerMembrane: { color: COMPARTMENT_COLORS.innerMembrane.section, texture: 'bilayer' },
  matrix: { color: COMPARTMENT_COLORS.matrix.section, texture: 'granular' },
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

    const body = document.createElement('div')
    body.className = 'legend__body'

    const compartments = document.createElement('ul')
    compartments.className = 'legend__list'
    for (const [key, item] of Object.entries(content.legend.compartments) as [CompartmentKey, { label: string }][]) {
      const { color, texture } = COMPARTMENT_SWATCHES[key]
      const swatch = document.createElement('span')
      swatch.className = `legend__swatch legend__swatch--${texture}`
      swatch.style.setProperty('--swatch', color)
      swatch.setAttribute('aria-hidden', 'true')
      compartments.append(this.entry(swatch, item.label))
    }

    const molecules = document.createElement('ul')
    molecules.className = 'legend__list'
    for (const [key, item] of Object.entries(content.legend.items) as [LegendKey, { label: string }][]) {
      const swatch = document.createElement('span')
      swatch.className = 'legend__swatch'
      swatch.setAttribute('aria-hidden', 'true')
      swatch.textContent = ELEMENT_GLYPHS[key]
      const entry = this.entry(swatch, item.label)
      entry.classList.add(`legend__item--${key}`)
      molecules.append(entry)
    }

    body.append(this.heading(content.legend.compartmentsTitle), compartments, this.heading(content.legend.moleculesTitle), molecules)

    toggle.addEventListener('click', () => this.setExpanded(toggle, body, !this.expanded))
    this.container.append(toggle, body)
    this.setExpanded(toggle, body, this.expanded)
  }

  private heading(text: string): HTMLElement {
    const heading = document.createElement('p')
    heading.className = 'legend__heading hud-label'
    heading.textContent = text
    return heading
  }

  private entry(swatch: HTMLElement, text: string): HTMLLIElement {
    const entry = document.createElement('li')
    entry.className = 'legend__item'
    const label = document.createElement('span')
    label.textContent = text
    entry.append(swatch, label)
    return entry
  }

  private setExpanded(button: HTMLButtonElement, body: HTMLElement, expanded: boolean): void {
    this.expanded = expanded
    button.setAttribute('aria-expanded', String(expanded))
    body.hidden = !expanded
  }
}
