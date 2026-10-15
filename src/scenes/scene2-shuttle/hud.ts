import { COMPARTMENT_COLORS, MOLECULE_COLORS } from '../../config/palette'
import { content } from '../../i18n/content'

const text = content.scenes.scene2

/** viewBox of the route map. */
export const ROUTE_MAP_VIEWBOX = '0 0 300 180'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** « Ce qui n'arrive pas » : palmitoyl-CoA, arrow through the inner membrane, crossed out. */
export function createNotHappeningCard(): HTMLElement {
  const card = document.createElement('aside')
  card.className = 'scene2-card scene2-card--inset'
  const title = document.createElement('p')
  title.className = 'scene2-card__title hud-label'
  title.textContent = text.notHappening.title
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 160 92')
  svg.setAttribute('aria-hidden', 'true')
  const chain = Array.from({ length: 8 }, (_, i) => `<circle cx="${22 + i * 5}" cy="${i % 2 ? 19 : 15}" r="2.6" fill="${MOLECULE_COLORS.carbonChain}"/>`).join('')
  svg.innerHTML = `
    <rect x="0" y="44" width="160" height="16" fill="${COMPARTMENT_COLORS.innerMembrane.section}" opacity="0.85"/>
    <line x1="0" y1="46" x2="160" y2="46" stroke="${COMPARTMENT_COLORS.innerMembrane.surface}" stroke-width="3" stroke-dasharray="2 2.2"/>
    <line x1="0" y1="58" x2="160" y2="58" stroke="${COMPARTMENT_COLORS.innerMembrane.surface}" stroke-width="3" stroke-dasharray="2 2.2"/>
    ${chain}
    <circle cx="66" cy="17" r="3" fill="${MOLECULE_COLORS.thiol}"/>
    <circle cx="72" cy="17" r="2.2" fill="${MOLECULE_COLORS.coa}"/>
    <circle cx="77" cy="17" r="2.2" fill="${MOLECULE_COLORS.coa}"/>
    <circle cx="86" cy="17" r="6" fill="${MOLECULE_COLORS.coa}"/>
    <path d="M58 26 L58 76" stroke="#eef2f7" stroke-width="2" fill="none" stroke-dasharray="4 3"/>
    <path d="M52 70 L58 79 L64 70" stroke="#eef2f7" stroke-width="2" fill="none"/>
    <path d="M44 38 L72 66 M72 38 L44 66" stroke="#f0a85c" stroke-width="4" stroke-linecap="round"/>
  `
  const caption = document.createElement('p')
  caption.className = 'scene2-card__caption'
  caption.textContent = text.notHappening.caption
  card.append(title, svg, caption)
  return card
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * « Carte du trajet » : the whole shuttle in one diagram (what the follow-cam cannot
 * show at once): the five layers, the four enzymes and the porin, the palmitoyl group's
 * one-way route, the carnitine loop and the two separate CoA pools.
 */
export function routeMapSvg(): string {
  const p = text.proteins
  const band = (y: number, h: number, color: string, opacity: number): string =>
    `<rect x="0" y="${y}" width="300" height="${h}" fill="${color}" opacity="${opacity}"/>`
  // Labels at ~11 px on screen (the map is drawn ~320 px wide): pills sized to their names.
  const enzyme = (x: number, y: number, w: number, label: string): string =>
    `<rect x="${x - w / 2}" y="${y - 9}" width="${w}" height="18" rx="8" fill="#a9bba8"/>` +
    `<text x="${x}" y="${y + 3.7}" text-anchor="middle" class="map-enzyme">${escapeXml(label)}</text>`
  const carnitine = MOLECULE_COLORS.carnitine
  return `
    ${band(0, 40, '#3a4656', 0.35)}
    ${band(40, 14, COMPARTMENT_COLORS.outerMembrane.section, 0.9)}
    ${band(54, 50, COMPARTMENT_COLORS.intermembraneSpace.fluid, 0.35)}
    ${band(104, 14, COMPARTMENT_COLORS.innerMembrane.section, 0.9)}
    ${band(118, 62, COMPARTMENT_COLORS.matrix.section, 0.22)}
    <text x="296" y="13" text-anchor="end" class="map-layer">${escapeXml(text.compartments.cytosol)}</text>
    <text x="4" y="175" class="map-layer">${escapeXml(text.compartments.matrix)}</text>
    ${enzyme(44, 26, 38, text.recap.acslShort)}
    ${enzyme(100, 40, 42, p.cpt1)}
    <rect x="130" y="40" width="16" height="14" rx="3" fill="#a9bba8"/>
    <text x="150" y="50.5" class="map-note" fill="#1d2731">${escapeXml(p.porin)}</text>
    ${enzyme(188, 111, 44, p.cact)}
    ${enzyme(240, 130, 44, p.cpt2)}
    <path d="M8 14 C 14 18, 20 23, 25 26 M 63 26 C 70 28, 74 33, 79 37 M 121 40 C 128 40, 134 40, 138 44 L 138 74 C 142 88, 168 94, 182 101 M 194 120 C 202 128, 210 131, 218 131 M 262 132 C 272 142, 278 152, 284 162"
      fill="none" stroke="#8ee6fa" stroke-width="2" stroke-dasharray="5 3"/>
    <path d="M285.5 164.6 L 280.7 161.6 L 285.2 158.9 Z" fill="#8ee6fa"/>
    <path d="M232 140 C 222 158, 194 156, 186 121" fill="none" stroke="${carnitine}" stroke-width="1.6" stroke-dasharray="3 2"/>
    <path d="M196 102 C 184 80, 150 76, 143 66 L 143 34 C 141 26, 128 22, 120 27" fill="none" stroke="${carnitine}" stroke-width="1.6" stroke-dasharray="3 2"/>
    <path d="M117.3 28.7 L 123 28.7 L 119.8 23.6 Z" fill="${carnitine}"/>
    <text x="204" y="74" class="map-note" fill="${carnitine}">${escapeXml(text.tags.carnitine)} ↺</text>
    <circle cx="82" cy="9" r="4.5" fill="${MOLECULE_COLORS.coa}"/>
    <text x="90" y="12.5" class="map-note" fill="${MOLECULE_COLORS.coa}">${escapeXml(text.recap.mapCoaCytosol)}</text>
    <circle cx="150" cy="168" r="4.5" fill="${MOLECULE_COLORS.coa}"/>
    <text x="158" y="171.5" class="map-note" fill="${MOLECULE_COLORS.coa}">${escapeXml(text.recap.mapCoaMatrix)}</text>
  `
}
