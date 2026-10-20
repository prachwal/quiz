import type { Router } from 'express'
import { z } from 'zod'
import { extractMediaIds } from '../../src/shared/media/richText'
import { DIFFICULTIES, POPULARITIES } from '../../src/shared/quiz/schema'
import { currentUserId } from '../auth'
import * as courses from '../coursesRepo'
import { HttpError, courseNotFound, idSchema, parseCourseId, userOf } from '../http'
import { buildVerbQuiz, listVerbs, randomSample } from '../irregularVerbs'
import { withMedia } from '../media/mediaMap'
import { resolveMedia } from '../media/resolve'
import * as progress from '../progressRepo'
import * as repo from '../quizRepo'
import * as reviews from '../reviewsRepo'

/** Verb catalog and the learning module (courses, lessons, the final exam). */

const verbQuery = z.object({
  difficulty: z.enum(DIFFICULTIES).optional(),
  popularity: z.enum(POPULARITIES).optional(),
  pattern: z.enum(['AAA', 'ABA', 'ABB', 'ABC']).optional(),
})

const examInput = z.object({ count: z.number().int().min(5).max(40).default(15) })

export function registerLearningRoutes(router: Router) {
  router.get('/irregular-verbs', async (req, res) => {
    const filter = verbQuery.parse(req.query)
    res.json(await listVerbs(filter))
  })

  router.get('/courses', async (req, res) => {
    res.json(await courses.listCourses(currentUserId(req)))
  })

  router.get('/courses/:id', async (req, res) => {
    const course = await courses.getCourse(parseCourseId(req.params.id), currentUserId(req))
    if (!course) throw courseNotFound()
    res.json(course)
  })

  router.get('/courses/:id/lessons/:lessonId', async (req, res) => {
    const lessonId = idSchema.safeParse(req.params.lessonId)
    const lesson = lessonId.success
      ? await courses.getLesson(parseCourseId(req.params.id), lessonId.data, currentUserId(req))
      : null
    if (!lesson) throw new HttpError(404, 'Lesson not found')
    // the intro's images only; without images there is no `media` key and the JSON is unchanged
    res.json(withMedia(lesson, await resolveMedia(extractMediaIds(lesson.intro))))
  })

  router.post('/courses/:id/lessons/:lessonId/complete', async (req, res) => {
    const lessonId = idSchema.safeParse(req.params.lessonId)
    const result = lessonId.success
      ? await courses.completeLesson(parseCourseId(req.params.id), lessonId.data, currentUserId(req))
      : null
    if (!result?.found) throw new HttpError(404, 'Lesson not found')
    if (result.created) {
      await progress.recordActivity(userOf(req), { lessons: 1 })
      await reviews.enqueueLessonVerbs(userOf(req), String(req.params.lessonId))
    }
    res.json({ ok: true })
  })

  // Final exam: available once every lesson of the course is completed.
  router.post('/courses/:id/exam', async (req, res) => {
    const courseId = parseCourseId(req.params.id)
    const course = await courses.getCourse(courseId, currentUserId(req))
    if (!course) throw courseNotFound()
    if (course.completedLessons < course.lessonCount) {
      throw new HttpError(409, 'Ukończ wszystkie lekcje, aby przystąpić do egzaminu')
    }
    const { count } = examInput.parse(req.body ?? {})
    const [pool, verbIds] = await Promise.all([listVerbs(), courses.courseVerbIds(courseId)])
    const idSet = new Set(verbIds)
    const verbs = randomSample(
      pool.filter((v) => idSet.has(v.id)),
      count,
    )
    const quiz = buildVerbQuiz(
      verbs,
      pool,
      'mixed',
      `Egzamin: ${course.title}`,
      `Egzamin końcowy kursu (${verbs.length} pytań). Próg zaliczenia: ${course.passPercent}%.`,
    )
    const id = await repo.createQuiz(quiz, {
      kind: 'generated',
      source: 'course-exam',
      difficulty: course.difficulty,
      courseId,
      ownerId: currentUserId(req),
    })
    res.status(201).json(await repo.getQuiz(id, false))
  })
}
