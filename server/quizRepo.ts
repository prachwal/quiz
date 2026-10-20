import type { z } from 'zod'
import { pool, type PoolClient } from './db'
import { quizImageIds, typeDef } from '../src/shared/quiz/engine'
import type { Answer, GradableQuizQuestion, QuizResult } from '../src/shared/quiz/engine'
import type { quizInput } from '../src/shared/quiz/schema'
import type { SnapshotQuestion } from '../src/shared/quiz/questionsSnapshot'
import { syncRefs } from './media/repo'
import type {
  AttemptSummary,
  DifficultyCode,
  SubjectCode,
  QuizDetail,
  QuizQuestion,
  QuizSummary,
} from '../src/shared/quiz/types'

type ParsedQuiz = z.output<typeof quizInput>

interface QuizRow {
  id: string
  title: string
  description: string
  kind: QuizDetail['kind']
  source: string | null
  difficulty: DifficultyCode | null
  subject: SubjectCode | null
  course_id: string | null
  owner_id: string | null
  shuffle_questions: boolean | null
  shuffle_options: boolean
  sample_size: number | null
  created_at: Date
  updated_at: Date
}

interface QuestionRow {
  id: string
  type: QuizQuestion['type']
  prompt: string
  explanation: string
  points: number
  config: unknown
}

interface OptionRow {
  id: string
  question_id: string
  text: string
  is_correct: boolean
}

export interface ListFilter {
  difficulty?: DifficultyCode
  subject?: SubjectCode | 'none'
  sort?: 'recent' | 'popular'
}

export async function listQuizzes(filter: ListFilter = {}, canEdit = false, userId: string | null = null): Promise<QuizSummary[]> {
  const values: unknown[] = [userId]
  let difficultyCondition = ''
  if (filter.difficulty) {
    values.push(filter.difficulty)
    difficultyCondition = `AND d.code = $${values.length}`
  }
  let subjectCondition = ''
  if (filter.subject === 'none') subjectCondition = 'AND q.subject_id IS NULL'
  else if (filter.subject) {
    values.push(filter.subject)
    subjectCondition = `AND s.code = $${values.length}`
  }
  const order = filter.sort === 'popular' ? 'plays DESC, q.updated_at DESC' : 'q.updated_at DESC'

  const { rows } = await pool().query(
    `SELECT q.id, q.title, q.description, q.created_at, q.updated_at, q.sample_size, d.code AS difficulty, s.code AS subject,
            (SELECT COUNT(*)::int FROM questions qu WHERE qu.quiz_id = q.id) AS question_count,
            (SELECT COALESCE(SUM(qu.points), 0)::int FROM questions qu WHERE qu.quiz_id = q.id) AS total_points,
            (SELECT COUNT(*)::int FROM quiz_attempts a WHERE a.quiz_id = q.id) AS plays,
            (SELECT COUNT(*)::int FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = $1) AS my_attempts,
            (SELECT MAX(a.percent)::int FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = $1) AS my_best
     FROM quizzes q
     LEFT JOIN difficulty_levels d ON d.id = q.difficulty_id
     LEFT JOIN subjects s ON s.id = q.subject_id
     WHERE q.kind = 'manual' ${difficultyCondition} ${subjectCondition}
     ORDER BY ${order}`,
    values,
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    difficulty: row.difficulty,
    subject: row.subject,
    canEdit,
    plays: row.plays,
    myAttempts: row.my_attempts,
    myBestPercent: row.my_best,
    questionCount: row.question_count,
    sampleSize: row.sample_size,
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
export async function getQuiz(
  id: string,
  withAnswers: boolean,
  canEdit = false,
): Promise<QuizDetail | null> {
  const db = pool()
  const quizzes = await db.query<QuizRow>(
    `SELECT q.*, d.code AS difficulty, s.code AS subject
     FROM quizzes q
     LEFT JOIN difficulty_levels d ON d.id = q.difficulty_id
     LEFT JOIN subjects s ON s.id = q.subject_id
     WHERE q.id = $1`,
    [id],
  )
  const quiz = quizzes.rows[0]
  if (!quiz) return null

  const questions = await db.query<QuestionRow>(
    'SELECT id, type, prompt, explanation, points, config FROM questions WHERE quiz_id = $1 ORDER BY position',
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
    subject: quiz.subject,
    courseId: quiz.course_id,
    canEdit,
    shuffleQuestions: quiz.shuffle_questions,
    shuffleOptions: quiz.shuffle_options,
    sampleSize: quiz.sample_size,
    createdAt: quiz.created_at.toISOString(),
    updatedAt: quiz.updated_at.toISOString(),
    questions: questions.rows.map((question): QuizQuestion => {
      const own = options.rows.filter((o) => o.question_id === question.id)
      const full = {
        type: question.type,
        // the accepted answers of `text` questions never reach the player
        options: own.map((o) => ({ id: o.id, text: o.text, isCorrect: o.is_correct })),
        config: question.config ?? undefined,
      }
      // the editor view (`?include=answers`) keeps correctness flags, explanations and the author's order
      const view = withAnswers
        ? full
        : typeDef(question.type).playerView(full, Math.random, false)
      return {
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        points: question.points,
        ...(withAnswers ? { explanation: question.explanation } : {}),
        options: view.options,
        ...(view.config === undefined ? {} : { config: view.config }),
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
    config: q.config,
  }))
}

async function insertQuestions(client: PoolClient, quizId: string, questions: ParsedQuiz['questions']) {
  for (const [qi, question] of questions.entries()) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO questions (quiz_id, position, type, prompt, explanation, points, verb_id, config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        quizId,
        qi,
        question.type,
        question.prompt,
        question.explanation,
        question.points,
        question.verbId ?? null,
        question.config === undefined || question.config === null ? null : JSON.stringify(question.config),
      ],
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
  ownerId?: string | null
}

export async function createQuiz(
  input: ParsedQuiz,
  meta: QuizMeta,
): Promise<string> {
  return inTransaction(async (client) => {
    const created = await client.query<{ id: string }>(
      `INSERT INTO quizzes (title, description, kind, source, course_id, owner_id, difficulty_id,
                            shuffle_questions, shuffle_options, sample_size, subject_id)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM difficulty_levels WHERE code = $7), $8, $9, $10,
               (SELECT id FROM subjects WHERE code = $11))
       RETURNING id`,
      [
        input.title,
        input.description,
        meta.kind,
        meta.source ?? null,
        meta.courseId ?? null,
        meta.ownerId ?? null,
        meta.difficulty ?? null,
        input.shuffleQuestions ?? null,
        input.shuffleOptions ?? false,
        input.sampleSize ?? null,
        input.subject ?? null,
      ],
    )
    const id = created.rows[0].id
    await insertQuestions(client, id, input.questions)
    // a new quiz has no references yet, so a quiz without images skips the sync entirely
    const mediaIds = quizImageIds(input)
    if (mediaIds.length > 0) await syncRefs('quiz', id, mediaIds, client)
    return id
  })
}

/** Replaces the whole quiz content (question and option ids are regenerated). */
export async function replaceQuiz(id: string, input: ParsedQuiz): Promise<boolean> {
  return inTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE quizzes
       SET title = $2, description = $3, updated_at = now(),
           difficulty_id = (SELECT id FROM difficulty_levels WHERE code = $4),
           shuffle_questions = $5, shuffle_options = $6, sample_size = $7,
           subject_id = (SELECT id FROM subjects WHERE code = $8)
       WHERE id = $1 RETURNING id`,
      [
        id,
        input.title,
        input.description,
        input.difficulty ?? null,
        input.shuffleQuestions ?? null,
        input.shuffleOptions ?? false,
        input.sampleSize ?? null,
        input.subject ?? null,
      ],
    )
    if (updated.rowCount === 0) return false
    await client.query('DELETE FROM questions WHERE quiz_id = $1', [id])
    await insertQuestions(client, id, input.questions)
    // always runs: a quiz that lost its last image must drop its reference (an empty list clears them)
    await syncRefs('quiz', id, quizImageIds(input), client)
    return true
  })
}

/** Deletes the quiz and its media references in one transaction (media_refs has no foreign key to quizzes). */
export async function deleteQuiz(id: string): Promise<boolean> {
  return inTransaction(async (client) => {
    await client.query(`DELETE FROM media_refs WHERE owner_kind = 'quiz' AND owner_id = $1`, [id])
    const result = await client.query('DELETE FROM quizzes WHERE id = $1', [id])
    return (result.rowCount ?? 0) > 0
  })
}

/** Author of a quiz (null for anonymous/legacy quizzes). Course exams belong to the user who started them. */
export async function getOwnerId(id: string): Promise<string | null> {
  const { rows } = await pool().query<{ owner_id: string | null }>(
    'SELECT owner_id FROM quizzes WHERE id = $1',
    [id],
  )
  return rows[0]?.owner_id ?? null
}

export async function saveAttempt(attempt: {
  quizId: string
  quizTitle: string
  userId: string | null
  courseId: string | null
  passed: boolean | null
  answers: Record<string, Answer>
  result: QuizResult
  questionsSnapshot?: SnapshotQuestion[]
}): Promise<string> {
  const { result } = attempt
  const inserted = await pool().query<{ id: string }>(
    `INSERT INTO quiz_attempts
       (quiz_id, quiz_title, user_id, course_id, passed, score, max_score, percent, answers, results,
        questions_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
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
      attempt.questionsSnapshot ? JSON.stringify(attempt.questionsSnapshot) : null,
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

/** question id -> verb id for the questions of a quiz that are about a verb. */
export async function getQuestionVerbs(quizId: string): Promise<Map<string, number>> {
  const { rows } = await pool().query<{ id: string; verb_id: number }>(
    'SELECT id, verb_id FROM questions WHERE quiz_id = $1 AND verb_id IS NOT NULL',
    [quizId],
  )
  return new Map(rows.map((r) => [r.id, r.verb_id]))
}

/** Titles of the given quizzes (for the media refusals, which name the quizzes that use a file). Missing ids are absent. */
export async function quizTitles(ids: readonly string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const unique = [...new Set(ids)]
  if (unique.length === 0) return titles
  const { rows } = await pool().query<{ id: string; title: string }>(
    'SELECT id::text AS id, title FROM quizzes WHERE id::text = ANY($1::text[])',
    [unique],
  )
  for (const row of rows) titles.set(row.id, row.title)
  return titles
}
