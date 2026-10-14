import { content } from '../../i18n/content'

export type AppMode = 'guidedTour' | 'freeExploration' | 'lab'

const MODES: AppMode[] = ['guidedTour', 'freeExploration', 'lab']

export class ModeSwitcher {
  private readonly buttons = new Map<AppMode, HTMLButtonElement>()

  constructor(
    private readonly container: HTMLElement,
    private readonly onSelect: (mode: AppMode) => void,
  ) {
    this.render()
  }

  private render(): void {
    for (const mode of MODES) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'mode-switcher__button'
      button.textContent = content.modes[mode].label
      button.title = content.modes[mode].description
      button.setAttribute('aria-pressed', 'false')
      button.addEventListener('click', () => this.select(mode))
      this.container.append(button)
      this.buttons.set(mode, button)
    }
  }

  select(mode: AppMode): void {
    for (const [candidate, button] of this.buttons) {
      button.setAttribute('aria-pressed', String(candidate === mode))
    }
    this.onSelect(mode)
  }
}
