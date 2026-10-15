export interface JourneyCounters {
  acetylCoA: number
  nadh: number
  fadh2: number
  protonsPumped: number
  oxygenConsumed: number
  /** Net ATP balance (activation cost already subtracted). */
  atp: number
  /** ATP equivalents invested in the activation (shown as a footnote of the net balance). */
  atpInvested: number
  /** GTP made by the Krebs cycle, already counted in the net ATP balance (shown as a footnote). */
  gtp: number
}

const INITIAL_COUNTERS: JourneyCounters = {
  acetylCoA: 0,
  nadh: 0,
  fadh2: 0,
  protonsPumped: 0,
  oxygenConsumed: 0,
  atp: 0,
  atpInvested: 0,
  gtp: 0,
}

/** The counters at the start of a chapter, so any chapter can be entered directly. */
export function countersAtChapterStart(overrides: Partial<JourneyCounters> = {}): JourneyCounters {
  return { ...INITIAL_COUNTERS, ...overrides }
}

/**
 * The persistent counters for the single palmitate molecule being followed
 * (CLAUDE.md "On suit une seule molécule de palmitate du début à la fin").
 * Scenes 3-5 call add*(); the UI counters panel only ever reads `current`.
 */
export class JourneyState {
  private counters: JourneyCounters = { ...INITIAL_COUNTERS }
  private readonly listeners = new Set<(counters: JourneyCounters) => void>()

  get current(): Readonly<JourneyCounters> {
    return this.counters
  }

  onChange(listener: (counters: Readonly<JourneyCounters>) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  add(delta: Partial<JourneyCounters>): void {
    this.counters = { ...this.counters, ...this.mergeAdd(delta) }
    for (const listener of this.listeners) listener(this.counters)
  }

  /**
   * Absolute values. Narrated scenes derive the counters from their playhead (so
   * stepping backwards or seeking keeps them right) and call this on every update:
   * listeners only hear about actual changes.
   */
  set(values: Partial<JourneyCounters>): void {
    const next = { ...this.counters, ...values }
    const changed = (Object.keys(next) as (keyof JourneyCounters)[]).some((key) => next[key] !== this.counters[key])
    if (!changed) return
    this.counters = next
    for (const listener of this.listeners) listener(this.counters)
  }

  reset(): void {
    this.counters = { ...INITIAL_COUNTERS }
    for (const listener of this.listeners) listener(this.counters)
  }

  private mergeAdd(delta: Partial<JourneyCounters>): JourneyCounters {
    const next = { ...this.counters }
    for (const key of Object.keys(delta) as (keyof JourneyCounters)[]) {
      next[key] = this.counters[key] + (delta[key] ?? 0)
    }
    return next
  }
}
