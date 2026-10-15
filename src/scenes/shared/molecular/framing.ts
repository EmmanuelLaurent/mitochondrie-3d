import * as THREE from 'three'

/** Space kept under the chapter bar at the top of the picture (CSS px). */
const TOP_HUD_PX = 80

/**
 * The free band of the picture, between the chapter bar and the narration panel: a
 * storyboard shot centres its subject in this band, not in the canvas (the panel covers
 * a quarter of the bottom). Measured from the layout and kept up to date on resize; the
 * value is the fraction of the view height by which the target is raised.
 */
export class FramingBand {
  private value = 0.06
  private readonly observer: ResizeObserver

  constructor(
    private readonly container: HTMLElement,
    private readonly player: HTMLElement,
    private readonly onChange: () => void,
  ) {
    this.observer = new ResizeObserver(() => this.measure())
    this.observer.observe(container)
    this.observer.observe(player)
    this.measure()
  }

  get lift(): number {
    return this.value
  }

  private measure(): void {
    const height = this.container.clientHeight
    if (height <= 0) return
    const box = this.player.getBoundingClientRect()
    const top = this.container.getBoundingClientRect().top
    const panelTop = box.height > 0 ? box.top - top : height
    // Cards placed between the counters and the narration panel stop above the panel.
    this.container.style.setProperty('--free-bottom', `${Math.max(0, height - panelTop).toFixed(0)}px`)
    const centre = (TOP_HUD_PX + Math.min(height, panelTop)) / 2
    const lift = THREE.MathUtils.clamp((height / 2 - centre) / height, 0, 0.16)
    if (Math.abs(lift - this.value) < 1e-3) return
    this.value = lift
    this.onChange()
  }

  dispose(): void {
    this.observer.disconnect()
    this.container.style.removeProperty('--free-bottom')
  }
}
