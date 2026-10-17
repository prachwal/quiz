import express from 'express'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError, z } from 'zod'
import { gradeQuiz } from '../src/shared/quiz/engine'
import { DIFFICULTIES, POPULARITIES, generateInput, gradeInput, quizInput } from '../src/shared/quiz/schema'
import { currentUserId } from './auth'
import * as courses from './coursesRepo'
import {
  buildVerbQuiz,
  generateIrregularVerbsQuiz,
  listVerbs,
  randomSample,
} from './irregularVerbs'
import * as repo from './quizRepo'

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const idSchema = z.uuid()

const parseId = (value: unknown) => {
  const parsed = idSchema.safeParse(value)
  if (!parsed.success) throw new HttpError(404, 'Quiz not found')
  return parsed.data
}

const notFound = () => new HttpError(404, 'Quiz not found')
const courseNotFound = () => new HttpError(404, 'Course not found')

const verbQuery = z.object({
  difficulty: z.enum(DIFFICULTIES).optional(),
  popularity: z.enum(POPULARITIES).optional(),
  pattern: z.enum(['AAA', 'ABA', 'ABB', 'ABC']).optional(),
})

const examInput = z.object({ count: z.number().int().min(5).max(40).default(15) })

const listQuery = z.object({
  difficulty: z.enum(DIFFICULTIES).optional(),
  sort: z.enum(['recent', 'popular']).optional(),
})

const parseCourseId = (value: unknown) => {
  const parsed = idSchema.safeParse(value)
  if (!parsed.success) throw courseNotFound()
  return parsed.data
}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  // Netlify rewrites /api/* to the function, so strip either prefix before routing.
  app.use(((req, _res, next) => {
    req.url = req.url.replace(/^\/(?:\.netlify\/functions\/api|api)(?=\/|\?|$)/, '') || '/'
    next()
  }) satisfies RequestHandler)

  const router = express.Router()

  router.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  router.get('/quizzes', async (req, res) => {
    const { difficulty, sort } = listQuery.parse(req.query)
    res.json(await repo.listQuizzes({ difficulty, sort }))
  })

  router.post('/quizzes', async (req, res) => {
    const input = quizInput.parse(req.body)
    const id = await repo.createQuiz(input)
    res.status(201).json(await repo.getQuiz(id, true))
  })

  router.post('/quizzes/generate/irregular-verbs', async (req, res) => {
    const options = generateInput.parse(req.body ?? {})
    const { quiz, difficulty } = await generateIrregularVerbsQuiz(options)
    if (quiz.questions.length === 0) throw new HttpError(422, 'Brak czasowników dla wybranych kryteriów')
    const id = await repo.createQuiz(quiz, { kind: 'generated', source: 'irregular-verbs', difficulty })
    res.status(201).json(await repo.getQuiz(id, false))
  })

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
    res.json(lesson)
  })

  router.post('/courses/:id/lessons/:lessonId/complete', async (req, res) => {
    const lessonId = idSchema.safeParse(req.params.lessonId)
    const ok =
      lessonId.success &&
      (await courses.completeLesson(parseCourseId(req.params.id), lessonId.data, currentUserId(req)))
    if (!ok) throw new HttpError(404, 'Lesson not found')
    res.status(204).end()
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
    })
    res.status(201).json(await repo.getQuiz(id, false))
  })

  router.get('/attempts', async (req, res) => {
    res.json(await repo.listAttempts(currentUserId(req)))
  })

  router.get('/quizzes/:id', async (req, res) => {
    const quiz = await repo.getQuiz(parseId(req.params.id), req.query.include === 'answers')
    if (!quiz) throw notFound()
    res.json(quiz)
  })

  router.put('/quizzes/:id', async (req, res) => {
    const id = parseId(req.params.id)
    const input = quizInput.parse(req.body)
    if (!(await repo.replaceQuiz(id, input))) throw notFound()
    res.json(await repo.getQuiz(id, true))
  })

  router.delete('/quizzes/:id', async (req, res) => {
    if (!(await repo.deleteQuiz(parseId(req.params.id)))) throw notFound()
    res.status(204).end()
  })

  router.post('/quizzes/:id/grade', async (req, res) => {
    const id = parseId(req.params.id)
    const { answers } = gradeInput.parse(req.body)
    const quiz = await repo.getQuiz(id, true)
    if (!quiz) throw notFound()
    const result = gradeQuiz(repo.toGradable(quiz), answers)
    const course = quiz.courseId ? await courses.coursePassInfo(quiz.courseId) : null
    const passed = course ? result.percent >= course.passPercent : null
    const attemptId = await repo.saveAttempt({
      quizId: id,
      quizTitle: quiz.title,
      userId: currentUserId(req),
      courseId: course?.id ?? null,
      passed,
      answers,
      result,
    })
    res.json({
      ...result,
      attemptId,
      course: course ? { ...course, passed: passed === true } : null,
    })
  })

  app.use(router)

  app.use(((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  }) satisfies RequestHandler)

  app.use(((error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    } else if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message })
    } else if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'Invalid JSON body' })
    } else {
      console.error(error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }) satisfies ErrorRequestHandler)

  return app
}
