import type { Router } from 'express'
import { z } from 'zod'
import { profileInput, reviewSessionInput } from '../../src/shared/quiz/schema'
import { identityOf } from '../auth'
import { HttpError, userOf } from '../http'
import { buildVerbQuiz, listVerbs } from '../irregularVerbs'
import { resolveMedia } from '../media/resolve'
import * as progress from '../progressRepo'
import * as repo from '../quizRepo'
import * as reviews from '../reviewsRepo'
import { weakVerbBody, weakVerbImageIds } from '../verbMedia'

/** Spaced repetition (Leitner reviews), the streak/daily goal and the weak-verb ranking. */

export function registerProgressRoutes(router: Router) {
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
    const items = stats.flatMap((s) => {
      const verb = byId.get(s.verbId)
      return verb
        ? [{ verb, attempts: s.attempts, correct: s.correct, accuracy: s.accuracy, lastWrongAt: s.lastWrongAt }]
        : []
    })
    // illustrations: the `media` map only when a verb has one (weakVerbBody keeps the plain array otherwise)
    res.json(weakVerbBody(items, await resolveMedia(weakVerbImageIds(items))))
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
}
