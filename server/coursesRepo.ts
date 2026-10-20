import type {
  CourseDetail,
  CourseSummary,
  DifficultyCode,
  LessonDetail,
  PopularityCode,
} from '../src/shared/quiz/types'
import { listVerbs } from './irregularVerbs'
import { pool } from './db'

interface CourseRow {
  id: string
  slug: string
  title: string
  description: string
  difficulty: DifficultyCode | null
  popularity: PopularityCode | null
  pass_percent: number
  lesson_count: number
  completed_lessons: number
  verb_count: number
  best_percent: number | null
  passed: boolean
}

const COURSE_SELECT = `
  SELECT c.id, c.slug, c.title, c.description, c.pass_percent, d.code AS difficulty, p.code AS popularity,
         (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
         (SELECT COUNT(*)::int FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
           WHERE l.course_id = c.id AND lp.user_id IS NOT DISTINCT FROM $1) AS completed_lessons,
         (SELECT COUNT(*)::int FROM lesson_verbs lv JOIN lessons l ON l.id = lv.lesson_id
           WHERE l.course_id = c.id) AS verb_count,
         (SELECT MAX(a.percent) FROM quiz_attempts a
           WHERE a.course_id = c.id AND a.user_id IS NOT DISTINCT FROM $1) AS best_percent,
         EXISTS (SELECT 1 FROM quiz_attempts a
           WHERE a.course_id = c.id AND a.user_id IS NOT DISTINCT FROM $1 AND a.passed) AS passed
  FROM courses c
  LEFT JOIN difficulty_levels d ON d.id = c.difficulty_id
  LEFT JOIN popularity_tiers p ON p.id = c.popularity_id`

const toSummary = (row: CourseRow): CourseSummary => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  difficulty: row.difficulty,
  popularity: row.popularity,
  passPercent: row.pass_percent,
  lessonCount: row.lesson_count,
  completedLessons: row.completed_lessons,
  verbCount: row.verb_count,
  bestPercent: row.best_percent,
  passed: row.passed,
})

export async function listCourses(userId: string | null): Promise<CourseSummary[]> {
  const { rows } = await pool().query<CourseRow>(`${COURSE_SELECT} ORDER BY c.position, c.title`, [userId])
  return rows.map(toSummary)
}

export async function getCourse(id: string, userId: string | null): Promise<CourseDetail | null> {
  const { rows } = await pool().query<CourseRow>(`${COURSE_SELECT} WHERE c.id = $2`, [userId, id])
  if (!rows[0]) return null
  const lessons = await pool().query(
    `SELECT l.id, l.position, l.title,
            (SELECT COUNT(*)::int FROM lesson_verbs lv WHERE lv.lesson_id = l.id) AS verb_count,
            EXISTS (SELECT 1 FROM lesson_progress lp
                    WHERE lp.lesson_id = l.id AND lp.user_id IS NOT DISTINCT FROM $2) AS completed
     FROM lessons l WHERE l.course_id = $1 ORDER BY l.position`,
    [id, userId],
  )
  return {
    ...toSummary(rows[0]),
    lessons: lessons.rows.map((l) => ({
      id: l.id,
      position: l.position,
      title: l.title,
      verbCount: l.verb_count,
      completed: l.completed,
    })),
  }
}

export async function getLesson(
  courseId: string,
  lessonId: string,
  userId: string | null,
): Promise<LessonDetail | null> {
  const db = pool()
  const lesson = await db.query(
    `SELECT l.id, l.course_id, l.position, l.title, l.intro, c.title AS course_title,
            EXISTS (SELECT 1 FROM lesson_progress lp
                    WHERE lp.lesson_id = l.id AND lp.user_id IS NOT DISTINCT FROM $3) AS completed
     FROM lessons l JOIN courses c ON c.id = l.course_id
     WHERE l.id = $2 AND l.course_id = $1`,
    [courseId, lessonId, userId],
  )
  const row = lesson.rows[0]
  if (!row) return null

  const neighbours = await db.query(
    `SELECT id, position FROM lessons WHERE course_id = $1 AND position IN ($2, $3)`,
    [courseId, row.position - 1, row.position + 1],
  )
  const verbIds = await db.query<{ verb_id: number }>(
    'SELECT verb_id FROM lesson_verbs WHERE lesson_id = $1 ORDER BY position',
    [lessonId],
  )
  const ids = verbIds.rows.map((v) => v.verb_id)
  const verbs = await listVerbs({ ids })
  const byId = new Map(verbs.map((v) => [v.id, v]))

  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    position: row.position,
    title: row.title,
    intro: row.intro,
    completed: row.completed,
    prevLessonId: neighbours.rows.find((n) => n.position === row.position - 1)?.id ?? null,
    nextLessonId: neighbours.rows.find((n) => n.position === row.position + 1)?.id ?? null,
    verbs: ids.flatMap((id) => byId.get(id) ?? []),
  }
}

/** `created` is false when the lesson had already been completed (so activity is counted once). */
export async function completeLesson(
  courseId: string,
  lessonId: string,
  userId: string | null,
): Promise<{ found: boolean; created: boolean }> {
  const lesson = await pool().query('SELECT 1 FROM lessons WHERE id = $1 AND course_id = $2', [
    lessonId,
    courseId,
  ])
  if (lesson.rows.length === 0) return { found: false, created: false }
  const inserted = await pool().query(
    'INSERT INTO lesson_progress (user_id, lesson_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, lessonId],
  )
  return { found: true, created: (inserted.rowCount ?? 0) > 0 }
}

/** Verb ids of the whole course, for building the final exam. */
export async function courseVerbIds(courseId: string): Promise<number[]> {
  const { rows } = await pool().query<{ verb_id: number }>(
    `SELECT DISTINCT lv.verb_id FROM lesson_verbs lv JOIN lessons l ON l.id = lv.lesson_id
     WHERE l.course_id = $1`,
    [courseId],
  )
  return rows.map((r) => r.verb_id)
}

export async function coursePassInfo(courseId: string) {
  const { rows } = await pool().query<{ id: string; title: string; pass_percent: number }>(
    'SELECT id, title, pass_percent FROM courses WHERE id = $1',
    [courseId],
  )
  return rows[0] ? { id: rows[0].id, title: rows[0].title, passPercent: rows[0].pass_percent } : null
}
