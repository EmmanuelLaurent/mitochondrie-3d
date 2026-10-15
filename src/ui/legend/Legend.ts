import { content } from '../../i18n/content'
import { COMPARTMENT_COLORS, MOLECULE_COLORS } from '../../config/palette'

export type LegendKey = keyof typeof content.legend.items
type CompartmentKey = keyof typeof content.legend.compartments

// The shape is the real differentiator (colour is never the sole carrier of meaning).
const ELEMENT_GLYPHS: Partial<Record<LegendKey, string>> = {}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** A phosphate: a small tetrahedron seen as a triangle (spheres are reserved for H⁺ and O₂). */
function phosphateSvg(cx: number): string {
  return `<polygon points="${cx},5.2 ${cx + 3.9},12.6 ${cx - 3.9},12.6" fill="${MOLECULE_COLORS.phosphate}"/>`
}

/**
 * Adenine nucleotides: a hexagon (adenosine), filled when charged (ATP) and a ring
 * otherwise, followed by one tetrahedron per phosphate: ATP 3, ADP 2, AMP 1.
 */
function nucleotideSvg(color: string, phosphates: number, filled: boolean): string {
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6
    return `${(7.5 + 6.8 * Math.cos(a)).toFixed(2)},${(10 + 6.8 * Math.sin(a)).toFixed(2)}`
  }).join(' ')
  const body = filled
    ? `<polygon points="${hex}" fill="${color}"/>`
    : `<polygon points="${hex}" fill="none" stroke="${color}" stroke-width="2.4"/>`
  const link = `<line x1="14" y1="10" x2="${14 + phosphates * 7.5}" y2="10" stroke="#8e97a3" stroke-width="1"/>`
  return body + link + Array.from({ length: phosphates }, (_, i) => phosphateSvg(19 + i * 7.5)).join('')
}

/** A flat pill (NAD⁺/NADH, FAD/FADH₂): hollow when oxidized, filled when reduced. */
function pillSvg(x: number, color: string, filled: boolean, band = false): string {
  const outer = `<rect x="${x}" y="6.2" width="14" height="7.6" rx="3.8" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="${filled ? 0 : 2}"/>`
  return outer + (band ? `<rect x="${x + 6.1}" y="5.4" width="1.8" height="9.2" fill="${MOLECULE_COLORS.fadBand}"/>` : '')
}

/** A lightning bolt (e⁻). */
const boltSvg = (x: number): string =>
  `<polygon points="${x + 1},2 ${x + 6.5},2 ${x + 3.8},8.6 ${x + 7.4},8.6 ${x - 0.4},18 ${x + 2.2},10.6 ${x - 1.4},10.6" fill="${MOLECULE_COLORS.electron}"/>`

// Bead-model molecules: small SVG silhouettes matching the 3D shapes of scene 2 onward.
const ELEMENT_SVGS: Partial<Record<LegendKey, string>> = {
  nadh: pillSvg(2, MOLECULE_COLORS.nad, false) + pillSvg(19, MOLECULE_COLORS.nad, true),
  fadh2: pillSvg(2, MOLECULE_COLORS.fad, false, true) + pillSvg(19, MOLECULE_COLORS.fad, true, true),
  acetylCoA:
    `<polygon points="8,3 12.5,10 8,17 3.5,10" fill="${MOLECULE_COLORS.acetyl}"/>` +
    Array.from({ length: 3 }, (_, i) => `<circle cx="${15.5 + i * 3.8}" cy="${i % 2 ? 11 : 9}" r="1.8" fill="${MOLECULE_COLORS.coa}"/>`).join('') +
    `<circle cx="30" cy="10" r="4.6" fill="${MOLECULE_COLORS.coa}"/>`,
  electron: boltSvg(14),
  proton: `<circle cx="18" cy="10" r="5" fill="${MOLECULE_COLORS.proton}"/>`,
  oxygen: `<circle cx="14.6" cy="10" r="4.6" fill="${MOLECULE_COLORS.oxygen}"/><circle cx="21.4" cy="10" r="4.6" fill="${MOLECULE_COLORS.oxygen}"/>`,
  water: `<path d="M11 15 L18 6 L25 15" fill="none" stroke="${MOLECULE_COLORS.water}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  co2:
    `<line x1="10" y1="10" x2="26" y2="10" stroke="${MOLECULE_COLORS.carbonylOxygen}" stroke-width="1.6"/>` +
    `<circle cx="10" cy="10" r="3.2" fill="${MOLECULE_COLORS.carbonylOxygen}"/><circle cx="18" cy="10" r="3.4" fill="${MOLECULE_COLORS.carbonChain}"/><circle cx="26" cy="10" r="3.2" fill="${MOLECULE_COLORS.carbonylOxygen}"/>`,
  gtp:
    `<polygon points="7.5,3.2 14,7.9 11.5,15.6 3.5,15.6 1,7.9" fill="${MOLECULE_COLORS.gtp}"/>` +
    `<line x1="14" y1="10" x2="36" y2="10" stroke="#8e97a3" stroke-width="1"/>` +
    [19, 26.5, 34].map((cx) => phosphateSvg(cx)).join(''),
  atp: nucleotideSvg(MOLECULE_COLORS.atp, 3, true),
  adp: nucleotideSvg(MOLECULE_COLORS.adp, 2, false),
  amp: nucleotideSvg(MOLECULE_COLORS.amp, 1, false),
  pyrophosphate:
    `<line x1="7" y1="10" x2="14" y2="10" stroke="#8e97a3" stroke-width="1"/>` +
    phosphateSvg(7) +
    phosphateSvg(14) +
    phosphateSvg(28),
  carbonChain: Array.from({ length: 7 }, (_, i) => `<circle cx="${5 + i * 4.3}" cy="${i % 2 ? 11.5 : 8.5}" r="2.6" fill="${MOLECULE_COLORS.carbonChain}"/>`).join(''),
  coa:
    `<circle cx="5" cy="10" r="2.6" fill="${MOLECULE_COLORS.thiol}"/>` +
    Array.from({ length: 4 }, (_, i) => `<circle cx="${9.5 + i * 4}" cy="${i % 2 ? 11 : 9}" r="2" fill="${MOLECULE_COLORS.coa}"/>`).join('') +
    `<circle cx="28" cy="10" r="5.5" fill="${MOLECULE_COLORS.coa}"/>`,
  carnitine:
    `<circle cx="8" cy="10" r="2" fill="${MOLECULE_COLORS.carbonylOxygen}"/><circle cx="12" cy="10" r="2.3" fill="${MOLECULE_COLORS.carnitine}"/>` +
    `<circle cx="16" cy="10" r="2.6" fill="${MOLECULE_COLORS.carnitine}"/>` +
    [0, 1, 2].map((k) => {
      const a = (k / 3) * Math.PI * 2 - Math.PI / 2
      return `<circle cx="${(21 + 3.6 * Math.cos(a)).toFixed(2)}" cy="${(10 + 3.6 * Math.sin(a)).toFixed(2)}" r="2.6" fill="${MOLECULE_COLORS.carnitine}"/>`
    }).join(''),
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
  private toggle: HTMLButtonElement | null = null
  private toggleCount: HTMLElement | null = null
  private body: HTMLElement | null = null
  private readonly entries = new Map<LegendKey, HTMLLIElement>()

  constructor(
    private readonly container: HTMLElement,
    initiallyExpanded = false,
  ) {
    this.expanded = initiallyExpanded
    this.render()
  }

  /** Opens or closes the panel (a chapter can open it to introduce new molecules). */
  setExpanded(expanded: boolean): void {
    if (this.toggle && this.body) this.applyExpanded(this.toggle, this.body, expanded)
  }

  /**
   * Marks the molecules a chapter introduces with a "nouveau" tag, and says how many on
   * the (closed) toggle, so the panel never pops open over the scene.
   */
  setHighlighted(keys: readonly LegendKey[]): void {
    for (const [key, entry] of this.entries) {
      const highlighted = keys.includes(key)
      entry.classList.toggle('legend__item--new', highlighted)
      entry.querySelector('.legend__new')?.toggleAttribute('hidden', !highlighted)
    }
    if (this.toggleCount) {
      this.toggleCount.hidden = keys.length === 0
      this.toggleCount.textContent = content.legend.newCount.replace('{count}', String(keys.length))
    }
  }

  private render(): void {
    this.container.classList.add('legend')

    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'legend__toggle'
    const toggleLabel = document.createElement('span')
    toggleLabel.textContent = content.legend.title
    const toggleCount = document.createElement('span')
    toggleCount.className = 'legend__toggle-count'
    toggleCount.hidden = true
    toggleLabel.append(toggleCount)
    toggle.append(toggleLabel)
    this.toggleCount = toggleCount

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
      swatch.setAttribute('aria-hidden', 'true')
      const svg = ELEMENT_SVGS[key]
      if (svg) {
        swatch.className = 'legend__swatch legend__swatch--svg'
        const element = document.createElementNS(SVG_NS, 'svg')
        element.setAttribute('viewBox', '0 0 36 20')
        element.innerHTML = svg
        swatch.append(element)
      } else {
        swatch.className = 'legend__swatch'
        swatch.textContent = ELEMENT_GLYPHS[key] ?? ''
      }
      const entry = this.entry(swatch, item.label)
      entry.classList.add(`legend__item--${key}`)
      const tag = document.createElement('span')
      tag.className = 'legend__new'
      tag.textContent = content.legend.newInChapter
      tag.hidden = true
      entry.append(tag)
      molecules.append(entry)
      this.entries.set(key, entry)
    }

    body.append(this.heading(content.legend.compartmentsTitle), compartments, this.heading(content.legend.moleculesTitle), molecules)

    toggle.addEventListener('click', () => this.applyExpanded(toggle, body, !this.expanded))
    this.container.append(toggle, body)
    this.toggle = toggle
    this.body = body
    this.applyExpanded(toggle, body, this.expanded)
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

  private applyExpanded(button: HTMLButtonElement, body: HTMLElement, expanded: boolean): void {
    this.expanded = expanded
    button.setAttribute('aria-expanded', String(expanded))
    body.hidden = !expanded
  }
}
