/** Ranking of the verbs a user struggles with (pure functions, shared by server and tests). */

/** Minimum answers before a verb can be judged. */
export const MIN_ATTEMPTS = 3
/** Verbs with a lower share of correct answers are "weak". */
export const WEAK_ACCURACY = 0.75
/** A verb answered correctly this many times in a row (Leitner box) counts as recovered. */
export const RECOVERED_BOX = 4

export interface VerbStat {
  attempts: number
  correct: number
  box: number
  lastWrongAt: string | null
}

export const accuracyOf = (stat: Pick<VerbStat, 'attempts' | 'correct'>) =>
  stat.attempts === 0 ? 1 : stat.correct / stat.attempts

export const isWeak = (stat: VerbStat) =>
  stat.attempts >= MIN_ATTEMPTS && accuracyOf(stat) < WEAK_ACCURACY && stat.box < RECOVERED_BOX

/** Weakest first: lowest accuracy, then most attempts, then most recent mistake. */
export function rankWeak<T extends VerbStat>(items: T[], limit: number): T[] {
  return items
    .filter(isWeak)
    .sort(
      (a, b) =>
        accuracyOf(a) - accuracyOf(b) ||
        b.attempts - a.attempts ||
        (b.lastWrongAt ?? '').localeCompare(a.lastWrongAt ?? ''),
    )
    .slice(0, limit)
}
