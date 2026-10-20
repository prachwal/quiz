import { newReviewState, nextReview } from '../src/shared/quiz/spaced'
import type { ReviewState } from '../src/shared/quiz/spaced'
import type { ReviewSummary } from '../src/shared/quiz/types'
import { accuracyOf, isWeak, rankWeak } from '../src/shared/quiz/weak'
import type { VerbStat } from '../src/shared/quiz/weak'
import { lessonVerbIds } from './coursesRepo'
import { pool } from './db'

export async function getReviewSummary(userId: string): Promise<ReviewSummary> {
  const { rows } = await pool().query<{
    due: number
    new_due: number
    tracked: number
    next_due: Date | null
  }>(
    `SELECT COUNT(*) FILTER (WHERE due_at <= now())::int AS due,
            COUNT(*) FILTER (WHERE due_at <= now() AND attempts = 0)::int AS new_due,
            COUNT(*)::int AS tracked,
            MIN(due_at) FILTER (WHERE due_at > now()) AS next_due
     FROM verb_reviews WHERE user_id = $1`,
    [userId],
  )
  const r = rows[0]
  return {
    dueCount: r.due,
    newCount: r.new_due,
    trackedCount: r.tracked,
    nextDueAt: r.due > 0 ? null : (r.next_due?.toISOString() ?? null),
  }
}

/** Verb ids due now, most overdue first. */
export async function dueVerbIds(userId: string, limit: number): Promise<number[]> {
  const { rows } = await pool().query<{ verb_id: number }>(
    'SELECT verb_id FROM verb_reviews WHERE user_id = $1 AND due_at <= now() ORDER BY due_at, verb_id LIMIT $2',
    [userId, limit],
  )
  return rows.map((r) => r.verb_id)
}

/** Puts verbs from a completed lesson into the review queue (no-op for verbs already tracked). */
export async function enqueueLessonVerbs(userId: string, lessonId: string) {
  const verbIds = await lessonVerbIds(lessonId)
  if (verbIds.length === 0) return
  await pool().query(
    `INSERT INTO verb_reviews (user_id, verb_id)
     SELECT $1, verb_id FROM unnest($2::int[]) AS verb_id
     ON CONFLICT (user_id, verb_id) DO NOTHING`,
    [userId, verbIds],
  )
}

/** Applies graded answers to the review state of the verbs they were about. */
export async function applyResults(userId: string, results: { verbId: number; correct: boolean }[]) {
  if (results.length === 0) return
  const ids = results.map((r) => r.verbId)
  const { rows } = await pool().query<ReviewState & { verb_id: number }>(
    `SELECT verb_id, box, repetitions, lapses, attempts, correct
     FROM verb_reviews WHERE user_id = $1 AND verb_id = ANY($2::int[])`,
    [userId, ids],
  )
  const current = new Map(rows.map((r) => [r.verb_id, r]))
  const now = new Date()
  const updates = results.map((r) => ({ verbId: r.verbId, ...nextReview(current.get(r.verbId) ?? newReviewState(), r.correct, now) }))

  await pool().query(
    `INSERT INTO verb_reviews
       (user_id, verb_id, box, due_at, repetitions, lapses, attempts, correct, last_reviewed_at, last_wrong_at)
     SELECT $1, u.verb_id, u.box, u.due_at, u.repetitions, u.lapses, u.attempts, u.correct, now(),
            CASE WHEN u.wrong THEN now() END
     FROM unnest($2::int[], $3::int[], $4::timestamptz[], $5::int[], $6::int[], $7::int[], $8::int[], $9::boolean[])
       AS u(verb_id, box, due_at, repetitions, lapses, attempts, correct, wrong)
     ON CONFLICT (user_id, verb_id) DO UPDATE SET
       box = EXCLUDED.box, due_at = EXCLUDED.due_at, repetitions = EXCLUDED.repetitions,
       lapses = EXCLUDED.lapses, attempts = EXCLUDED.attempts, correct = EXCLUDED.correct,
       last_reviewed_at = EXCLUDED.last_reviewed_at,
       last_wrong_at = COALESCE(EXCLUDED.last_wrong_at, verb_reviews.last_wrong_at)`,
    [
      userId,
      updates.map((u) => u.verbId),
      updates.map((u) => u.box),
      updates.map((u) => u.dueAt.toISOString()),
      updates.map((u) => u.repetitions),
      updates.map((u) => u.lapses),
      updates.map((u) => u.attempts),
      updates.map((u) => u.correct),
      results.map((r) => !r.correct),
    ],
  )
}

export interface WeakVerbStat extends VerbStat {
  verbId: number
  accuracy: number
}

/** Verbs the user struggles with, weakest first (see `rankWeak`). */
export async function weakVerbs(userId: string, limit: number): Promise<WeakVerbStat[]> {
  const { rows } = await pool().query<{
    verb_id: number
    attempts: number
    correct: number
    box: number
    last_wrong_at: Date | null
  }>(
    'SELECT verb_id, attempts, correct, box, last_wrong_at FROM verb_reviews WHERE user_id = $1 AND attempts >= 1',
    [userId],
  )
  const stats = rows.map((r) => ({
    verbId: r.verb_id,
    attempts: r.attempts,
    correct: r.correct,
    box: r.box,
    lastWrongAt: r.last_wrong_at?.toISOString() ?? null,
    accuracy: 0,
  }))
  return rankWeak(stats, limit).map((s) => ({ ...s, accuracy: accuracyOf(s) }))
}

export const hasWeakVerbs = async (userId: string) => (await weakVerbs(userId, 1)).length > 0

/** How many verbs are weak in total (`weakVerbs` returns only the weakest few). */
export const weakVerbCount = async (userId: string) => (await weakVerbs(userId, Number.POSITIVE_INFINITY)).length

export { isWeak }
