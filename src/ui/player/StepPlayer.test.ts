import { describe, expect, it } from 'vitest'
import { previousStepIndex } from './StepPlayer'

describe('step player — « Étape précédente »', () => {
  it('restarts the current step when well into it', () => {
    expect(previousStepIndex(3, 5, false)).toBe(3)
  })

  it('goes back one step near the start of a step', () => {
    expect(previousStepIndex(3, 0.5, false)).toBe(2)
    expect(previousStepIndex(0, 0.5, false)).toBe(0)
  })

  it('always goes back one step under reduced motion (the playhead sits at end states)', () => {
    expect(previousStepIndex(3, 8.999, true)).toBe(2)
    expect(previousStepIndex(0, 8.999, true)).toBe(0)
  })
})
