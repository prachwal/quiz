/**
 * Leitner-style spaced repetition (pure functions).
 *
 * A verb sits in a box 0..6. A correct answer moves it one box up and schedules the next review after
 * that box's interval; a wrong answer sends it back to box 0 and makes it due again right away.
 */

/** Days until the next review per box (box 0 = due now). */
export const BOX_INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32] as const
export const MAX_BOX = BOX_INTERVAL_DAYS.length - 1

export interface ReviewState {
  box: number
  repetitions: number
  lapses: number
  attempts: number
  correct: number
}

export interface ReviewUpdate extends ReviewState {
  dueAt: Date
}

export const newReviewState = (): ReviewState => ({ box: 0, repetitions: 0, lapses: 0, attempts: 0, correct: 0 })

const DAY_MS = 86_400_000

export function nextReview(state: ReviewState, correct: boolean, now: Date): ReviewUpdate {
  if (!correct) {
    return {
      box: 0,
      repetitions: 0,
      lapses: state.lapses + 1,
      attempts: state.attempts + 1,
      correct: state.correct,
      dueAt: now,
    }
  }
  const box = Math.min(state.box + 1, MAX_BOX)
  return {
    box,
    repetitions: state.repetitions + 1,
    lapses: state.lapses,
    attempts: state.attempts + 1,
    correct: state.correct + 1,
    dueAt: new Date(now.getTime() + BOX_INTERVAL_DAYS[box] * DAY_MS),
  }
}

/** Share of correct answers (0..1); null until there is at least one attempt. */
export const accuracy = (state: Pick<ReviewState, 'attempts' | 'correct'>) =>
  state.attempts === 0 ? null : state.correct / state.attempts
