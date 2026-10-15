import { content } from '../../i18n/content'

export type ChapterId = keyof typeof content.chapters.items

export const CHAPTER_ORDER: ChapterId[] = ['scene1', 'scene2', 'scene3', 'scene4', 'scene5', 'scene6']

/** Numbered chapters of the journey; chapters not built yet are shown but disabled. */
export class ChapterBar {
  private readonly buttons = new Map<ChapterId, HTMLButtonElement>()

  constructor(
    container: HTMLElement,
    available: ReadonlySet<ChapterId>,
    private readonly onSelect: (chapter: ChapterId) => void,
  ) {
    container.classList.add('chapter-bar')
    container.setAttribute('aria-label', content.chapters.navLabel)

    CHAPTER_ORDER.forEach((id, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'chapter-bar__item'
      const number = document.createElement('span')
      number.className = 'chapter-bar__number'
      number.textContent = String(index + 1)
      const title = document.createElement('span')
      title.className = 'chapter-bar__title'
      title.textContent = content.chapters.items[id]
      button.append(number, title)

      if (available.has(id)) {
        button.addEventListener('click', () => this.onSelect(id))
      } else {
        button.disabled = true
        button.title = content.chapters.upcoming
      }
      container.append(button)
      this.buttons.set(id, button)
    })
  }

  setCurrent(chapter: ChapterId | null): void {
    for (const [id, button] of this.buttons) {
      if (id === chapter) button.setAttribute('aria-current', 'step')
      else button.removeAttribute('aria-current')
    }
  }
}
