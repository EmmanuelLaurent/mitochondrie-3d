/** Values for the {placeholders} of the pedagogical texts (always read from the science config). */
export type TemplateValues = Readonly<Record<string, string | number>>

/**
 * French number typography: decimal comma, true minus sign (U+2212), at most `maxDecimals`
 * decimals (one by default), trailing zeros dropped (0,75 stays 0,75 with 2; 2,50 → 2,5).
 */
export function formatNumber(value: number, maxDecimals = 1): string {
  const magnitude = Math.abs(value)
  const text = Number.isInteger(value) ? String(magnitude) : String(Number(magnitude.toFixed(maxDecimals))).replace('.', ',')
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
