import { content } from '../../i18n/content'

export interface QuizQuestion {
  question: string
  choices: string[]
  correctIndex: number
  explanation: string
}

/**
 * End-of-chapter quiz (QCM with an explained correction), in a dialog over the scene.
 * One question at a time: the student picks an answer, sees right/wrong (said in words
 * and shown by a mark, never by colour alone) and the explanation, then moves on.
 */
export class Quiz {
  private readonly dialog: HTMLDialogElement
  private readonly body: HTMLElement
  private index = 0
  private score = 0
  private readonly restoreFocus: HTMLElement | null

  constructor(
    container: HTMLElement,
    title: string,
    private readonly questions: QuizQuestion[],
    needsTeacherReview: boolean,
  ) {
    this.restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.dialog = document.createElement('dialog')
    this.dialog.className = 'quiz'
    this.dialog.setAttribute('aria-label', title)

    const header = document.createElement('div')
    header.className = 'quiz__header'
    const heading = document.createElement('h2')
    heading.className = 'quiz__title'
    heading.textContent = title
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'quiz__close'
    close.textContent = '×'
    close.setAttribute('aria-label', content.ui.close)
    close.addEventListener('click', () => this.close())
    header.append(heading, close)
    if (needsTeacherReview) {
      const review = document.createElement('p')
      review.className = 'quiz__review hud-label'
      review.textContent = content.quiz.needsTeacherReview
      header.append(review)
    }

    this.body = document.createElement('div')
    this.body.className = 'quiz__body'
    this.dialog.append(header, this.body)
    this.dialog.addEventListener('close', () => this.dispose())
    container.append(this.dialog)
    this.render()
    this.dialog.showModal()
  }

  close(): void {
    if (this.dialog.open) this.dialog.close()
  }

  private dispose(): void {
    this.dialog.remove()
    this.restoreFocus?.focus()
  }

  private render(): void {
    this.body.replaceChildren()
    if (this.index >= this.questions.length) {
      this.renderScore()
      return
    }
    const q = this.questions[this.index]
    const progress = document.createElement('p')
    progress.className = 'quiz__progress hud-label'
    progress.textContent = content.quiz.progress
      .replace('{current}', String(this.index + 1))
      .replace('{total}', String(this.questions.length))
    const question = document.createElement('p')
    question.className = 'quiz__question'
    question.id = `quiz-q-${this.index}`
    question.textContent = q.question

    const list = document.createElement('div')
    list.className = 'quiz__choices'
    list.setAttribute('role', 'group')
    list.setAttribute('aria-labelledby', question.id)
    const feedback = document.createElement('div')
    feedback.className = 'quiz__feedback'
    feedback.setAttribute('aria-live', 'polite')

    const buttons = q.choices.map((choice, i) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'quiz__choice'
      button.textContent = choice
      button.addEventListener('click', () => this.answer(i, buttons, feedback))
      return button
    })
    list.append(...buttons)
    this.body.append(progress, question, list, feedback)
    buttons[0]?.focus()
  }

  private answer(choice: number, buttons: HTMLButtonElement[], feedback: HTMLElement): void {
    const q = this.questions[this.index]
    const right = choice === q.correctIndex
    if (right) this.score += 1
    buttons.forEach((button, i) => {
      button.disabled = true
      if (i === q.correctIndex) {
        button.classList.add('quiz__choice--correct')
        button.prepend('✓ ')
      } else if (i === choice) {
        button.classList.add('quiz__choice--wrong')
        button.prepend('✗ ')
      }
    })
    const verdict = document.createElement('p')
    verdict.className = 'quiz__verdict'
    verdict.textContent = right ? content.quiz.right : content.quiz.wrong
    const explanation = document.createElement('p')
    explanation.className = 'quiz__explanation'
    explanation.textContent = q.explanation
    const next = document.createElement('button')
    next.type = 'button'
    next.className = 'quiz__next'
    next.textContent = this.index + 1 < this.questions.length ? content.quiz.next : content.quiz.finish
    next.addEventListener('click', () => {
      this.index += 1
      this.render()
    })
    feedback.replaceChildren(verdict, explanation, next)
    next.focus()
  }

  private renderScore(): void {
    const score = document.createElement('p')
    score.className = 'quiz__question'
    score.textContent = content.quiz.score.replace('{score}', String(this.score)).replace('{total}', String(this.questions.length))
    const again = document.createElement('button')
    again.type = 'button'
    again.className = 'quiz__next'
    again.textContent = content.quiz.again
    again.addEventListener('click', () => {
      this.index = 0
      this.score = 0
      this.render()
    })
    const done = document.createElement('button')
    done.type = 'button'
    done.className = 'quiz__next quiz__next--secondary'
    done.textContent = content.ui.close
    done.addEventListener('click', () => this.close())
    const actions = document.createElement('div')
    actions.className = 'quiz__actions'
    actions.append(again, done)
    this.body.append(score, actions)
    again.focus()
  }
}
