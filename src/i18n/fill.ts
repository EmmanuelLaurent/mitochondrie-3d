/** Values for the {placeholders} of the pedagogical texts (always read from the science config). */
export type TemplateValues = Readonly<Record<string, string | number>>

/** French number typography: decimal comma, true minus sign (U+2212), one decimal at most. */
export function formatNumber(value: number): string {
  const text = Number.isInteger(value) ? String(Math.abs(value)) : Math.abs(value).toFixed(1).replace('.', ',')
  return value < 0 ? `−${text}` : text
}

/** Replaces every {key} found in `values`; unknown placeholders are left visible (easy to spot). */
export function fillTemplate(template: string, values: TemplateValues): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key]
    if (value === undefined) return match
    return typeof value === 'number' ? formatNumber(value) : value
  })
}

/** A filler bound to one set of values. */
export function createFill(values: TemplateValues): (template: string) => string {
  return (template) => fillTemplate(template, values)
}
