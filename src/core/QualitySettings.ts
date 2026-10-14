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

  get pixelRatioCap(): number {
    return this.level === 'high' ? 2 : 1
  }

  get antialias(): boolean {
    return this.level === 'high'
  }

  /** Multiplier applied to every scene's base particle count. */
  get particleDensity(): number {
    return this.level === 'high' ? 1 : 0.4
  }
}
