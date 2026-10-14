import { content } from '../../i18n/content'

export type ZoomTier = 'organelle' | 'crista' | 'molecular'

export class ScaleBar {
  private readonly track: HTMLElement
  private readonly label: HTMLElement
  private readonly announcement: HTMLElement
  private currentTier: ZoomTier | null = null
  private announcementTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly container: HTMLElement) {
    this.container.classList.add('scale-bar')

    this.track = document.createElement('div')
    this.track.className = 'scale-bar__track'

    this.label = document.createElement('span')
    this.label.className = 'scale-bar__label'

    this.announcement = document.createElement('span')
    this.announcement.className = 'scale-bar__announcement'
    this.announcement.setAttribute('role', 'status')

    this.container.append(this.track, this.label, this.announcement)
  }

  setTier(tier: ZoomTier, changeFactor?: number): void {
    const changed = tier !== this.currentTier
    this.currentTier = tier
    this.label.textContent = content.scaleBar[tier]
    this.track.dataset.tier = tier

    if (changed && changeFactor) {
      this.announcement.textContent = `× ${changeFactor}`
      if (this.announcementTimeout) clearTimeout(this.announcementTimeout)
      this.announcementTimeout = setTimeout(() => {
        this.announcement.textContent = ''
      }, 2500)
    }
  }
}
