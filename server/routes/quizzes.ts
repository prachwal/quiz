import type { Request, Response, Router } from 'express'
import { z } from 'zod'
import { gradedImageIds, gradeQuiz, quizImageIds } from '../../src/shared/quiz/engine'
import { buildQuestionsSnapshot } from '../../src/shared/quiz/questionsSnapshot'
import { resolveGradedIds } from '../../src/shared/quiz/sampling'
import { DIFFICULTIES, generateInput, gradeInput, quizInput, retryWrongInput } from '../../src/shared/quiz/schema'
import { SUBJECTS } from '../../src/shared/quiz/types'
import { WRITE_QUIZZES, currentUserId, hasPermission, requirePermission } from '../auth'
import { gradeRegistry } from '../gradeRegistry'
import { HttpError, notFound, parseId, userOf } from '../http'
import { buildVerbQuiz, generateIrregularVerbsQuiz, listVerbs, randomSample } from '../irregularVerbs'
import * as repo from '../quizRepo'
import { MediaRefError } from '../media/repo'
import { resolveMedia } from '../media/resolve'
import { withMedia } from '../media/mediaMap'
import * as reviews from '../reviewsRepo'
import { reportServerError } from '../sentry'

/** Quizzes (list, editor, generated variants), grading and the caller's attempts. */

/**
 * A failed afterSave hook: the attempt is already saved, so the client still gets its result. Log it
 * like an unexpected error (structured line + Sentry) instead of swallowing it.
 */
const reportHookError = (req: Request, res: Response) => async (error: unknown, hookIndex: number) => {
  const requestId = String(res.locals.requestId ?? '')
  const userId = currentUserId(req)
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'grade.afterSave',
      hook: hookIndex,
      requestId,
      method: req.method,
      path: req.path,
      userId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  )
  await reportServerError(error, { requestId, userId, method: req.method, path: req.path }).catch(() => undefined)
}

/** Images that do not exist or are not uploaded yet are a client error with the list of the bad ids. */
async function withMediaRefs<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof MediaRefError) throw new HttpError(400, error.message)
    throw error
  }
}

const listQuery = z.object({
  difficulty: z.enum(DIFFICULTIES).optional(),
  subject: z.enum([...SUBJECTS, 'none']).optional(),
  sort: z.enum(['recent', 'popular']).optional(),
})

export function registerQuizRoutes(router: Router) {
  router.get('/quizzes', async (req, res) => {
    const { difficulty, subject, sort } = listQuery.parse(req.query)
    res.json(await repo.listQuizzes({ difficulty, subject, sort }, hasPermission(req, WRITE_QUIZZES), userOf(req)))
  })

  router.post('/quizzes', requirePermission(WRITE_QUIZZES), async (req, res) => {
    const input = quizInput.parse(req.body)
    const userId = userOf(req)
    const id = await withMediaRefs(() => repo.createQuiz(input, { kind: 'manual', difficulty: input.difficulty, ownerId: userId }))
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
    // the view carries only what it shows: explanations (and their images) are in the editor view only
    res.json(withMedia(quiz, await resolveMedia(quizImageIds(quiz))))
  })

  router.put('/quizzes/:id', requirePermission(WRITE_QUIZZES), async (req, res) => {
    const id = parseId(req.params.id)
    const input = quizInput.parse(req.body)
    if (!(await withMediaRefs(() => repo.replaceQuiz(id, input)))) throw notFound()
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
    const gradedQuestions = quiz.questions.filter((q) => graded.has(q.id))
    const result = gradeQuiz(repo.toGradable(quiz).filter((q) => graded.has(q.id)), answers)
    const questionsSnapshot = buildQuestionsSnapshot(gradedQuestions)
    const { attemptId, response } = await gradeRegistry.run(
      { quiz, quizId: id, userId, user: userOf(req), answers, result },
      (outcome) =>
        repo.saveAttempt({
          quizId: id,
          quizTitle: quiz.title,
          userId,
          courseId: outcome.courseId,
          passed: outcome.passed,
          answers,
          result,
          questionsSnapshot,
        }),
      reportHookError(req, res),
    )
    const media = await resolveMedia(gradedImageIds(gradedQuestions, answers))
    res.json(withMedia({ ...result, attemptId, ...response }, media))
  })
}
