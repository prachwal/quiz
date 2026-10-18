import express from 'express'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { randomUUID } from 'node:crypto'
import { ZodError, z } from 'zod'
import { reportToCsv } from '../src/shared/quiz/csv'
import { gradeQuiz } from '../src/shared/quiz/engine'
import {
  DIFFICULTIES,
  POPULARITIES,
  assignmentInput,
  blockedInput,
  addMemberInput,
  assignmentPatchInput,
  classInput,
  classPatchInput,
  feedbackInput,
  feedbackStatusInput,
  generateInput,
  gradeInput,
  joinInput,
  profileInput,
  quizInput,
  retryWrongInput,
  reviewSessionInput,
  rolesInput,
  tokenInput,
} from '../src/shared/quiz/schema'
import { mcpHandler, mcpNotAllowed } from './mcp'
import { resolveGradedIds } from '../src/shared/quiz/sampling'
import { analyzeClass } from '../src/shared/quiz/classAnalysis'
import * as admin from './adminRepo'
import { canReadClasses, readableClass, resolveStudent, viewerOf, visibleClasses, writableClass } from './classAccess'
import * as progress from './progressRepo'
import * as reviews from './reviewsRepo'
import * as classes from './classesRepo'
import * as tokens from './apiTokens'
import * as auth0 from './auth0Management'
import { initSentry, reportServerError } from './sentry'
import {
  MANAGE_CLASSES,
  MANAGE_USERS,
  WRITE_QUIZZES,
  authenticate,
  currentUserId,
  hasPermission,
  identityOf,
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

// Note: handlers answer `{ ok: true }` instead of `204 No Content` - the Netlify function response
// adapter rejects status codes that must not carry a body (204/304) when the body is an empty string.
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

  // Model Context Protocol server for AI clients (Claude, OpenAI, Grok...) - same auth as the REST API
  app.post('/mcp', mcpHandler)
  app.all('/mcp', mcpNotAllowed)

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

    if (options.onlyWeak) {
      // error training: the verbs the user struggles with, topped up with random ones if there are too few
      const weak = await reviews.weakVerbs(userOf(req), options.count)
      if (weak.length === 0) {
        throw new HttpError(409, 'Brak danych o słabych czasownikach - rozwiąż kilka quizów, a pojawią się tutaj')
      }
      const pool = await listVerbs()
      const weakIds = new Set(weak.map((w) => w.verbId))
      const chosen = [
        ...pool.filter((v) => weakIds.has(v.id)),
        ...randomSample(
          pool.filter((v) => !weakIds.has(v.id)),
          Math.max(0, options.count - weak.length),
        ),
      ]
      const quiz = buildVerbQuiz(
        chosen,
        pool,
        options.variant,
        'Trening błędów',
        `${weak.length} słabych czasowników${chosen.length > weak.length ? ` i ${chosen.length - weak.length} uzupełniających` : ''}.`,
      )
      const id = await repo.createQuiz(quiz, { kind: 'generated', source: 'weak', ownerId: userOf(req) })
      res.status(201).json(await repo.getQuiz(id, false))
      return
    }

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

  // "Retry the mistakes": a new quiz from the verbs behind the questions answered wrongly
  router.post('/quizzes/:id/retry-wrong', async (req, res) => {
    const id = parseId(req.params.id)
    const { questionIds } = retryWrongInput.parse(req.body)
    const verbOf = await repo.getQuestionVerbs(id)
    const verbIds = [...new Set(questionIds.flatMap((q) => (verbOf.has(q) ? [verbOf.get(q)!] : [])))]
    if (verbIds.length === 0) throw new HttpError(409, 'Brak czasowników do powtórzenia w tych pytaniach')
    const [pool, verbs] = await Promise.all([listVerbs(), listVerbs({ ids: verbIds })])
    const quiz = buildVerbQuiz(
      verbs,
      pool,
      'mixed',
      'Powtórz błędne',
      `${verbs.length} czasowników, w których pomyliłeś się w poprzednim quizie.`,
    )
    const newId = await repo.createQuiz(quiz, { kind: 'generated', source: 'weak', ownerId: userOf(req) })
    res.status(201).json(await repo.getQuiz(newId, false))
  })

  router.get('/tokens', requireJwt, async (req, res) => {
    res.json(await tokens.listApiTokens(userOf(req)))
  })

  router.post('/tokens', requireJwt, async (req, res) => {
    const input = tokenInput.parse(req.body ?? {})
    if (input.write && !hasPermission(req, WRITE_QUIZZES)) {
      throw new HttpError(403, 'Token z prawem zapisu może utworzyć tylko admin')
    }
    if (input.classes && !hasPermission(req, MANAGE_CLASSES)) {
      throw new HttpError(403, 'Token z dostępem do klas może utworzyć tylko nauczyciel')
    }
    const created = await tokens.createApiToken({
      userId: userOf(req),
      name: input.name,
      permissions: [...(input.write ? [WRITE_QUIZZES] : []), ...(input.classes ? [MANAGE_CLASSES] : [])],
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
    res.json({ ok: true })
  })

  const idParam = (value: unknown) => {
    const parsed = idSchema.safeParse(value)
    if (!parsed.success) throw new HttpError(404, 'Not found')
    return parsed.data
  }

  // ---- classes: student side (any signed-in user) -------------------------------------
  router.post('/classes/join', async (req, res) => {
    const { code } = joinInput.parse(req.body)
    const identity = identityOf(req)
    if (identity?.via === 'jwt') await progress.syncIdentity(identity.userId, identity)
    const joined = await classes.joinClass(userOf(req), code)
    if (!joined) throw new HttpError(404, 'Nie znaleziono klasy o takim kodzie')
    if (joined === 'closed') throw new HttpError(403, 'Ta klasa nie przyjmuje nowych uczniów')
    res.status(201).json(joined)
  })

  router.get('/my/classes', async (req, res) => {
    res.json(await classes.listMyClasses(userOf(req)))
  })

  router.delete('/my/classes/:id', async (req, res) => {
    if (!(await classes.leaveClass(userOf(req), idParam(req.params.id)))) throw new HttpError(404, 'Class not found')
    res.json({ ok: true })
  })

  router.get('/my/assignments', async (req, res) => {
    res.json(await classes.myAssignments(userOf(req)))
  })

  // ---- classes: teacher side (permission manage:classes; a class is visible only to its owner) ----
  const teacherOnly = requirePermission(MANAGE_CLASSES)
  // reading is also open to admins (`manage:users`), who see every class; changing stays with the owner
  const classReader: RequestHandler = (req, res, next) => {
    if (canReadClasses(viewerOf(req))) next()
    else res.status(403).json({ error: 'Ta operacja wymaga roli nauczyciela' })
  }
  const ownedClass = async (req: Parameters<typeof userOf>[0] & { params: Record<string, unknown> }) => {
    const found = await writableClass(viewerOf(req), idParam(req.params.id))
    if (!found) throw new HttpError(404, 'Class not found')
    return found
  }
  const viewableClass = async (req: Parameters<typeof userOf>[0] & { params: Record<string, unknown> }) => {
    const found = await readableClass(viewerOf(req), idParam(req.params.id))
    if (!found) throw new HttpError(404, 'Class not found')
    return found
  }

  router.get('/classes', classReader, async (req, res) => {
    const scope = z.enum(['own', 'all']).default('own').parse(req.query.scope)
    res.json(await visibleClasses(viewerOf(req), scope))
  })

  // students of the viewer's classes (one class with ?classId=), each with the classes they share
  router.get('/students', classReader, async (req, res) => {
    const classId = z.string().uuid().optional().parse(req.query.classId)
    const scopeParam = z.enum(['own', 'all']).default('own').parse(req.query.scope)
    const viewer = viewerOf(req)
    const scope = classId ? [await readableClass(viewer, classId)].flatMap((c) => (c ? [c] : [])) : await visibleClasses(viewer, scopeParam)
    if (classId && scope.length === 0) throw new HttpError(404, 'Class not found')
    res.json(await classes.listStudents(scope.map((c) => c.id)))
  })

  router.post('/classes', teacherOnly, async (req, res) => {
    const { name } = classInput.parse(req.body)
    res.status(201).json(await classes.createClass(userOf(req), name))
  })

  router.get('/classes/:id', classReader, async (req, res) => {
    const cls = await viewableClass(req)
    const [members, assignments] = await Promise.all([classes.listMembers(cls.id), classes.listAssignments(cls.id)])
    res.json({ ...cls, members, assignments })
  })

  router.patch('/classes/:id', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    const patch = classPatchInput.parse(req.body)
    if (patch.name !== undefined) await classes.renameClass(cls.id, userOf(req), patch.name)
    if (patch.joiningOpen !== undefined) await classes.setJoiningOpen(cls.id, userOf(req), patch.joiningOpen)
    res.json({ ...cls, ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.joiningOpen !== undefined ? { joiningOpen: patch.joiningOpen } : {}) })
  })

  router.delete('/classes/:id', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    await classes.archiveClass(cls.id, userOf(req))
    res.json({ ok: true })
  })

  router.post('/classes/:id/code', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    const code = await classes.regenerateCode(cls.id, userOf(req))
    if (!code) throw new HttpError(503, 'Nie udało się wygenerować kodu, spróbuj ponownie')
    res.json({ joinCode: code })
  })

  // add a student by Auth0 id (the id must belong to a real account)
  router.post('/classes/:id/members', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    const { userId } = addMemberInput.parse(req.body)
    const student = await resolveStudent(userId)
    if (!student) throw new HttpError(404, 'Nie znaleziono użytkownika o takim identyfikatorze Auth0')
    const status = await classes.addMember(cls.id, userId, student)
    res.status(status === 'added' ? 201 : 200).json({ userId, status })
  })

  router.delete('/classes/:id/members/:userId', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    if (!(await classes.removeMember(cls.id, String(req.params.userId)))) throw new HttpError(404, 'Member not found')
    res.json({ ok: true })
  })

  router.post('/classes/:id/assignments', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    const input = assignmentInput.parse(req.body)
    const created = await classes.createAssignment(cls.id, userOf(req), input)
    if (!created) throw new HttpError(404, 'Nie znaleziono wskazanego kursu lub quizu')
    res.status(201).json(created)
  })

  router.patch('/classes/:id/assignments/:assignmentId', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    const { dueAt } = assignmentPatchInput.parse(req.body)
    if (!(await classes.setAssignmentDue(cls.id, idParam(req.params.assignmentId), dueAt))) {
      throw new HttpError(404, 'Assignment not found')
    }
    res.json({ ok: true })
  })

  router.get('/classes/:id/students/:userId', classReader, async (req, res) => {
    const cls = await viewableClass(req)
    const results = await classes.studentResults(cls.id, String(req.params.userId))
    if (!results) throw new HttpError(404, 'Student not found')
    res.json(results)
  })

  router.delete('/classes/:id/assignments/:assignmentId', teacherOnly, async (req, res) => {
    const cls = await ownedClass(req)
    if (!(await classes.deleteAssignment(cls.id, idParam(req.params.assignmentId)))) {
      throw new HttpError(404, 'Assignment not found')
    }
    res.json({ ok: true })
  })

  router.get('/classes/:id/report', classReader, async (req, res) => {
    const cls = await viewableClass(req)
    res.json(await classes.classReport(cls.id))
  })

  router.get('/classes/:id/analysis', classReader, async (req, res) => {
    const cls = await viewableClass(req)
    res.json({ class: { id: cls.id, name: cls.name }, ...analyzeClass(await classes.classReport(cls.id)) })
  })

  router.get('/classes/:id/report.csv', classReader, async (req, res) => {
    const cls = await viewableClass(req)
    const csv = reportToCsv(await classes.classReport(cls.id))
    res
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', 'attachment; filename="raport-klasy.csv"')
      .send(`\ufeff${csv}`) // BOM so Excel reads Polish characters correctly
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

  router.get('/reviews/summary', async (req, res) => {
    res.json(await reviews.getReviewSummary(userOf(req)))
  })

  router.post('/reviews/session', async (req, res) => {
    const { count } = reviewSessionInput.parse(req.body ?? {})
    const ids = await reviews.dueVerbIds(userOf(req), count)
    if (ids.length === 0) throw new HttpError(409, 'Na dziś wszystko powtórzone')
    const [pool, verbs] = await Promise.all([listVerbs(), listVerbs({ ids })])
    const order = new Map(ids.map((id, i) => [id, i]))
    verbs.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    const quiz = buildVerbQuiz(
      verbs,
      pool,
      'mixed',
      'Powtórka dnia',
      `${verbs.length} czasowników do powtórki - dobrane na podstawie Twoich wcześniejszych odpowiedzi.`,
    )
    const id = await repo.createQuiz(quiz, { kind: 'generated', source: 'review', ownerId: userOf(req) })
    res.status(201).json(await repo.getQuiz(id, false))
  })

  router.get('/progress/weak-verbs', async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(30).default(10).parse(req.query.limit ?? 10)
    const stats = await reviews.weakVerbs(userOf(req), limit)
    const verbs = await listVerbs({ ids: stats.map((s) => s.verbId) })
    const byId = new Map(verbs.map((v) => [v.id, v]))
    res.json(
      stats.flatMap((s) => {
        const verb = byId.get(s.verbId)
        return verb
          ? [{ verb, attempts: s.attempts, correct: s.correct, accuracy: s.accuracy, lastWrongAt: s.lastWrongAt }]
          : []
      }),
    )
  })

  router.get('/progress/summary', async (req, res) => {
    const identity = identityOf(req)
    if (identity?.via === 'jwt') await progress.syncIdentity(identity.userId, identity)
    res.json(await progress.getSummary(userOf(req)))
  })

  router.patch('/progress/profile', async (req, res) => {
    await progress.updateProfile(userOf(req), profileInput.parse(req.body))
    res.json(await progress.getSummary(userOf(req)))
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
    res.json({ ok: true })
  })

  router.post('/quizzes/:id/grade', async (req, res) => {
    const id = parseId(req.params.id)
    const { answers: submitted, questionIds } = gradeInput.parse(req.body)
    const userId = currentUserId(req)
    const quiz = await repo.getQuiz(id, true)
    if (!quiz) throw notFound()
    // course exams are personal: only the signed-in user who started the exam can submit it
    if (quiz.courseId && (!userId || userId !== (await repo.getOwnerId(id)))) {
      throw new HttpError(userId ? 403 : 401, 'Egzamin wymaga zalogowania')
    }
    // sampled quizzes are graded on the questions the player was actually shown
    const gradedIds = resolveGradedIds(
      quiz.questions.map((q) => q.id),
      questionIds,
      quiz.sampleSize,
    )
    if (!gradedIds) throw new HttpError(400, 'Niepoprawny zestaw pytań dla tego quizu')
    const graded = new Set(gradedIds)
    const answers = Object.fromEntries(Object.entries(submitted).filter(([questionId]) => graded.has(questionId)))
    const result = gradeQuiz(
      repo.toGradable(quiz).filter((q) => graded.has(q.id)),
      answers,
    )
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
    const verbOfQuestion = await repo.getQuestionVerbs(id)
    await reviews.applyResults(
      userOf(req),
      result.results.flatMap((r) => {
        const verbId = verbOfQuestion.get(r.questionId)
        return verbId === undefined ? [] : [{ verbId, correct: r.correct }]
      }),
    )
    await progress.recordActivity(userOf(req), {
      answered: Object.values(answers).filter((a) => a?.optionIds?.length || a?.text?.trim()).length,
      correct: result.results.filter((r) => r.correct).length,
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
