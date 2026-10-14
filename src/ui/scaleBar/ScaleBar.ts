import { content } from '../../i18n/content'

export type ZoomTier = 'organelle' | 'crista' | 'molecular'

const NICE_LENGTHS_M = [1e-6, 5e-7, 2.5e-7, 1e-7, 5e-8, 2.5e-8, 1e-8, 5e-9]
const MIN_PX = 60
const MAX_PX = 160

function formatLength(meters: number): string {
  if (meters >= 1e-6) return `${meters / 1e-6} µm`
  return `${Math.round(meters / 1e-9)} nm`
}

/**
 * A real ruler: its length follows the zoom, so it never implies a wrong size.
 * The zoom tier (organite / crête / moléculaire) is shown underneath.
 */
export class ScaleBar {
  private readonly track: HTMLElement
  private readonly length: HTMLElement
  private readonly tierLabel: HTMLElement
  private readonly announcement: HTMLElement
  private currentTier: ZoomTier | null = null
  private announcementTimeout: ReturnType<typeof setTimeout> | null = null
  private lastPxPerMeter = 0

  constructor(private readonly container: HTMLElement) {
    this.container.classList.add('scale-bar')

    this.track = document.createElement('div')
    this.track.className = 'scale-bar__track'

    this.length = document.createElement('span')
    this.length.className = 'scale-bar__length'

    this.tierLabel = document.createElement('span')
    this.tierLabel.className = 'scale-bar__label'

    this.announcement = document.createElement('span')
    this.announcement.className = 'scale-bar__announcement'
    this.announcement.setAttribute('role', 'status')

    this.container.append(this.track, this.length, this.tierLabel, this.announcement)
  }

  setTier(tier: ZoomTier, changeFactor?: number): void {
    const changed = tier !== this.currentTier
    this.currentTier = tier
    this.tierLabel.textContent = content.scaleBar[tier]
    this.track.dataset.tier = tier

    if (changed && changeFactor) {
      this.announcement.textContent = `× ${changeFactor}`
      if (this.announcementTimeout) clearTimeout(this.announcementTimeout)
      this.announcementTimeout = setTimeout(() => {
        this.announcement.textContent = ''
      }, 2500)
    }
  }

  /** @param pxPerMeter on-screen CSS pixels per real-world meter at the subject's depth. */
  setPixelsPerMeter(pxPerMeter: number): void {
    if (Math.abs(pxPerMeter - this.lastPxPerMeter) < this.lastPxPerMeter * 0.005) return
    this.lastPxPerMeter = pxPerMeter
    const fitting = NICE_LENGTHS_M.find((m) => m * pxPerMeter <= MAX_PX) ?? NICE_LENGTHS_M[NICE_LENGTHS_M.length - 1]
    const px = Math.max(MIN_PX / 2, fitting * pxPerMeter)
    this.track.style.width = `${px.toFixed(1)}px`
    this.length.textContent = formatLength(fitting)
  }
}
