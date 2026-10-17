import express from 'express'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { randomUUID } from 'node:crypto'
import { ZodError, z } from 'zod'
import { gradeQuiz } from '../src/shared/quiz/engine'
import {
  DIFFICULTIES,
  POPULARITIES,
  blockedInput,
  feedbackInput,
  feedbackStatusInput,
  generateInput,
  gradeInput,
  quizInput,
  rolesInput,
  tokenInput,
} from '../src/shared/quiz/schema'
import * as admin from './adminRepo'
import * as tokens from './apiTokens'
import * as auth0 from './auth0Management'
import { initSentry, reportServerError } from './sentry'
import {
  MANAGE_USERS,
  WRITE_QUIZZES,
  authenticate,
  currentUserId,
  hasPermission,
  requireAuthenticated,
  requireJwt,
  requirePermission,
} from './auth'
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

/** Id of the caller; every route except /health runs behind `requireAuthenticated`. */
const userOf = (req: Parameters<typeof currentUserId>[0]) => currentUserId(req) as string

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
  initSentry()
  const app = express()
  app.disable('x-powered-by')
  // correlate logs, Sentry events, the error screen and feedback reports
  app.use((req, res, next) => {
    const requestId = String(req.headers['x-nf-request-id'] ?? randomUUID())
    res.locals.requestId = requestId
    res.set('X-Request-Id', requestId)
    next()
  })
  // Responses are private and per user: no ETag / conditional GET (a 304 breaks the Netlify
  // function response adapter) and nothing should be cached by browsers or proxies.
  app.set('etag', false)
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '1mb' }))

  // Netlify rewrites /api/* to the function, so strip either prefix before routing.
  app.use(((req, _res, next) => {
    req.url = req.url.replace(/^\/(?:\.netlify\/functions\/api|api)(?=\/|\?|$)/, '') || '/'
    next()
  }) satisfies RequestHandler)

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  // everything below is private: Bearer JWT (Auth0) or personal API token
  app.use(authenticate, requireAuthenticated)

  const router = express.Router()

  router.get('/quizzes', async (req, res) => {
    const { difficulty, sort } = listQuery.parse(req.query)
    res.json(await repo.listQuizzes({ difficulty, sort }, hasPermission(req, WRITE_QUIZZES)))
  })

  router.post('/quizzes', requirePermission(WRITE_QUIZZES), async (req, res) => {
    const input = quizInput.parse(req.body)
    const userId = userOf(req)
    const id = await repo.createQuiz(input, { kind: 'manual', difficulty: input.difficulty, ownerId: userId })
    res.status(201).json(await repo.getQuiz(id, true, true))
  })

  router.post('/quizzes/generate/irregular-verbs', async (req, res) => {
    const options = generateInput.parse(req.body ?? {})
    const { quiz, difficulty } = await generateIrregularVerbsQuiz(options)
    if (quiz.questions.length === 0) throw new HttpError(422, 'Brak czasowników dla wybranych kryteriów')
    const id = await repo.createQuiz(quiz, {
      kind: 'generated',
      source: 'irregular-verbs',
      difficulty,
      ownerId: currentUserId(req),
    })
    res.status(201).json(await repo.getQuiz(id, false))
  })

  router.get('/tokens', requireJwt, async (req, res) => {
    res.json(await tokens.listApiTokens(userOf(req)))
  })

  router.post('/tokens', requireJwt, async (req, res) => {
    const input = tokenInput.parse(req.body ?? {})
    if (input.write && !hasPermission(req, WRITE_QUIZZES)) {
      throw new HttpError(403, 'Token z prawem zapisu może utworzyć tylko admin')
    }
    const created = await tokens.createApiToken({
      userId: userOf(req),
      name: input.name,
      permissions: input.write ? [WRITE_QUIZZES] : [],
      expiresInDays: input.expiresInDays,
    })
    if (created === 'limit') throw new HttpError(409, 'Osiągnięto limit aktywnych tokenów (20)')
    res.status(201).json(created)
  })

  router.delete('/tokens/:id', requireJwt, async (req, res) => {
    const id = idSchema.safeParse(req.params.id)
    if (!id.success || !(await tokens.revokeApiToken(id.data, userOf(req)))) {
      throw new HttpError(404, 'Token not found')
    }
    res.status(204).end()
  })

  // ---- feedback (any signed-in user) -------------------------------------------------
  router.post('/feedback', async (req, res) => {
    const input = feedbackInput.parse(req.body)
    const id = await admin.createFeedback({
      userId: userOf(req),
      userLabel: input.userLabel,
      kind: input.kind,
      message: input.message,
      context: input.context,
    })
    res.status(201).json({ id })
  })

  // ---- admin panel: feedback, users, audit (permission manage:users, JWT sessions only) ----
  const adminOnly = requirePermission(MANAGE_USERS)
  const idParam = (value: unknown) => {
    const parsed = idSchema.safeParse(value)
    if (!parsed.success) throw new HttpError(404, 'Not found')
    return parsed.data
  }

  router.get('/admin/feedback', adminOnly, async (req, res) => {
    const status = z.enum(['new', 'in_progress', 'done']).optional().parse(req.query.status)
    res.json(await admin.listFeedback(status))
  })

  router.patch('/admin/feedback/:id', adminOnly, async (req, res) => {
    const { status } = feedbackStatusInput.parse(req.body)
    const item = await admin.setFeedbackStatus(idParam(req.params.id), status)
    if (!item) throw new HttpError(404, 'Feedback not found')
    await admin.writeAudit({
      actorId: userOf(req),
      actorLabel: await auth0.userLabel(userOf(req)),
      action: 'feedback.status',
      targetId: item.id,
      targetLabel: item.message.slice(0, 80),
      details: { status },
    })
    res.json(item)
  })

  router.get('/admin/users', adminOnly, async (req, res) => {
    const { q, page } = z
      .object({ q: z.string().max(100).default(''), page: z.coerce.number().int().min(0).max(1000).default(0) })
      .parse(req.query)
    res.json(await auth0.listUsers(q, page, 20))
  })

  router.put('/admin/users/:id/roles', adminOnly, async (req, res) => {
    const targetId = String(req.params.id)
    const { roles } = rolesInput.parse(req.body)
    const desired = [...new Set(roles)]
    const target = await auth0.getUser(targetId)
    const removingAdmin = target.roles.includes('admin') && !desired.includes('admin')
    if (removingAdmin) {
      if (targetId === userOf(req)) throw new HttpError(409, 'Nie możesz odebrać sobie roli admin')
      if ((await auth0.countAdmins()) <= 1) throw new HttpError(409, 'Nie można odebrać roli ostatniemu adminowi')
    }
    await auth0.setManagedRoles(targetId, target.roles, desired)
    await admin.writeAudit({
      actorId: userOf(req),
      actorLabel: await auth0.userLabel(userOf(req)),
      action: 'roles.update',
      targetId,
      targetLabel: target.email ?? target.name,
      details: { from: target.roles, to: desired },
    })
    res.json({ ...target, roles: desired })
  })

  router.patch('/admin/users/:id/blocked', adminOnly, async (req, res) => {
    const targetId = String(req.params.id)
    const { blocked } = blockedInput.parse(req.body)
    if (blocked && targetId === userOf(req)) throw new HttpError(409, 'Nie możesz zablokować własnego konta')
    const target = await auth0.getUser(targetId)
    if (blocked && target.roles.includes('admin') && (await auth0.countAdmins()) <= 1) {
      throw new HttpError(409, 'Nie można zablokować ostatniego admina')
    }
    await auth0.setBlocked(targetId, blocked)
    await admin.writeAudit({
      actorId: userOf(req),
      actorLabel: await auth0.userLabel(userOf(req)),
      action: blocked ? 'user.block' : 'user.unblock',
      targetId,
      targetLabel: target.email ?? target.name,
    })
    res.json({ ...target, blocked })
  })

  router.get('/admin/audit', adminOnly, async (_req, res) => {
    res.json(await admin.listAudit())
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
      ownerId: currentUserId(req),
    })
    res.status(201).json(await repo.getQuiz(id, false))
  })

  router.get('/attempts', async (req, res) => {
    res.json(await repo.listAttempts(userOf(req)))
  })

  router.get('/quizzes/:id', async (req, res) => {
    const withAnswers = req.query.include === 'answers'
    const canEdit = hasPermission(req, WRITE_QUIZZES)
    // correct answers are only revealed to people who may edit quizzes
    if (withAnswers && !canEdit) {
      throw new HttpError(currentUserId(req) ? 403 : 401, 'Ta operacja wymaga roli admin')
    }
    const quiz = await repo.getQuiz(parseId(req.params.id), withAnswers, canEdit)
    if (!quiz) throw notFound()
    res.json(quiz)
  })

  router.put('/quizzes/:id', requirePermission(WRITE_QUIZZES), async (req, res) => {
    const id = parseId(req.params.id)
    const input = quizInput.parse(req.body)
    if (!(await repo.replaceQuiz(id, input))) throw notFound()
    res.json(await repo.getQuiz(id, true, true))
  })

  router.delete('/quizzes/:id', requirePermission(WRITE_QUIZZES), async (req, res) => {
    if (!(await repo.deleteQuiz(parseId(req.params.id)))) throw notFound()
    res.status(204).end()
  })

  router.post('/quizzes/:id/grade', async (req, res) => {
    const id = parseId(req.params.id)
    const { answers } = gradeInput.parse(req.body)
    const userId = currentUserId(req)
    const quiz = await repo.getQuiz(id, true)
    if (!quiz) throw notFound()
    // course exams are personal: only the signed-in user who started the exam can submit it
    if (quiz.courseId && (!userId || userId !== (await repo.getOwnerId(id)))) {
      throw new HttpError(userId ? 403 : 401, 'Egzamin wymaga zalogowania')
    }
    const result = gradeQuiz(repo.toGradable(quiz), answers)
    const course = quiz.courseId ? await courses.coursePassInfo(quiz.courseId) : null
    const passed = course ? result.percent >= course.passPercent : null
    const attemptId = await repo.saveAttempt({
      quizId: id,
      quizTitle: quiz.title,
      userId,
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

  app.use((async (error, req, res, _next) => {
    const requestId = String(res.locals.requestId ?? '')
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    } else if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message })
    } else if (error instanceof auth0.ManagementError) {
      res.status(error.status).json({ error: error.message, requestId })
    } else if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'Invalid JSON body' })
    } else {
      // unexpected: structured log + Sentry; the client gets the request id to quote in a report
      console.error(
        JSON.stringify({
          level: 'error',
          requestId,
          method: req.method,
          path: req.path,
          userId: currentUserId(req),
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      )
      const eventId = await reportServerError(error, {
        requestId,
        userId: currentUserId(req),
        method: req.method,
        path: req.path,
      })
      res.status(500).json({ error: 'Internal server error', requestId, eventId })
    }
  }) satisfies ErrorRequestHandler)

  return app
}
