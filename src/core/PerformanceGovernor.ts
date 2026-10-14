import type { QualitySettings } from './QualitySettings'
import type { RenderOutcome } from './SceneManager'

/**
 * Steps quality down (once) when interaction can't hold ~30 fps. Measured only on
 * frames rendered while the view changes — the costly case the user actually feels;
 * still-view refinement is allowed to be slow because it converges and then idles.
 */
export class PerformanceGovernor {
  private average = 1 / 60
  private samples = 0
  private enabled = true

  constructor(
    private readonly quality: QualitySettings,
    private readonly maxFrameSeconds = 1 / 30,
    private readonly minSamples = 45,
  ) {}

  /** Stop adjusting (the user picked a quality level explicitly). */
  disable(): void {
    this.enabled = false
  }

  record(deltaSeconds: number, outcome: RenderOutcome): void {
    if (!this.enabled || outcome !== 'changed' || this.quality.current === 'low') return
    if (deltaSeconds > 0.5) return // tab switch or a one-off hitch, not render cost
    this.average = this.average * 0.92 + deltaSeconds * 0.08
    this.samples += 1
    if (this.samples >= this.minSamples && this.average > this.maxFrameSeconds) {
      this.quality.set('low')
    }
  }
}
