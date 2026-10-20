import { isWeak } from '../../src/shared/quiz/weak'
import type { AssignmentItem, AssignmentStatus, ClassReport, MyAssignment } from '../../src/shared/quiz/types'
import { pool } from '../db'
import { listMembers } from './classes'

/** Assignments of a class (course or manual quiz), the student's own list and the teacher's class report. */

interface AssignmentRow {
  id: string
  class_id: string
  kind: 'course' | 'quiz'
  course_id: string | null
  quiz_id: string | null
  due_at: Date | null
  created_at: Date
  title: string
}

const ASSIGNMENT_SELECT = `
  SELECT a.id, a.class_id, a.kind, a.course_id, a.quiz_id, a.due_at, a.created_at,
         COALESCE(c.title, q.title, 'Usunięte zadanie') AS title
  FROM assignments a
  LEFT JOIN courses c ON c.id = a.course_id
  LEFT JOIN quizzes q ON q.id = a.quiz_id`

const toAssignment = (r: AssignmentRow): AssignmentItem => ({
  id: r.id,
  classId: r.class_id,
  kind: r.kind,
  courseId: r.course_id,
  quizId: r.quiz_id,
  title: r.title,
  dueAt: r.due_at?.toISOString() ?? null,
  createdAt: r.created_at.toISOString(),
})

export async function listAssignments(classId: string): Promise<AssignmentItem[]> {
  const { rows } = await pool().query<AssignmentRow>(
    `${ASSIGNMENT_SELECT} WHERE a.class_id = $1 ORDER BY a.due_at NULLS LAST, a.created_at DESC`,
    [classId],
  )
  return rows.map(toAssignment)
}

export async function createAssignment(
  classId: string,
  createdBy: string,
  input: { kind: 'course' | 'quiz'; courseId?: string; quizId?: string; dueAt?: string | null },
): Promise<AssignmentItem | null> {
  // the referenced course / manual quiz must exist (generated quizzes are personal, not assignable)
  const exists =
    input.kind === 'course'
      ? await pool().query('SELECT 1 FROM courses WHERE id = $1', [input.courseId])
      : await pool().query("SELECT 1 FROM quizzes WHERE id = $1 AND kind = 'manual'", [input.quizId])
  if (exists.rows.length === 0) return null
  const { rows } = await pool().query<{ id: string }>(
    `INSERT INTO assignments (class_id, kind, course_id, quiz_id, due_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [classId, input.kind, input.courseId ?? null, input.quizId ?? null, input.dueAt ?? null, createdBy],
  )
  const list = await pool().query<AssignmentRow>(`${ASSIGNMENT_SELECT} WHERE a.id = $1`, [rows[0].id])
  return toAssignment(list.rows[0])
}

export async function setAssignmentDue(classId: string, assignmentId: string, dueAt: string | null) {
  const r = await pool().query('UPDATE assignments SET due_at = $3 WHERE id = $1 AND class_id = $2', [assignmentId, classId, dueAt])
  return (r.rowCount ?? 0) > 0
}

export async function deleteAssignment(classId: string, assignmentId: string) {
  const r = await pool().query('DELETE FROM assignments WHERE id = $1 AND class_id = $2', [assignmentId, classId])
  return (r.rowCount ?? 0) > 0
}

// ---- progress against assignments -----------------------------------------------------

interface UserFacts {
  /** course id -> completed lessons */
  lessonsByCourse: Map<string, number>
  /** course id -> total lessons */
  totalLessons: Map<string, number>
  /** course id -> best exam percent / passed */
  exam: Map<string, { best: number; passed: boolean }>
  /** quiz id -> best percent */
  quizBest: Map<string, number>
}

/** Loads what is needed to judge assignments for a set of users (a few queries, no N+1). */
export async function loadFacts(userIds: string[]): Promise<Map<string, UserFacts>> {
  const facts = new Map<string, UserFacts>(
    userIds.map((id) => [id, { lessonsByCourse: new Map(), totalLessons: new Map(), exam: new Map(), quizBest: new Map() }]),
  )
  if (userIds.length === 0) return facts

  const totals = await pool().query<{ course_id: string; total: number }>(
    'SELECT course_id, COUNT(*)::int AS total FROM lessons GROUP BY course_id',
  )
  const lessons = await pool().query<{ user_id: string; course_id: string; done: number }>(
    `SELECT lp.user_id, l.course_id, COUNT(*)::int AS done
     FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
     WHERE lp.user_id = ANY($1::text[]) GROUP BY lp.user_id, l.course_id`,
    [userIds],
  )
  const attempts = await pool().query<{
    user_id: string
    quiz_id: string | null
    course_id: string | null
    best: number
    passed: boolean | null
  }>(
    `SELECT user_id, quiz_id, course_id, MAX(percent)::int AS best, BOOL_OR(passed) AS passed
     FROM quiz_attempts WHERE user_id = ANY($1::text[]) GROUP BY user_id, quiz_id, course_id`,
    [userIds],
  )
  for (const f of facts.values()) for (const t of totals.rows) f.totalLessons.set(t.course_id, t.total)
  for (const r of lessons.rows) facts.get(r.user_id)?.lessonsByCourse.set(r.course_id, r.done)
  for (const r of attempts.rows) {
    const f = facts.get(r.user_id)
    if (!f) continue
    if (r.course_id) f.exam.set(r.course_id, { best: r.best, passed: r.passed === true })
    else if (r.quiz_id) f.quizBest.set(r.quiz_id, Math.max(f.quizBest.get(r.quiz_id) ?? 0, r.best))
  }
  return facts
}

/** Status of one assignment for one user, plus a human-readable detail and the best score. */
export function judge(a: AssignmentItem, f: UserFacts): { status: AssignmentStatus; detail: string; best: number | null } {
  if (a.kind === 'course' && a.courseId) {
    const done = f.lessonsByCourse.get(a.courseId) ?? 0
    const total = f.totalLessons.get(a.courseId) ?? 0
    const exam = f.exam.get(a.courseId)
    const status: AssignmentStatus = exam?.passed ? 'done' : done > 0 || exam ? 'in_progress' : 'todo'
    const detail = `lekcje ${done}/${total}${exam ? `, egzamin ${exam.best}%${exam.passed ? ' (zaliczony)' : ''}` : ''}`
    return { status, detail, best: exam?.best ?? null }
  }
  const best = a.quizId ? (f.quizBest.get(a.quizId) ?? null) : null
  return {
    status: best === null ? 'todo' : 'done',
    detail: best === null ? 'nie podjęto' : `najlepszy wynik ${best}%`,
    best,
  }
}

export async function myAssignments(userId: string): Promise<MyAssignment[]> {
  const { rows } = await pool().query<AssignmentRow & { class_name: string }>(
    `${ASSIGNMENT_SELECT.replace('SELECT a.id,', 'SELECT cl.name AS class_name, a.id,')}
     JOIN classes cl ON cl.id = a.class_id
     JOIN class_members m ON m.class_id = a.class_id AND m.user_id = $1
     WHERE cl.archived_at IS NULL
     ORDER BY a.due_at NULLS LAST, a.created_at DESC`,
    [userId],
  )
  const facts = (await loadFacts([userId])).get(userId)!
  const now = Date.now()
  return rows.map((r) => {
    const item = toAssignment(r)
    const { status, detail } = judge(item, facts)
    return {
      ...item,
      className: r.class_name,
      status,
      detail,
      overdue: status !== 'done' && item.dueAt !== null && new Date(item.dueAt).getTime() < now,
    }
  })
}

export async function classReport(classId: string): Promise<ClassReport> {
  const [assignments, members] = await Promise.all([listAssignments(classId), listMembers(classId)])
  const ids = members.map((m) => m.userId)
  const facts = await loadFacts(ids)

  const activity = await pool().query<{ user_id: string; last_day: string }>(
    `SELECT user_id, to_char(MAX(day), 'YYYY-MM-DD') AS last_day FROM daily_activity
     WHERE user_id = ANY($1::text[]) GROUP BY user_id`,
    [ids],
  )
  const lastDay = new Map(activity.rows.map((r) => [r.user_id, r.last_day]))

  const reviewRows = await pool().query<{ user_id: string; attempts: number; correct: number; box: number }>(
    'SELECT user_id, attempts, correct, box FROM verb_reviews WHERE user_id = ANY($1::text[]) AND attempts >= 1',
    [ids],
  )
  const weak = new Map<string, number>()
  for (const r of reviewRows.rows) {
    if (isWeak({ attempts: r.attempts, correct: r.correct, box: r.box, lastWrongAt: null })) {
      weak.set(r.user_id, (weak.get(r.user_id) ?? 0) + 1)
    }
  }

  return {
    assignments,
    rows: members.map((m) => {
      const f = facts.get(m.userId)!
      const statuses: Record<string, AssignmentStatus> = {}
      const bestPercent: Record<string, number | null> = {}
      for (const a of assignments) {
        const j = judge(a, f)
        statuses[a.id] = j.status
        bestPercent[a.id] = j.best
      }
      return {
        userId: m.userId,
        name: m.name,
        email: m.email,
        lessonsCompleted: [...f.lessonsByCourse.values()].reduce((a, b) => a + b, 0),
        lastActiveDay: lastDay.get(m.userId) ?? null,
        weakVerbs: weak.get(m.userId) ?? 0,
        statuses,
        bestPercent,
      }
    }),
  }
}
