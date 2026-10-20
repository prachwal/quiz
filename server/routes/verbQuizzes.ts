import type { Router } from 'express'
import { generateInput, retryWrongInput } from '../../src/shared/quiz/schema'
import { currentUserId } from '../auth'
import { HttpError, parseId, userOf } from '../http'
import { buildVerbQuiz, generateIrregularVerbsQuiz, listVerbs, randomSample } from '../irregularVerbs'
import * as repo from '../quizRepo'
import * as reviews from '../reviewsRepo'

/**
 * Quizzes built from the verb catalog: a random mixed quiz, the error training ("onlyWeak") and "retry the
 * mistakes". The weak-verb ranking belongs to the progress module, so these routes are progress's too.
 */

export function registerVerbQuizRoutes(router: Router) {
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
}
