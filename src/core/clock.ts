/**
 * The app's notion of "now" for short-lived UI states (zoom announcements, counter
 * emphasis). Real time in the browser; the frame-by-frame video export swaps in the
 * video time so those states last the same number of video frames on every machine.
 */
export const clock = {
  now: (): number => performance.now() / 1000,
}

export function useClock(now: () => number): void {
  clock.now = now
}
