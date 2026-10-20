import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MIN_ANSWERS } from '../src/shared/quiz/itemStats.ts'
import { quizStats } from '../src/shared/quiz/quizStats.ts'
import type { StatsAttempt, StatsQuiz } from '../src/shared/quiz/quizStats.ts'

const q = (id: string, points = 1, type = 'single', prompt = `P-${id}`) => ({ id, type, prompt, points })

const quiz = (questions: ReturnType<typeof q>[], extra: Partial<StatsQuiz> = {}): StatsQuiz => ({
  title: 'Quiz',
  sampleSize: null,
  questions,
  ...extra,
})

const result = (questionId: string, correct: boolean, points = 1, answerText?: string) => ({
  questionId,
  correct,
  earned: correct ? points : 0,
  points,
  ...(answerText === undefined ? {} : { answerText }),
})

const attempt = (results: ReturnType<typeof result>[], questionsSnapshot: ReturnType<typeof q>[] | null, percent = 50): StatsAttempt => ({
  percent,
  results,
  questionsSnapshot,
})

test('snapshot identity is used when present, even after the quiz changed', () => {
  // the attempt was graded on question "old" which the quiz no longer has
  const report = quizStats({
    quiz: quiz([q('new')]),
    attempts: [attempt([result('old', true, 2, 'A')], [q('old', 2, 'text', 'Stare pytanie')], 100)],
    limit: 50,
  })
  assert.equal(report.unattributedAttempts, 0)
  assert.equal(report.questions.length, 1)
  const row = report.questions[0]
  assert.equal(row.questionId, 'old')
  assert.equal(row.prompt, 'Stare pytanie')
  assert.equal(row.type, 'text')
  assert.equal(row.points, 2)
  assert.equal(row.inCurrentQuiz, false)
})

test('a snapshot wins over the current question with the same id', () => {
  const report = quizStats({
    quiz: quiz([q('x', 1, 'single', 'Nowa treść')]),
    attempts: [attempt([result('x', true)], [q('x', 3, 'multiple', 'Treść z chwili podejścia')])],
    limit: 50,
  })
  assert.equal(report.questions[0].prompt, 'Treść z chwili podejścia')
  assert.equal(report.questions[0].type, 'multiple')
  assert.equal(report.questions[0].points, 3)
  assert.equal(report.questions[0].inCurrentQuiz, true)
})

test('attempts without a snapshot fall back to the current questions', () => {
  const report = quizStats({
    quiz: quiz([q('a', 1, 'text', 'Aktualne A'), q('b', 2, 'numeric', 'Aktualne B')]),
    attempts: [
      attempt([result('a', true, 1, 'x'), result('b', false, 2, 'y')], null, 33),
      attempt([result('a', false, 1, 'z'), result('b', true, 2, 'y')], null, 67),
    ],
    limit: 50,
  })
  assert.equal(report.unattributedAttempts, 0)
  assert.equal(report.attempts, 2)
  const [a, b] = report.questions
  assert.equal(a.prompt, 'Aktualne A')
  assert.equal(a.type, 'text')
  assert.equal(a.attempts, 2)
  assert.equal(a.correct, 1)
  assert.equal(b.prompt, 'Aktualne B')
  assert.equal(b.points, 2)
  assert.equal(b.attempts, 2)
  assert.equal(b.accuracy, 0.5)
})

test('results whose question is unknown are counted as unattributed, known ones still count', () => {
  const report = quizStats({
    quiz: quiz([q('a')]),
    attempts: [
      // old attempt, one question edited away: its "a" still counts
      attempt([result('a', true), result('gone', false)], null),
      // snapshot attempt that includes the removed question
      attempt([result('gone', false), result('a', false)], [q('gone'), q('a')]),
      // fully known
      attempt([result('a', true)], null),
    ],
    limit: 50,
  })
  assert.equal(report.unattributedAttempts, 1)
  assert.equal(report.attempts, 3)
  const a = report.questions.find((r) => r.questionId === 'a')!
  assert.equal(a.attempts, 3)
  assert.equal(a.correct, 2)
  const gone = report.questions.find((r) => r.questionId === 'gone')
  assert.equal(gone?.attempts, 1)
  assert.equal(gone?.inCurrentQuiz, false)
})

test('orphaned ids of old attempts without a snapshot are not attributed at all (no row)', () => {
  const report = quizStats({
    quiz: quiz([q('now')]),
    attempts: [attempt([result('edited-away', false)], null)],
    limit: 50,
  })
  assert.equal(report.unattributedAttempts, 1)
  assert.equal(report.attempts, 1)
  assert.equal(report.total, 0)
  assert.deepEqual(report.questions, [])
})

test('ordering: current quiz order first, then older ids by attempts', () => {
  const attempts = [
    attempt([result('old-rare', true), result('old-common', true), result('cur-2', true), result('cur-1', true)], [
      q('old-rare'),
      q('old-common'),
      q('cur-2'),
      q('cur-1'),
    ]),
    attempt([result('old-common', true)], [q('old-common')]),
  ]
  const report = quizStats({ quiz: quiz([q('cur-1'), q('cur-2')]), attempts, limit: 50 })
  assert.deepEqual(
    report.questions.map((r) => r.questionId),
    ['cur-1', 'cur-2', 'old-common', 'old-rare'],
  )
})

test('limit is applied after ordering and reports total and hasMore', () => {
  const ids = ['c', 'a', 'b']
  const attempts = [attempt(ids.map((id) => result(id, true)), null)]
  const page = quizStats({ quiz: quiz(ids.map((id) => q(id))), attempts, limit: 2 })
  assert.deepEqual(page.questions.map((r) => r.questionId), ['c', 'a'])
  assert.equal(page.total, 3)
  assert.equal(page.hasMore, true)

  const all = quizStats({ quiz: quiz(ids.map((id) => q(id))), attempts, limit: 3 })
  assert.equal(all.hasMore, false)
  assert.equal(all.questions.length, 3)
})

test('quiz level numbers are rounded and sampleSize is passed through', () => {
  const report = quizStats({
    quiz: quiz([q('a')], { sampleSize: 10 }),
    attempts: [attempt([result('a', true)], null, 33), attempt([result('a', true)], null, 50), attempt([result('a', true)], null, 70)],
    limit: 50,
  })
  assert.equal(report.quiz.sampleSize, 10)
  assert.equal(report.quiz.title, 'Quiz')
  assert.equal(report.avgPercent, 51)
  assert.equal(report.minPercent, 33)
  assert.equal(report.maxPercent, 70)
})

test('a deleted quiz keeps its statistics from the snapshots', () => {
  const report = quizStats({
    quiz: { title: null, sampleSize: null, questions: [] },
    attempts: [attempt([result('a', true)], [q('a', 1, 'text', 'Z migawki')], 100)],
    limit: 50,
  })
  assert.equal(report.quiz.title, null)
  assert.equal(report.unattributedAttempts, 0)
  assert.equal(report.questions[0].prompt, 'Z migawki')
  assert.equal(report.questions[0].inCurrentQuiz, false)
})

test('empty quiz has no averages (null, not 0) and an empty list', () => {
  const report = quizStats({ quiz: quiz([q('a'), q('b')]), attempts: [], limit: 50 })
  assert.deepEqual(
    { attempts: report.attempts, avg: report.avgPercent, min: report.minPercent, max: report.maxPercent, total: report.total, hasMore: report.hasMore },
    { attempts: 0, avg: null, min: null, max: null, total: 0, hasMore: false },
  )
  assert.deepEqual(report.questions, [])
  assert.equal(report.unattributedAttempts, 0)
})

test('per-question verdicts come from the item analysis and need enough answers', () => {
  const attempts = Array.from({ length: MIN_ANSWERS }, (_, i) => attempt([result('a', i < 2, 2, i < 2 ? 'ok' : 'nie')], null))
  const report = quizStats({ quiz: quiz([q('a', 2)]), attempts, limit: 50 })
  const row = report.questions[0]
  assert.equal(row.attempts, MIN_ANSWERS)
  assert.equal(row.correct, 2)
  assert.equal(row.earnedPercent, Math.round((2 * 2 * 100) / (MIN_ANSWERS * 2)))
  assert.equal(row.flag, 'too-hard')
  assert.equal(row.topAnswers[0].text, 'nie')

  const few = quizStats({ quiz: quiz([q('a')]), attempts: attempts.slice(0, 3), limit: 50 })
  assert.equal(few.questions[0].flag, 'insufficient-data')
})

test('attempts without answer text give no top answers but still count', () => {
  const report = quizStats({ quiz: quiz([q('a', 1, 'text')]), attempts: [attempt([result('a', false)], null)], limit: 50 })
  assert.deepEqual(report.questions[0].topAnswers, [])
  assert.equal(report.questions[0].attempts, 1)
  assert.equal(report.questions[0].accuracy, 0)
})

test('prompts in the statistics are text: an image becomes its description, never its address', () => {
  const media = '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b'
  const prompt = `Co to jest? ![kot](media:${media})`
  const report = quizStats({
    quiz: quiz([q('a', 1, 'single', prompt)]),
    attempts: [attempt([result('a', true)], null)],
    limit: 10,
  })
  assert.equal(report.questions[0].prompt, 'Co to jest? [obraz: kot]')
  assert.ok(!report.questions[0].prompt.includes('media:'))
})
