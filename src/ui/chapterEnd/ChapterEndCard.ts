import { content } from '../../i18n/content'

export interface ChapterEndOptions {
  title: string
  keyMessage: string
  /** Optional richer content (e.g. a route map) inserted under the key message. */
  extra?: HTMLElement[]
  onQuiz: () => void
  nextTitle: string | null
  /** null when the next chapter is not built yet (the button is then disabled). */
  onNext: (() => void) | null
}

/** « À retenir » card shown on a chapter's last still state: key message, quiz, next chapter. */
export function createChapterEndCard(options: ChapterEndOptions): HTMLElement {
  const card = document.createElement('aside')
  card.className = 'scene2-card scene2-card--recap chapter-end'
  const title = document.createElement('p')
  title.className = 'scene2-card__title hud-label'
  title.textContent = content.chapterEnd.title
  const key = document.createElement('p')
  key.className = 'scene2-card__key'
  key.textContent = options.keyMessage

  const quiz = document.createElement('button')
  quiz.type = 'button'
  quiz.className = 'quiz-open'
  quiz.textContent = content.quiz.open
  quiz.addEventListener('click', options.onQuiz)

  card.append(title, key, ...(options.extra ?? []), quiz)
  if (options.nextTitle) {
    const next = document.createElement('button')
    next.type = 'button'
    next.className = 'scene2-card__next'
    next.textContent = content.player.nextChapter.replace('{title}', options.nextTitle)
    if (options.onNext) next.addEventListener('click', options.onNext)
    else {
      next.disabled = true
      next.title = content.chapters.upcoming
      next.textContent += ` (${content.chapters.upcoming})`
    }
    card.append(next)
  }
  return card
}
