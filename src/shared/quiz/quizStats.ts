/**
 * Per-question statistics of a quiz across all its saved attempts (used by the MCP tool `quiz_stats`).
 * Pure and import-free apart from the item analysis, so that it can be tested with node:test.
 *
 * Question identity: an attempt's `questionsSnapshot` when it has one (it survives quiz edits, because PUT
 * generates new question ids); otherwise the quiz's CURRENT questions (old attempts). A result whose question
 * is known neither way is not attributed: the attempt is counted in `unattributedAttempts`.
 */
import { promptText } from './engine'
import { analyzeItem } from './itemStats'
import type { ItemStats, Observation } from './itemStats'
import type { SnapshotQuestion } from './questionsSnapshot'

/** One graded question inside `quiz_attempts.results`. */
export interface StatsResult {
  questionId: string
  correct: boolean
  earned: number
  points: number
  /** The answer in words; absent in attempts saved before the config work. */
  answerText?: string
}

export interface StatsAttempt {
  percent: number
  results: StatsResult[]
  /** null for attempts saved before the snapshot existed. */
  questionsSnapshot: SnapshotQuestion[] | null
}

export interface StatsQuiz {
  /** null when the quiz was deleted and only its attempts remain. */
  title: string | null
  sampleSize: number | null
  /** Current questions in quiz order (may be empty when the quiz was deleted). */
  questions: SnapshotQuestion[]
}

export interface QuestionStatsRow extends ItemStats {
  questionId: string
  prompt: string
  type: string
  points: number
  /** The question still belongs to the quiz (false for questions removed by an edit). */
  inCurrentQuiz: boolean
  /** Share of the points earned in percent, null without any answers. */
  earnedPercent: number | null
}

export interface QuizStatsReport {
  quiz: { title: string | null; sampleSize: number | null }
  attempts: number
  /** Quiz-level percents over all attempts; null without any attempt (an average of nothing is not 0). */
  avgPercent: number | null
  minPercent: number | null
  maxPercent: number | null
  /** Attempts with at least one result whose question is known neither from the snapshot nor from the quiz. */
  unattributedAttempts: number
  /** Questions answered at least once. */
  total: number
  hasMore: boolean
  questions: QuestionStatsRow[]
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export function quizStats(input: { quiz: StatsQuiz; attempts: StatsAttempt[]; limit: number }): QuizStatsReport {
  const { quiz, attempts, limit } = input
  const currentById = new Map(quiz.questions.map((q) => [q.id, q] as const))
  const currentOrder = new Map(quiz.questions.map((q, index) => [q.id, index] as const))
  const currentIds = new Set(quiz.questions.map((q) => q.id))

  // metadata: the snapshot wins (it is what was shown when the attempt was graded), then the current question
  const meta = new Map<string, SnapshotQuestion>()
  for (const a of attempts) for (const q of a.questionsSnapshot ?? []) if (!meta.has(q.id)) meta.set(q.id, q)
  for (const q of quiz.questions) if (!meta.has(q.id)) meta.set(q.id, q)

  const observations = new Map<string, Observation[]>()
  let unattributedAttempts = 0
  for (const a of attempts) {
    const known = a.questionsSnapshot ? new Set(a.questionsSnapshot.map((q) => q.id)) : currentIds
    let unknown = false
    for (const r of a.results) {
      if (!known.has(r.questionId)) {
        unknown = true
        continue
      }
      const list = observations.get(r.questionId) ?? []
      list.push({ correct: r.correct, earned: r.earned, points: r.points, answer: r.answerText ?? '' })
      observations.set(r.questionId, list)
    }
    if (unknown) unattributedAttempts += 1
  }

  const rows: QuestionStatsRow[] = [...observations.entries()].map(([questionId, list]) => {
    const question = meta.get(questionId)
    const type = question?.type ?? 'unknown'
    const stats = analyzeItem(type, list)
    return {
      ...stats,
      questionId,
      prompt: promptText(question?.prompt ?? ''),
      type,
      points: question?.points ?? 0,
      inCurrentQuiz: currentById.has(questionId),
      earnedPercent: stats.accuracy === null ? null : Math.round(stats.accuracy * 100),
    }
  })

  // questions of the current quiz in their quiz order first, then the older ones by attempts (most first)
  rows.sort((a, b) => {
    const ia = currentOrder.get(a.questionId)
    const ib = currentOrder.get(b.questionId)
    if (ia !== undefined && ib !== undefined) return ia - ib
    if (ia !== undefined) return -1
    if (ib !== undefined) return 1
    return b.attempts - a.attempts || a.questionId.localeCompare(b.questionId)
  })

  const percents = attempts.map((a) => a.percent)
  return {
    quiz: { title: quiz.title, sampleSize: quiz.sampleSize },
    attempts: attempts.length,
    avgPercent: percents.length ? Math.round(mean(percents)) : null,
    minPercent: percents.length ? Math.min(...percents) : null,
    maxPercent: percents.length ? Math.max(...percents) : null,
    unattributedAttempts,
    total: rows.length,
    hasMore: rows.length > limit,
    questions: rows.slice(0, limit),
  }
}
