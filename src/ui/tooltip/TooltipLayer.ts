import { content } from '../../i18n/content'

export class TooltipLayer {
  private readonly titleElement: HTMLElement
  private readonly bodyElement: HTMLElement
  private readonly closeButton: HTMLButtonElement
  /** Where focus returns when the tooltip closes (the label or button that opened it). */
  private trigger: HTMLElement | null = null

  constructor(private readonly container: HTMLElement) {
    this.container.classList.add('tooltip-layer')
    this.container.hidden = true
    // A non-modal dialog that takes focus when it opens (an aria-live region that appears
    // together with its content is not reliably announced).
    this.container.removeAttribute('aria-live')
    this.container.setAttribute('role', 'dialog')
    this.container.tabIndex = -1

    this.closeButton = document.createElement('button')
    this.closeButton.type = 'button'
    this.closeButton.className = 'tooltip-layer__close'
    this.closeButton.textContent = '×'
    this.closeButton.setAttribute('aria-label', content.ui.close)
    this.closeButton.title = content.ui.close
    this.closeButton.addEventListener('click', () => this.clear())

    this.titleElement = document.createElement('h2')
    this.titleElement.className = 'tooltip-layer__title'
    this.titleElement.id = 'tooltip-layer-title'
    this.container.setAttribute('aria-labelledby', this.titleElement.id)

    this.bodyElement = document.createElement('p')
    this.bodyElement.className = 'tooltip-layer__body'

    this.container.append(this.closeButton, this.titleElement, this.bodyElement)
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.container.hidden) this.clear()
    })
  }

  get isOpen(): boolean {
    return !this.container.hidden
  }

  show(title: string, body: string): void {
    this.trigger = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    this.titleElement.textContent = title
    this.bodyElement.textContent = body
    this.container.hidden = false
    requestAnimationFrame(() => {
      if (!this.container.hidden) this.container.focus()
    })
  }

  clear(): void {
    const wasOpen = !this.container.hidden
    this.container.hidden = true
    this.titleElement.textContent = ''
    this.bodyElement.textContent = ''
    if (wasOpen && this.trigger?.isConnected) this.trigger.focus()
    this.trigger = null
  }
}
