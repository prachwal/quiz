import { promptText } from '../../src/shared/quiz/engine'
import { isWeak } from '../../src/shared/quiz/weak'
import type {
  AdminStudentAttempt,
  AdminStudentListItem,
  StudentAttempt,
  StudentAttemptQuestion,
  StudentResults,
} from '../../src/shared/quiz/types'
import { pool } from '../db'
import { judge, listAssignments, loadFacts } from './assignments'
import { listMembers } from './classes'

/** Results of one student: the teacher's view of a class member and the admin's view of any account. */

export interface AttemptRow {
  id: string
  quiz_id: string | null
  course_id: string | null
  score: number
  max_score: number
  percent: number
  passed: boolean | null
  created_at: Date
  answers: Record<string, { optionIds?: string[]; text?: string }> | null
  results:
    | {
        questionId: string
        correct: boolean
        earned: number
        points: number
        correctAnswers: string[]
        answerText?: string
      }[]
    | null
}

/**
 * Per-question view of saved attempts: prompt, the student's answer as text and the correct answers.
 * Best effort - questions edited away since the attempt show without a prompt.
 */
export async function questionDetails(rows: AttemptRow[]): Promise<(a: AttemptRow) => StudentAttemptQuestion[]> {
  const questionIds = [...new Set(rows.flatMap((a) => (a.results ?? []).map((r) => r.questionId)))]
  const prompts = new Map<string, string>()
  const optionTexts = new Map<string, string>()
  if (questionIds.length > 0) {
    const q = await pool().query<{ id: string; prompt: string }>('SELECT id, prompt FROM questions WHERE id = ANY($1::uuid[])', [questionIds])
    for (const r of q.rows) prompts.set(r.id, r.prompt)
    const o = await pool().query<{ id: string; text: string }>('SELECT id, text FROM options WHERE question_id = ANY($1::uuid[])', [questionIds])
    for (const r of o.rows) optionTexts.set(r.id, r.text)
  }
  return (a) =>
    (a.results ?? []).map((r) => {
      const given = a.answers?.[r.questionId]
      // attempts saved after the config work carry the readable answer; older rows fall back
      const answer =
        r.answerText ??
        (given?.optionIds?.length
          ? given.optionIds.map((id) => optionTexts.get(id) ?? '?').join(', ')
          : (given?.text ?? ''))
      const prompt = prompts.get(r.questionId)
      return {
        questionId: r.questionId,
        prompt: prompt === undefined ? null : promptText(prompt),
        correct: r.correct,
        earned: r.earned,
        points: r.points,
        answer,
        correctAnswers: r.correctAnswers,
      }
    })
}

/**
 * Results of a class member, limited to what the class assigned: attempts of the assigned quizzes and
 * course exams plus course progress. Returns null when the user is not a member of the class.
 */
export async function studentResults(classId: string, userId: string): Promise<StudentResults | null> {
  const members = await listMembers(classId)
  const member = members.find((m) => m.userId === userId)
  if (!member) return null
  const assignments = await listAssignments(classId)
  const facts = (await loadFacts([userId])).get(userId)!

  const lastActiveDay = await lastActiveDayOf(userId)
  const reviews = await pool().query<{ attempts: number; correct: number; box: number }>(
    'SELECT attempts, correct, box FROM verb_reviews WHERE user_id = $1 AND attempts >= 1',
    [userId],
  )
  const weakVerbs = reviews.rows.filter((r) => isWeak({ ...r, lastWrongAt: null })).length

  const quizIds = assignments.flatMap((a) => (a.quizId ? [a.quizId] : []))
  const courseIds = assignments.flatMap((a) => (a.courseId ? [a.courseId] : []))
  const attemptRows = await pool().query<AttemptRow>(
    `SELECT id, quiz_id, course_id, score::float AS score, max_score::float AS max_score, percent, passed,
            created_at, answers, results
     FROM quiz_attempts
     WHERE user_id = $1 AND (quiz_id = ANY($2::uuid[]) OR course_id = ANY($3::uuid[]))
     ORDER BY created_at DESC LIMIT 50`,
    [userId, quizIds, courseIds],
  )

  const questionsOf = await questionDetails(attemptRows.rows)

  const assignmentOf = (a: AttemptRow) =>
    assignments.find((x) => (x.quizId && x.quizId === a.quiz_id) || (x.courseId && x.courseId === a.course_id))

  return {
    userId,
    name: member.name,
    email: member.email,
    joinedAt: member.joinedAt,
    lessonsCompleted: [...facts.lessonsByCourse.values()].reduce((a, b) => a + b, 0),
    lastActiveDay,
    weakVerbs,
    assignments: assignments.map((a) => {
      const j = judge(a, facts)
      return {
        assignmentId: a.id,
        title: a.title,
        kind: a.kind,
        dueAt: a.dueAt,
        status: j.status,
        detail: j.detail,
        bestPercent: j.best,
      }
    }),
    attempts: attemptRows.rows.flatMap((a): StudentAttempt[] => {
      const assignment = assignmentOf(a)
      if (!assignment) return []
      return [
        {
          id: a.id,
          assignmentId: assignment.id,
          title: assignment.title,
          score: a.score,
          maxScore: a.max_score,
          percent: a.percent,
          passed: a.passed,
          createdAt: a.created_at.toISOString(),
          questions: questionsOf(a),
        },
      ]
    }),
  }
}

// ---- admin: a student's complete results ----------------------------------------------------

interface AdminAttemptRow extends AttemptRow {
  quiz_title: string
  source: string | null
}

/** Every attempt of a user (newest first, at most `limit`), with per-question details. */
export async function allAttempts(userId: string, limit = 200): Promise<AdminStudentAttempt[]> {
  const { rows } = await pool().query<AdminAttemptRow>(
    `SELECT a.id, a.quiz_id, a.course_id, a.quiz_title, a.score::float AS score, a.max_score::float AS max_score,
            a.percent, a.passed, a.created_at, a.answers, a.results,
            CASE WHEN q.id IS NULL THEN NULL WHEN q.kind = 'manual' THEN 'manual' ELSE q.source END AS source
     FROM quiz_attempts a LEFT JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.user_id = $1
     ORDER BY a.created_at DESC LIMIT $2`,
    [userId, limit],
  )
  const questionsOf = await questionDetails(rows)
  return rows.map((a) => ({
    id: a.id,
    title: a.quiz_title,
    quizId: a.quiz_id,
    courseId: a.course_id,
    source: a.course_id ? 'course-exam' : a.source,
    score: a.score,
    maxScore: a.max_score,
    percent: a.percent,
    passed: a.passed,
    createdAt: a.created_at.toISOString(),
    questions: questionsOf(a),
  }))
}

/** Last day with recorded activity (YYYY-MM-DD), null without any. */
export async function lastActiveDayOf(userId: string): Promise<string | null> {
  const { rows } = await pool().query<{ last_day: string | null }>(
    `SELECT to_char(MAX(day), 'YYYY-MM-DD') AS last_day FROM daily_activity WHERE user_id = $1`,
    [userId],
  )
  return rows[0]?.last_day ?? null
}

/** Every saved attempt of a user, without loading them. */
export async function countAttempts(userId: string): Promise<number> {
  const { rows } = await pool().query<{ n: number }>('SELECT COUNT(*)::int AS n FROM quiz_attempts WHERE user_id = $1', [userId])
  return rows[0]?.n ?? 0
}

export async function totalLessonsCompleted(userId: string): Promise<number> {
  const { rows } = await pool().query<{ n: number }>('SELECT COUNT(*)::int AS n FROM lesson_progress WHERE user_id = $1', [userId])
  return rows[0]?.n ?? 0
}

/** Classes a user belongs to (active ones), with the teacher's name. */
export async function classesOfMember(userId: string): Promise<{ id: string; name: string; ownerName: string | null }[]> {
  const { rows } = await pool().query(
    `SELECT c.id, c.name, p.display_name AS owner_name
     FROM class_members m JOIN classes c ON c.id = m.class_id LEFT JOIN user_profiles p ON p.user_id = c.owner_id
     WHERE m.user_id = $1 AND c.archived_at IS NULL ORDER BY c.name`,
    [userId],
  )
  return rows.map((r) => ({ id: r.id, name: r.name, ownerName: r.owner_name }))
}

/**
 * Everyone who has used the app (profile row), newest activity first; `q` filters by part of the name, e-mail
 * or Auth0 id. For the admin's student picker.
 */
export async function searchUsers(q: string, limit = 50): Promise<AdminStudentListItem[]> {
  const pattern = q ? `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : null
  const { rows } = await pool().query(
    `SELECT p.user_id, p.display_name, p.email,
            (SELECT to_char(MAX(d.day), 'YYYY-MM-DD') FROM daily_activity d WHERE d.user_id = p.user_id) AS last_day,
            (SELECT COUNT(*)::int FROM quiz_attempts a WHERE a.user_id = p.user_id) AS attempts
     FROM user_profiles p
     WHERE $1::text IS NULL OR p.display_name ILIKE $1 OR p.email ILIKE $1 OR p.user_id ILIKE $1
     ORDER BY last_day DESC NULLS LAST, p.display_name NULLS LAST
     LIMIT $2`,
    [pattern, limit],
  )
  return rows.map((r) => ({ userId: r.user_id, name: r.display_name, email: r.email, lastActiveDay: r.last_day, attempts: r.attempts }))
}
