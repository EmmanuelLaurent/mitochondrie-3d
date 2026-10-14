export type QualityLevel = 'low' | 'high'

/** Global low/high quality toggle. Scenes read it to scale particle counts, pixel ratio, etc. */
export class QualitySettings {
  private level: QualityLevel
  private readonly listeners = new Set<(level: QualityLevel) => void>()

  constructor(initial: QualityLevel = 'high') {
    this.level = initial
  }

  get current(): QualityLevel {
    return this.level
  }

  set(level: QualityLevel): void {
    if (level === this.level) return
    this.level = level
    for (const listener of this.listeners) listener(level)
  }

  onChange(listener: (level: QualityLevel) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Capped below typical high-DPI ratios on purpose: still frames are supersampled by
   * progressive accumulation, so rendering every physical pixel buys little sharpness
   * for a large cost while the view moves.
   */
  get pixelRatioCap(): number {
    return this.level === 'high' ? 1.5 : 1
  }

  /** Multiplier applied to every scene's base particle count. */
  get particleDensity(): number {
    return this.level === 'high' ? 1 : 0.4
  }
}
