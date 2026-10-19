/** Item analysis: how a single question performed across saved attempts (pure functions, shared by server and tests). */

/** Fewer answers than this and no verdict is given - "3 of 8" proves nothing. */
export const MIN_ANSWERS = 10
/** At least this share of the points earned: nobody needs to think about the question. */
export const EASY_ACCURACY = 0.85
/** Less than this share of the points earned: the question fails almost everybody. */
export const TOO_HARD_ACCURACY = 0.4
/** Below this share a single wrong answer taking most of the mistakes points at a bad distractor. */
export const AMBIGUOUS_ACCURACY = 0.7
/** Share of the wrong answers a single answer has to take to count as "attracting everybody". */
export const AMBIGUOUS_SHARE = 0.5
export const TOP_ANSWERS = 5

/** Question types whose wrong answers are picks from a fixed set of options, so a dominant one is a distractor. */
const OPTION_TYPES = new Set(['single', 'multiple', 'truefalse'])

export type ItemFlag = 'insufficient-data' | 'easy' | 'too-hard' | 'ambiguous' | 'ok'

/** One question as answered in one attempt (a row of `quiz_attempts.results`). */
export interface Observation {
  correct: boolean
  earned: number
  points: number
  /** The answer in words; empty when the attempt did not record it. */
  answer: string
}

export interface ItemStats {
  /** Times the question was answered. */
  attempts: number
  /** Answers that earned all the points. */
  correct: number
  /** Points earned / points available (0..1), so partial credit counts; null without any answers. */
  accuracy: number | null
  topAnswers: { text: string; count: number }[]
  flag: ItemFlag
}

const countBy = (answers: string[]) => {
  const counts = new Map<string, number>()
  for (const a of answers) counts.set(a, (counts.get(a) ?? 0) + 1)
  return [...counts].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
}

/**
 * Statistics and the one verdict this module allows itself: a rule with a sample-size gate, not an opinion.
 * `ambiguous` only exists for option-based types; for numeric/text/ordering/matching/cloze the commonest wrong
 * answer is not a distractor.
 */
export function analyzeItem(type: string, observations: Observation[]): ItemStats {
  const attempts = observations.length
  const available = observations.reduce((sum, o) => sum + o.points, 0)
  const earned = observations.reduce((sum, o) => sum + o.earned, 0)
  const accuracy = attempts === 0 || available <= 0 ? null : earned / available
  const answered = observations.filter((o) => o.answer.trim() !== '')
  const topAnswers = countBy(answered.map((o) => o.answer.trim())).slice(0, TOP_ANSWERS)

  return {
    attempts,
    correct: observations.filter((o) => o.correct).length,
    accuracy,
    topAnswers,
    flag: flagOf(type, accuracy, attempts, observations),
  }
}

function flagOf(type: string, accuracy: number | null, attempts: number, observations: Observation[]): ItemFlag {
  if (attempts < MIN_ANSWERS || accuracy === null) return 'insufficient-data'
  if (accuracy >= EASY_ACCURACY) return 'easy'
  if (accuracy < TOO_HARD_ACCURACY) return 'too-hard'
  if (accuracy < AMBIGUOUS_ACCURACY && OPTION_TYPES.has(type)) {
    const wrong = countBy(observations.filter((o) => !o.correct && o.answer.trim() !== '').map((o) => o.answer.trim()))
    const wrongTotal = observations.filter((o) => !o.correct).length
    if (wrongTotal > 0 && wrong[0] && wrong[0].count / wrongTotal >= AMBIGUOUS_SHARE) return 'ambiguous'
  }
  return 'ok'
}
