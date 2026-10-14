export class TooltipLayer {
  private readonly titleElement: HTMLElement
  private readonly bodyElement: HTMLElement
  private readonly closeButton: HTMLButtonElement

  constructor(private readonly container: HTMLElement) {
    this.container.classList.add('tooltip-layer')
    this.container.hidden = true

    this.closeButton = document.createElement('button')
    this.closeButton.type = 'button'
    this.closeButton.className = 'tooltip-layer__close'
    this.closeButton.textContent = '×'
    this.closeButton.setAttribute('aria-label', 'Fermer')
    this.closeButton.addEventListener('click', () => this.clear())

    this.titleElement = document.createElement('h2')
    this.titleElement.className = 'tooltip-layer__title'

    this.bodyElement = document.createElement('p')
    this.bodyElement.className = 'tooltip-layer__body'

    this.container.append(this.closeButton, this.titleElement, this.bodyElement)
  }

  show(title: string, body: string): void {
    this.titleElement.textContent = title
    this.bodyElement.textContent = body
    this.container.hidden = false
  }

  clear(): void {
    this.container.hidden = true
    this.titleElement.textContent = ''
    this.bodyElement.textContent = ''
  }
}
