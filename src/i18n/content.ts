import fr from '../../content/fr.json'

const NBSP = ' '
const NARROW_NBSP = ' '

/**
 * French typography, applied once to every string: a non-breaking space before
 * « : » and a narrow one before « ; ? ! » and inside guillemets, so that punctuation
 * never starts a line; and a non-breaking space between a number (or a {placeholder}
 * that will hold one) and the word after it, so that « 10 nm » or « 2 ATP » never splits.
 */
export function typeset(text: string): string {
  return text
    .replace(/ ([;?!»])/g, `${NARROW_NBSP}$1`)
    .replace(/« /g, `«${NARROW_NBSP}`)
    .replace(/ :/g, `${NBSP}:`)
    .replace(/([\d}]) (?=[A-Za-zÀ-ÿµ%°])/g, `$1${NBSP}`)
}

function typesetDeep<T>(value: T): T {
  if (typeof value === 'string') return typeset(value) as T
  if (Array.isArray(value)) return value.map((item: unknown) => typesetDeep(item)) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typesetDeep(item)])) as T
  }
  return value
}

/**
 * The single source of all user-facing text (CLAUDE.md: "jamais de texte
 * pédagogique en dur dans le code"). `resolveJsonModule` gives this a precise
 * structural type for free — import from here, never read the JSON file directly.
 */
export const content = typesetDeep(fr)
