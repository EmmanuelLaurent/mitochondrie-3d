import gsap from 'gsap'
import { content } from '../../../i18n/content'
import type { PlayerStep } from '../../../ui/player/StepPlayer'

/** A step of a chapter as written in content/fr.json. */
export interface StepText {
  id: string
  title: string
  kind: string
  equation: string
  narration: string
  infos: string[]
}

/** The chapter's master timeline: one label per step, paused (the StepPlayer drives it). */
export function createStepTimeline(starts: Record<string, number>, duration: number): gsap.core.Timeline {
  const timeline = gsap.timeline({ paused: true })
  timeline.to({}, { duration })
  for (const [id, start] of Object.entries(starts)) timeline.addLabel(id, start)
  return timeline
}

/**
 * The StepPlayer's steps: narration and equation filled from the config, « En savoir
 * plus » chips opening the step's tooltips.
 */
export function playerSteps(
  steps: readonly StepText[],
  fill: (template: string) => string,
  tooltip: (key: string) => { title: string; text: string },
  show: (title: string, text: string) => void,
): PlayerStep[] {
  return steps.map((step) => ({
    label: step.id,
    title: fill(step.title),
    narration: fill(step.narration),
    kind: step.kind === 'reaction' ? content.player.kindReaction : step.kind === 'transport' ? content.player.kindTransport : '',
    equation: fill(step.equation),
    infos: step.infos.map((key) => {
      const { title, text } = tooltip(key)
      return { label: fill(title), open: () => show(fill(title), fill(text)) }
    }),
  }))
}
