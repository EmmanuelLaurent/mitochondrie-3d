import * as THREE from 'three'

/** Space kept under the top of the picture when there is no chapter bar to measure (CSS px). */
const TOP_HUD_PX = 80

/** Gap kept under the chapter bar (CSS px). */
const TOP_HUD_GAP = 8

/**
 * Share of the view height the free band had when the storyboard shots were framed
 * (1600 × 900, chapter bar at the top, narration panel at the bottom). When the band is
 * shorter (taller player, small screen, Moodle iframe), the camera backs off so the
 * subject keeps the same size relative to the band.
 */
const DESIGN_FREE_SHARE = 0.7

/** Never back off more than this (the molecules would become too small to read). */
const MAX_FIT = 1.5

/**
 * The free band of the picture, between the chapter bar and the narration panel: a
 * storyboard shot centres its subject in this band, not in the canvas (the panel covers
 * a quarter of the bottom). Measured from the layout and kept up to date on resize:
 * `lift` is the fraction of the view height by which the target is raised, `fit` the
 * factor applied to the shot distance when the band is shorter than designed.
 */
export class FramingBand {
  private liftValue = 0.06
  private fitValue = 1
  private readonly observer: ResizeObserver

  constructor(
    private readonly container: HTMLElement,
    private readonly player: HTMLElement,
    private readonly onChange: () => void,
  ) {
    this.observer = new ResizeObserver(() => this.measure())
    this.observer.observe(container)
    this.observer.observe(player)
    const bar = document.getElementById('chapter-bar')
    if (bar) this.observer.observe(bar)
    const counters = document.getElementById('counters-panel')
    if (counters) this.observer.observe(counters)
    this.measure()
  }

  get lift(): number {
    return this.liftValue
  }

  get fit(): number {
    return this.fitValue
  }

  private measure(): void {
    const height = this.container.clientHeight
    if (height <= 0) return
    const top = this.container.getBoundingClientRect().top
    const box = this.player.getBoundingClientRect()
    const panelTop = box.height > 0 ? box.top - top : height
    // Cards placed between the counters and the narration panel stop above the panel, and
    // start under the counters panel (taller once its footnotes show).
    this.container.style.setProperty('--free-bottom', `${Math.max(0, height - panelTop).toFixed(0)}px`)
    const counters = document.getElementById('counters-panel')?.getBoundingClientRect()
    if (counters && counters.height > 0) this.container.style.setProperty('--cards-top', `${(counters.bottom - top + 8).toFixed(0)}px`)
    const bar = document.getElementById('chapter-bar')?.getBoundingClientRect()
    const topHud = bar && bar.height > 0 ? bar.bottom - top + TOP_HUD_GAP : TOP_HUD_PX
    const bottom = Math.min(height, panelTop)
    const centre = (topHud + bottom) / 2
    const lift = THREE.MathUtils.clamp((height / 2 - centre) / height, 0, 0.16)
    const fit = THREE.MathUtils.clamp((DESIGN_FREE_SHARE * height) / Math.max(1, bottom - topHud), 1, MAX_FIT)
    if (Math.abs(lift - this.liftValue) < 1e-3 && Math.abs(fit - this.fitValue) < 1e-3) return
    this.liftValue = lift
    this.fitValue = fit
    this.onChange()
  }

  dispose(): void {
    this.observer.disconnect()
    this.container.style.removeProperty('--free-bottom')
    this.container.style.removeProperty('--cards-top')
  }
}
