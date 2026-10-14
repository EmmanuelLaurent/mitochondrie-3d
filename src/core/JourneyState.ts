export interface JourneyCounters {
  acetylCoA: number
  nadh: number
  fadh2: number
  protonsPumped: number
  oxygenConsumed: number
  atp: number
}

const INITIAL_COUNTERS: JourneyCounters = {
  acetylCoA: 0,
  nadh: 0,
  fadh2: 0,
  protonsPumped: 0,
  oxygenConsumed: 0,
  atp: 0,
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
