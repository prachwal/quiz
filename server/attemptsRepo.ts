import type { StudentAttemptQuestion } from '../src/shared/quiz/types'
import { questionDetails } from './classes/results'
import type { AttemptRow } from './classes/results'
import { pool } from './db'
import { parseQuestionsSnapshot } from '../src/shared/quiz/questionsSnapshot'
import type { SnapshotQuestion } from '../src/shared/quiz/questionsSnapshot'

/**
 * Read path over every saved attempt, for admins: filtered lists, one attempt with its answers and the raw results
 * of a quiz. No access checks here - callers (MCP tools) gate on `manage:users`.
 */

export type AttemptSource = 'manual' | 'irregular-verbs' | 'course-exam' | 'review' | 'weak'

/** Same rule as `classes.allAttempts`; null once the quiz is deleted (the source cannot be recovered). */
const SOURCE_SQL = `CASE WHEN a.course_id IS NOT NULL THEN 'course-exam'
                         WHEN q.id IS NULL THEN NULL
                         WHEN q.kind = 'manual' THEN 'manual'
                         ELSE q.source END`

export interface AttemptFilter {
  quizId?: string
  userId?: string
  courseId?: string
  /** Part of the quiz title as saved with the attempt, so it still matches deleted quizzes. */
  title?: string
  source?: AttemptSource
  minPercent?: number
  maxPercent?: number
  from?: string
  to?: string
  limit: number
  offset: number
}

export interface AttemptListItem {
  id: string
  quizId: string | null
  quizTitle: string
  courseId: string | null
  userId: string | null
  userName: string | null
  score: number
  maxScore: number
  percent: number
  passed: boolean | null
  source: string | null
  createdAt: string
}

const FROM = `FROM quiz_attempts a
              LEFT JOIN quizzes q ON q.id = a.quiz_id
              LEFT JOIN user_profiles p ON p.user_id = a.user_id`

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`)

function where(f: AttemptFilter): { sql: string; params: unknown[] } {
  const params: unknown[] = []
  const conditions: string[] = []
  const add = (condition: (placeholder: string) => string, value: unknown) => {
    params.push(value)
    conditions.push(condition(`$${params.length}`))
  }
  if (f.quizId) add((p) => `a.quiz_id = ${p}::uuid`, f.quizId)
  if (f.userId) add((p) => `a.user_id = ${p}`, f.userId)
  if (f.courseId) add((p) => `a.course_id = ${p}::uuid`, f.courseId)
  if (f.title) add((p) => `a.quiz_title ILIKE ${p}`, `%${escapeLike(f.title)}%`)
  if (f.source) add((p) => `${SOURCE_SQL} = ${p}`, f.source)
  if (f.minPercent !== undefined) add((p) => `a.percent >= ${p}`, f.minPercent)
  if (f.maxPercent !== undefined) add((p) => `a.percent <= ${p}`, f.maxPercent)
  if (f.from) add((p) => `a.created_at >= ${p}::timestamptz`, f.from)
  if (f.to) add((p) => `a.created_at <= ${p}::timestamptz`, f.to)
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params }
}

/** Attempts matching the filter, newest first, plus the total number of matches. */
export async function listAttemptsFiltered(f: AttemptFilter): Promise<{ total: number; attempts: AttemptListItem[] }> {
  const { sql, params } = where(f)
  const count = await pool().query<{ n: number }>(`SELECT COUNT(*)::int AS n ${FROM} ${sql}`, params)
  const { rows } = await pool().query(
    `SELECT a.id, a.quiz_id, a.quiz_title, a.course_id, a.user_id, p.display_name,
            a.score::float AS score, a.max_score::float AS max_score, a.percent, a.passed, a.created_at,
            ${SOURCE_SQL} AS source
     ${FROM} ${sql}
     ORDER BY a.created_at DESC, a.id
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, f.limit, f.offset],
  )
  return {
    total: count.rows[0]?.n ?? 0,
    attempts: rows.map((r) => ({
      id: r.id,
      quizId: r.quiz_id,
      quizTitle: r.quiz_title,
      courseId: r.course_id,
      userId: r.user_id,
      userName: r.display_name,
      score: r.score,
      maxScore: r.max_score,
      percent: r.percent,
      passed: r.passed,
      source: r.source,
      createdAt: r.created_at.toISOString(),
    })),
  }
}

export interface AttemptDetail extends Omit<AttemptListItem, 'userName'> {
  user: { userId: string | null; name: string | null; email: string | null }
  /** The quiz as it is now (null once deleted). */
  quiz: { id: string; title: string } | null
  questions: (StudentAttemptQuestion & { type: string | null })[]
}

/** One attempt with the answer to every question; null for an unknown id. */
export async function getAttempt(id: string): Promise<AttemptDetail | null> {
  const { rows } = await pool().query(
    `SELECT a.id, a.quiz_id, a.quiz_title, a.course_id, a.user_id, a.answers, a.results,
            a.score::float AS score, a.max_score::float AS max_score, a.percent, a.passed, a.created_at,
            p.display_name, p.email, q.title AS current_title, ${SOURCE_SQL} AS source
     ${FROM} WHERE a.id = $1`,
    [id],
  )
  const row = rows[0]
  if (!row) return null

  const questionsOf = await questionDetails([row as AttemptRow])
  const questionIds = ((row as AttemptRow).results ?? []).map((r) => r.questionId)
  const types = await questionTypesOf(questionIds)

  return {
    id: row.id,
    quizId: row.quiz_id,
    quizTitle: row.quiz_title,
    courseId: row.course_id,
    userId: row.user_id,
    score: row.score,
    maxScore: row.max_score,
    percent: row.percent,
    passed: row.passed,
    source: row.source,
    createdAt: row.created_at.toISOString(),
    user: { userId: row.user_id, name: row.display_name, email: row.email },
    quiz: row.quiz_id && row.current_title !== null ? { id: row.quiz_id, title: row.current_title } : null,
    questions: questionsOf(row as AttemptRow).map((q) => ({ ...q, type: types.get(q.questionId) ?? null })),
  }
}

/** Raw per-question results of every attempt of a quiz (input of the item analysis), newest first. */
export async function attemptsOfQuiz(quizId: string): Promise<{
  attemptId: string
  percent: number
  results: NonNullable<AttemptRow['results']>
  /** null for attempts saved before the snapshot existed. */
  questionsSnapshot: SnapshotQuestion[] | null
}[]> {
  const { rows } = await pool().query<{ id: string; percent: number; results: AttemptRow['results']; questions_snapshot: unknown }>(
    'SELECT id, percent, results, questions_snapshot FROM quiz_attempts WHERE quiz_id = $1 ORDER BY created_at DESC',
    [quizId],
  )
  return rows.map((r) => ({
    attemptId: r.id,
    percent: r.percent,
    results: r.results ?? [],
    questionsSnapshot: parseQuestionsSnapshot(r.questions_snapshot),
  }))
}

/** The quiz as it is now (title, sample size, questions in order) for the statistics; null when deleted. */
export async function quizForStats(quizId: string): Promise<{ title: string; sampleSize: number | null; questions: SnapshotQuestion[] } | null> {
  const quiz = await pool().query<{ title: string; sample_size: number | null }>('SELECT title, sample_size FROM quizzes WHERE id = $1', [quizId])
  if (!quiz.rows[0]) return null
  const questions = await pool().query<{ id: string; type: string; prompt: string; points: number }>(
    'SELECT id, type, prompt, points FROM questions WHERE quiz_id = $1 ORDER BY position',
    [quizId],
  )
  return {
    title: quiz.rows[0].title,
    sampleSize: quiz.rows[0].sample_size,
    questions: questions.rows.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, points: q.points })),
  }
}

/** Question type by id (questions edited away are simply missing from the map). */
export async function questionTypesOf(questionIds: string[]): Promise<Map<string, string>> {
  const types = new Map<string, string>()
  if (questionIds.length === 0) return types
  const { rows } = await pool().query<{ id: string; type: string }>('SELECT id, type FROM questions WHERE id = ANY($1::uuid[])', [questionIds])
  for (const r of rows) types.set(r.id, r.type)
  return types
}
