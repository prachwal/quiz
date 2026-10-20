/**
 * Pure shaping of one user's attempt history for the admin MCP tools (`user_results`, `user_analysis`).
 * Import-free apart from types, so that it can be tested with node:test.
 */
import type { AnalysisAttempt, AnalysisInput } from './studentAnalysis'
import type { AdminStudentAttempt } from './types'

export interface UserAttemptQuestion {
  questionId: string
  prompt: string | null
  type: string | null
  points: number
  correct: boolean
  earned: number
  answer: string
  correctAnswers: string[]
}

/** One attempt as `user_results` lists it; `questions` only with includeAnswers. */
export interface UserAttemptRow {
  id: string
  quizId: string | null
  quizTitle: string
  courseId: string | null
  source: string | null
  score: number
  maxScore: number
  percent: number
  passed: boolean | null
  createdAt: string
  questions?: UserAttemptQuestion[]
}

/** `types` maps question id to its type (questions edited away are missing, so `type` is null). */
export function attemptRows(attempts: AdminStudentAttempt[], includeAnswers: boolean, types: ReadonlyMap<string, string>): UserAttemptRow[] {
  return attempts.map((a) => {
    const row: UserAttemptRow = {
      id: a.id,
      quizId: a.quizId,
      quizTitle: a.title,
      courseId: a.courseId,
      source: a.source,
      score: a.score,
      maxScore: a.maxScore,
      percent: a.percent,
      passed: a.passed,
      createdAt: a.createdAt,
    }
    if (includeAnswers) {
      row.questions = a.questions.map((q) => ({
        questionId: q.questionId,
        prompt: q.prompt,
        type: types.get(q.questionId) ?? null,
        points: q.points,
        correct: q.correct,
        earned: q.earned,
        answer: q.answer,
        correctAnswers: q.correctAnswers,
      }))
    }
    return row
  })
}

/**
 * The whole attempt history as the input of `analyzeStudent`. There are no assignments here, so the
 * assignment part of the analysis stays empty; each quiz (or course exam) plays the role of an assignment.
 */
export function historyAnalysisInput(attempts: AdminStudentAttempt[], lastActiveDay: string | null): AnalysisInput {
  const mapped: AnalysisAttempt[] = attempts.map((a) => ({
    assignmentId: a.quizId ?? a.courseId ?? a.id,
    title: a.title,
    percent: a.percent,
    createdAt: a.createdAt,
    questions: a.questions.map((q) => ({
      questionId: q.questionId,
      prompt: q.prompt,
      correct: q.correct,
      correctAnswers: q.correctAnswers,
    })),
  }))
  return { lastActiveDay, assignments: [], attempts: mapped }
}
