import type { AdminStudentResults } from '../src/shared/quiz/types'
import * as classes from './classesRepo'
import { listVerbs } from './irregularVerbs'
import * as progress from './progressRepo'
import * as reviews from './reviewsRepo'

/**
 * A user's complete results, shared by the admin REST route (`GET /api/admin/students/:userId/results`) and
 * the admin MCP tools (`user_results`, `user_analysis`, `student_analyze` for the weak verbs).
 * No access checks here - callers gate on `manage:users`.
 */

/**
 * Everything an admin sees about one account: profile, classes, progress, weak verbs and the newest
 * `attemptLimit` attempts with per-question details. Null when the account has neither a profile nor attempts.
 */
export async function adminStudentResults(userId: string, attemptLimit: number): Promise<AdminStudentResults | null> {
  const profile = await classes.profileOf(userId)
  const attempts = await classes.allAttempts(userId, attemptLimit)
  if (!profile && attempts.length === 0) return null
  const [memberOf, summary, lessonsCompleted, weakStats] = await Promise.all([
    classes.classesOfMember(userId),
    progress.getSummary(userId),
    classes.totalLessonsCompleted(userId),
    reviews.weakVerbs(userId, 10),
  ])
  const verbs = weakStats.length ? await listVerbs({ ids: weakStats.map((s) => s.verbId) }) : []
  const byId = new Map(verbs.map((v) => [v.id, v]))
  const percents = attempts.map((x) => x.percent)
  return {
    userId,
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    classes: memberOf,
    progress: summary,
    lessonsCompleted,
    weakVerbs: weakStats.flatMap((s) => {
      const verb = byId.get(s.verbId)
      return verb ? [{ verb, attempts: s.attempts, correct: s.correct, accuracy: s.accuracy, lastWrongAt: s.lastWrongAt }] : []
    }),
    totals: {
      attempts: attempts.length,
      averagePercent: percents.length ? Math.round(percents.reduce((x, y) => x + y, 0) / percents.length) : null,
      passedExams: attempts.filter((x) => x.courseId && x.passed).length,
    },
    attempts,
  }
}

/** The user's weakest verbs (weakest first) with forms and meanings, for the MCP tools. */
export async function weakVerbDetails(userId: string, limit: number) {
  const weak = await reviews.weakVerbs(userId, limit)
  const verbs = weak.length ? await listVerbs({ ids: weak.map((w) => w.verbId) }) : []
  return weak.flatMap((w) => {
    const verb = verbs.find((x) => x.id === w.verbId)
    return verb
      ? [
          {
            verb: verb.base,
            forms: [verb.base, verb.pastSimple[0], verb.pastParticiple[0]].join(' – '),
            meanings: verb.meanings,
            accuracyPercent: Math.round(w.accuracy * 100),
            attempts: w.attempts,
          },
        ]
      : []
  })
}
