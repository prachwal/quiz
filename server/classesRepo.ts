import { randomInt } from 'node:crypto'
import { isWeak } from '../src/shared/quiz/weak'
import type {
  AssignmentItem,
  AssignmentStatus,
  ClassMember,
  ClassReport,
  ClassSummary,
  MyAssignment,
  MyClass,
  StudentAttempt,
  StudentListItem,
  StudentResults,
} from '../src/shared/quiz/types'
import { pool } from './quizRepo'

/** No 0/O/1/I so codes are easy to read out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')

interface ClassRow {
  id: string
  name: string
  owner_id: string
  join_code: string
  member_count: number
  assignment_count: number
  joining_open: boolean
  archived_at: Date | null
  created_at: Date
}

const toClass = (r: ClassRow): ClassSummary => ({
  id: r.id,
  name: r.name,
  ownerId: r.owner_id,
  joinCode: r.join_code,
  memberCount: r.member_count,
  assignmentCount: r.assignment_count,
  joiningOpen: r.joining_open,
  archived: r.archived_at !== null,
  createdAt: r.created_at.toISOString(),
})

const CLASS_SELECT = `
  SELECT c.id, c.name, c.owner_id, c.join_code, c.joining_open, c.archived_at, c.created_at,
         (SELECT COUNT(*)::int FROM class_members m WHERE m.class_id = c.id) AS member_count,
         (SELECT COUNT(*)::int FROM assignments a WHERE a.class_id = c.id) AS assignment_count
  FROM classes c`

export async function createClass(ownerId: string, name: string): Promise<ClassSummary> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await pool().query<{ id: string }>(
        'INSERT INTO classes (name, owner_id, join_code) VALUES ($1, $2, $3) RETURNING id',
        [name, ownerId, newCode()],
      )
      return (await getClass(rows[0].id, ownerId))!
    } catch (error) {
      // unique violation on join_code: draw another code
      if ((error as { code?: string }).code !== '23505') throw error
    }
  }
  throw new Error('Could not generate a unique class code')
}

export async function listClasses(ownerId: string): Promise<ClassSummary[]> {
  const { rows } = await pool().query<ClassRow>(
    `${CLASS_SELECT} WHERE c.owner_id = $1 AND c.archived_at IS NULL ORDER BY c.created_at DESC`,
    [ownerId],
  )
  return rows.map(toClass)
}

/** Every active class of every teacher (read-only admin overview). */
export async function listAllClasses(): Promise<ClassSummary[]> {
  const { rows } = await pool().query<ClassRow>(`${CLASS_SELECT} WHERE c.archived_at IS NULL ORDER BY c.created_at DESC`)
  return rows.map(toClass)
}

/** A class regardless of its owner - callers must have checked that the viewer is allowed to see everything. */
export async function getClassAny(id: string): Promise<ClassSummary | null> {
  const { rows } = await pool().query<ClassRow>(`${CLASS_SELECT} WHERE c.id = $1`, [id])
  return rows[0] ? toClass(rows[0]) : null
}

/** Only the owner can see a class (anything else looks like "not found"). */
export async function getClass(id: string, ownerId: string): Promise<ClassSummary | null> {
  const { rows } = await pool().query<ClassRow>(`${CLASS_SELECT} WHERE c.id = $1 AND c.owner_id = $2`, [id, ownerId])
  return rows[0] ? toClass(rows[0]) : null
}

export async function renameClass(id: string, ownerId: string, name: string) {
  const r = await pool().query('UPDATE classes SET name = $3 WHERE id = $1 AND owner_id = $2', [id, ownerId, name])
  return (r.rowCount ?? 0) > 0
}

export async function setJoiningOpen(id: string, ownerId: string, open: boolean) {
  const r = await pool().query('UPDATE classes SET joining_open = $3 WHERE id = $1 AND owner_id = $2', [id, ownerId, open])
  return (r.rowCount ?? 0) > 0
}

export async function archiveClass(id: string, ownerId: string) {
  const r = await pool().query(
    'UPDATE classes SET archived_at = now() WHERE id = $1 AND owner_id = $2 AND archived_at IS NULL',
    [id, ownerId],
  )
  return (r.rowCount ?? 0) > 0
}

export async function regenerateCode(id: string, ownerId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await pool().query<{ join_code: string }>(
        'UPDATE classes SET join_code = $3 WHERE id = $1 AND owner_id = $2 RETURNING join_code',
        [id, ownerId, newCode()],
      )
      return rows[0]?.join_code ?? null
    } catch (error) {
      if ((error as { code?: string }).code !== '23505') throw error
    }
  }
  return null
}

export async function listMembers(classId: string): Promise<ClassMember[]> {
  const { rows } = await pool().query(
    `SELECT m.user_id, m.joined_at, p.display_name, p.email
     FROM class_members m LEFT JOIN user_profiles p ON p.user_id = m.user_id
     WHERE m.class_id = $1 ORDER BY m.joined_at`,
    [classId],
  )
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.display_name,
    email: r.email,
    joinedAt: r.joined_at.toISOString(),
  }))
}

/**
 * Adds a student by Auth0 id. The id must be a known account (someone who already used the app, or an
 * Auth0 user checked by the caller); `identity` fills the name / e-mail shown to the teacher when we have none.
 */
export async function addMember(
  classId: string,
  userId: string,
  identity?: { name?: string | null; email?: string | null },
): Promise<'added' | 'already'> {
  if (identity && (identity.name || identity.email)) {
    await pool().query(
      `INSERT INTO user_profiles (user_id, display_name, email) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = COALESCE(user_profiles.display_name, $2),
         email = COALESCE(user_profiles.email, $3)`,
      [userId, identity.name ?? null, identity.email ?? null],
    )
  }
  const r = await pool().query(
    'INSERT INTO class_members (class_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [classId, userId],
  )
  return (r.rowCount ?? 0) > 0 ? 'added' : 'already'
}

/** What the app knows about a user from their logins (null when they never used the app). */
export async function profileOf(userId: string): Promise<{ name: string | null; email: string | null } | null> {
  const { rows } = await pool().query('SELECT display_name, email FROM user_profiles WHERE user_id = $1', [userId])
  return rows[0] ? { name: rows[0].display_name, email: rows[0].email } : null
}

/** Students of the given classes (optionally one class), each with the classes they are in. */
export async function listStudents(classIds: string[]): Promise<StudentListItem[]> {
  if (classIds.length === 0) return []
  const { rows } = await pool().query(
    `SELECT m.user_id, p.display_name, p.email, c.id AS class_id, c.name AS class_name
     FROM class_members m
     JOIN classes c ON c.id = m.class_id
     LEFT JOIN user_profiles p ON p.user_id = m.user_id
     WHERE m.class_id = ANY($1::uuid[])
     ORDER BY COALESCE(p.display_name, p.email, m.user_id), c.name`,
    [classIds],
  )
  const students = new Map<string, StudentListItem>()
  for (const r of rows) {
    const item: StudentListItem = students.get(r.user_id) ?? { userId: r.user_id, name: r.display_name, email: r.email, classes: [] }
    item.classes.push({ id: r.class_id, name: r.class_name })
    students.set(r.user_id, item)
  }
  return [...students.values()]
}

export async function removeMember(classId: string, userId: string) {
  const r = await pool().query('DELETE FROM class_members WHERE class_id = $1 AND user_id = $2', [classId, userId])
  return (r.rowCount ?? 0) > 0
}

// ---- student side ----------------------------------------------------------------------

export async function joinClass(userId: string, code: string): Promise<MyClass | 'closed' | null> {
  const { rows } = await pool().query<{ id: string; name: string; joining_open: boolean }>(
    'SELECT id, name, joining_open FROM classes WHERE join_code = $1 AND archived_at IS NULL',
    [code],
  )
  const found = rows[0]
  if (!found) return null
  if (!found.joining_open) {
    // students already in the class can still "join" again (idempotent), newcomers cannot
    const member = await pool().query('SELECT 1 FROM class_members WHERE class_id = $1 AND user_id = $2', [found.id, userId])
    if (member.rows.length === 0) return 'closed'
  }
  const inserted = await pool().query<{ joined_at: Date }>(
    `INSERT INTO class_members (class_id, user_id) VALUES ($1, $2)
     ON CONFLICT (class_id, user_id) DO UPDATE SET class_id = EXCLUDED.class_id RETURNING joined_at`,
    [found.id, userId],
  )
  return { id: found.id, name: found.name, joinedAt: inserted.rows[0].joined_at.toISOString() }
}

export async function leaveClass(userId: string, classId: string) {
  return removeMember(classId, userId)
}

export async function listMyClasses(userId: string): Promise<MyClass[]> {
  const { rows } = await pool().query(
    `SELECT c.id, c.name, m.joined_at FROM class_members m JOIN classes c ON c.id = m.class_id
     WHERE m.user_id = $1 AND c.archived_at IS NULL ORDER BY m.joined_at DESC`,
    [userId],
  )
  return rows.map((r) => ({ id: r.id, name: r.name, joinedAt: r.joined_at.toISOString() }))
}

// ---- assignments -----------------------------------------------------------------------

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
async function loadFacts(userIds: string[]): Promise<Map<string, UserFacts>> {
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

function judge(a: AssignmentItem, f: UserFacts): { status: AssignmentStatus; detail: string; best: number | null } {
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

// ---- one student's results (teacher view) ---------------------------------------------

interface AttemptRow {
  id: string
  quiz_id: string | null
  course_id: string | null
  score: number
  max_score: number
  percent: number
  passed: boolean | null
  created_at: Date
  answers: Record<string, { optionIds?: string[]; text?: string }> | null
  results: { questionId: string; correct: boolean; earned: number; points: number; correctAnswers: string[] }[] | null
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

  const activity = await pool().query<{ last_day: string | null }>(
    `SELECT to_char(MAX(day), 'YYYY-MM-DD') AS last_day FROM daily_activity WHERE user_id = $1`,
    [userId],
  )
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

  // question prompts / option texts (best effort: the quiz may have been edited since)
  const questionIds = [...new Set(attemptRows.rows.flatMap((a) => (a.results ?? []).map((r) => r.questionId)))]
  const prompts = new Map<string, string>()
  const optionTexts = new Map<string, string>()
  if (questionIds.length > 0) {
    const q = await pool().query<{ id: string; prompt: string }>('SELECT id, prompt FROM questions WHERE id = ANY($1::uuid[])', [questionIds])
    for (const r of q.rows) prompts.set(r.id, r.prompt)
    const o = await pool().query<{ id: string; text: string }>(
      'SELECT id, text FROM options WHERE question_id = ANY($1::uuid[])',
      [questionIds],
    )
    for (const r of o.rows) optionTexts.set(r.id, r.text)
  }

  const assignmentOf = (a: AttemptRow) =>
    assignments.find((x) => (x.quizId && x.quizId === a.quiz_id) || (x.courseId && x.courseId === a.course_id))

  return {
    userId,
    name: member.name,
    email: member.email,
    joinedAt: member.joinedAt,
    lessonsCompleted: [...facts.lessonsByCourse.values()].reduce((a, b) => a + b, 0),
    lastActiveDay: activity.rows[0]?.last_day ?? null,
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
          questions: (a.results ?? []).map((r) => {
            const given = a.answers?.[r.questionId]
            const answer = given?.optionIds?.length
              ? given.optionIds.map((id) => optionTexts.get(id) ?? '?').join(', ')
              : (given?.text ?? '')
            return {
              questionId: r.questionId,
              prompt: prompts.get(r.questionId) ?? null,
              correct: r.correct,
              earned: r.earned,
              points: r.points,
              answer,
              correctAnswers: r.correctAnswers,
            }
          }),
        },
      ]
    }),
  }
}
