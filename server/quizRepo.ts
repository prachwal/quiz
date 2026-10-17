import { getDatabase } from '@netlify/database'
import type { z } from 'zod'
import type { Answer, GradableQuizQuestion, QuizResult } from '../src/shared/quiz/engine'
import type { quizInput } from '../src/shared/quiz/schema'
import type {
  AttemptSummary,
  DifficultyCode,
  QuizDetail,
  QuizQuestion,
  QuizSummary,
} from '../src/shared/quiz/types'

type ParsedQuiz = z.output<typeof quizInput>

/** Minimal structural view of the pg pool/client (typed locally to avoid duplicate `pg` typings). */
interface Queryable {
  query: <R = Record<string, any>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: R[]; rowCount: number | null }>
}

export interface PoolClient extends Queryable {
  release: () => void
}

interface Pool extends Queryable {
  connect: () => Promise<PoolClient>
}

export const pool = () => getDatabase().pool as unknown as Pool

interface QuizRow {
  id: string
  title: string
  description: string
  kind: QuizDetail['kind']
  source: string | null
  difficulty: DifficultyCode | null
  course_id: string | null
  created_at: Date
  updated_at: Date
}

interface QuestionRow {
  id: string
  type: QuizQuestion['type']
  prompt: string
  explanation: string
  points: number
}

interface OptionRow {
  id: string
  question_id: string
  text: string
  is_correct: boolean
}

export interface ListFilter {
  difficulty?: DifficultyCode
  sort?: 'recent' | 'popular'
}

export async function listQuizzes(filter: ListFilter = {}): Promise<QuizSummary[]> {
  const values: unknown[] = []
  let difficultyCondition = ''
  if (filter.difficulty) {
    values.push(filter.difficulty)
    difficultyCondition = `AND d.code = $${values.length}`
  }
  const order = filter.sort === 'popular' ? 'plays DESC, q.updated_at DESC' : 'q.updated_at DESC'

  const { rows } = await pool().query(
    `SELECT q.id, q.title, q.description, q.created_at, q.updated_at, d.code AS difficulty,
            (SELECT COUNT(*)::int FROM questions qu WHERE qu.quiz_id = q.id) AS question_count,
            (SELECT COALESCE(SUM(qu.points), 0)::int FROM questions qu WHERE qu.quiz_id = q.id) AS total_points,
            (SELECT COUNT(*)::int FROM quiz_attempts a WHERE a.quiz_id = q.id) AS plays
     FROM quizzes q
     LEFT JOIN difficulty_levels d ON d.id = q.difficulty_id
     WHERE q.kind = 'manual' ${difficultyCondition}
     ORDER BY ${order}`,
    values,
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    difficulty: row.difficulty,
    plays: row.plays,
    questionCount: row.question_count,
    totalPoints: row.total_points,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }))
}

/**
 * Loads a quiz with its questions and options.
 * `withAnswers: false` (player view) strips correctness flags, explanations and
 * the accepted answers of text questions.
 */
export async function getQuiz(id: string, withAnswers: boolean): Promise<QuizDetail | null> {
  const db = pool()
  const quizzes = await db.query<QuizRow>(
    `SELECT q.*, d.code AS difficulty
     FROM quizzes q LEFT JOIN difficulty_levels d ON d.id = q.difficulty_id
     WHERE q.id = $1`,
    [id],
  )
  const quiz = quizzes.rows[0]
  if (!quiz) return null

  const questions = await db.query<QuestionRow>(
    'SELECT id, type, prompt, explanation, points FROM questions WHERE quiz_id = $1 ORDER BY position',
    [id],
  )
  const options = await db.query<OptionRow>(
    `SELECT o.id, o.question_id, o.text, o.is_correct
     FROM options o JOIN questions q ON q.id = o.question_id
     WHERE q.quiz_id = $1 ORDER BY o.position`,
    [id],
  )

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    kind: quiz.kind,
    source: quiz.source,
    difficulty: quiz.difficulty,
    courseId: quiz.course_id,
    createdAt: quiz.created_at.toISOString(),
    updatedAt: quiz.updated_at.toISOString(),
    questions: questions.rows.map((question): QuizQuestion => {
      const own = options.rows.filter((o) => o.question_id === question.id)
      return {
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        points: question.points,
        ...(withAnswers ? { explanation: question.explanation } : {}),
        options:
          !withAnswers && question.type === 'text'
            ? []
            : own.map((o) => ({
                id: o.id,
                text: o.text,
                ...(withAnswers ? { isCorrect: o.is_correct } : {}),
              })),
      }
    }),
  }
}

/** Questions with correct answers, for grading (expects a quiz loaded with `withAnswers`). */
export function toGradable(quiz: QuizDetail): GradableQuizQuestion[] {
  return quiz.questions.map((q) => ({
    id: q.id,
    type: q.type,
    points: q.points,
    explanation: q.explanation ?? '',
    options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect ?? false })),
  }))
}

async function insertQuestions(client: PoolClient, quizId: string, questions: ParsedQuiz['questions']) {
  for (const [qi, question] of questions.entries()) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO questions (quiz_id, position, type, prompt, explanation, points)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [quizId, qi, question.type, question.prompt, question.explanation, question.points],
    )
    const questionId = inserted.rows[0].id
    for (const [oi, option] of question.options.entries()) {
      await client.query(
        'INSERT INTO options (question_id, position, text, is_correct) VALUES ($1, $2, $3, $4)',
        [questionId, oi, option.text, option.isCorrect],
      )
    }
  }
}

export async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export interface QuizMeta {
  kind: 'manual' | 'generated'
  source?: string
  difficulty?: DifficultyCode | null
  courseId?: string
}

export async function createQuiz(
  input: ParsedQuiz,
  meta: QuizMeta = { kind: 'manual', difficulty: input.difficulty },
): Promise<string> {
  return inTransaction(async (client) => {
    const created = await client.query<{ id: string }>(
      `INSERT INTO quizzes (title, description, kind, source, course_id, difficulty_id)
       VALUES ($1, $2, $3, $4, $5, (SELECT id FROM difficulty_levels WHERE code = $6)) RETURNING id`,
      [
        input.title,
        input.description,
        meta.kind,
        meta.source ?? null,
        meta.courseId ?? null,
        meta.difficulty ?? null,
      ],
    )
    const id = created.rows[0].id
    await insertQuestions(client, id, input.questions)
    return id
  })
}

/** Replaces the whole quiz content (question and option ids are regenerated). */
export async function replaceQuiz(id: string, input: ParsedQuiz): Promise<boolean> {
  return inTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE quizzes
       SET title = $2, description = $3, updated_at = now(),
           difficulty_id = (SELECT id FROM difficulty_levels WHERE code = $4)
       WHERE id = $1 RETURNING id`,
      [id, input.title, input.description, input.difficulty ?? null],
    )
    if (updated.rowCount === 0) return false
    await client.query('DELETE FROM questions WHERE quiz_id = $1', [id])
    await insertQuestions(client, id, input.questions)
    return true
  })
}

export async function deleteQuiz(id: string): Promise<boolean> {
  const result = await pool().query('DELETE FROM quizzes WHERE id = $1', [id])
  return (result.rowCount ?? 0) > 0
}

export async function saveAttempt(attempt: {
  quizId: string
  quizTitle: string
  userId: string | null
  courseId: string | null
  passed: boolean | null
  answers: Record<string, Answer>
  result: QuizResult
}): Promise<string> {
  const { result } = attempt
  const inserted = await pool().query<{ id: string }>(
    `INSERT INTO quiz_attempts
       (quiz_id, quiz_title, user_id, course_id, passed, score, max_score, percent, answers, results)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      attempt.quizId,
      attempt.quizTitle,
      attempt.userId,
      attempt.courseId,
      attempt.passed,
      result.score,
      result.maxScore,
      result.percent,
      JSON.stringify(attempt.answers),
      JSON.stringify(result.results),
    ],
  )
  return inserted.rows[0].id
}

export async function listAttempts(userId: string | null, limit = 50): Promise<AttemptSummary[]> {
  const { rows } = await pool().query(
    `SELECT id, quiz_id, quiz_title, course_id, passed, score::float AS score,
            max_score::float AS max_score, percent, created_at
     FROM quiz_attempts
     WHERE user_id IS NOT DISTINCT FROM $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  )
  return rows.map((row) => ({
    id: row.id,
    quizId: row.quiz_id,
    quizTitle: row.quiz_title,
    score: row.score,
    maxScore: row.max_score,
    percent: row.percent,
    courseId: row.course_id,
    passed: row.passed,
    createdAt: row.created_at.toISOString(),
  }))
}
