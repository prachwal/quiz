import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeStudent } from '../src/shared/quiz/studentAnalysis.ts'
import { attemptRows, historyAnalysisInput } from '../src/shared/quiz/userHistory.ts'
import type { AdminStudentAttempt } from '../src/shared/quiz/types.ts'

const attempt = (over: Partial<AdminStudentAttempt> = {}): AdminStudentAttempt => ({
  id: 'att-1',
  title: 'Quiz A',
  quizId: 'quiz-1',
  courseId: null,
  source: 'manual',
  score: 1,
  maxScore: 4,
  percent: 25,
  passed: null,
  createdAt: '2026-10-19T10:00:00.000Z',
  questions: [
    { questionId: 'q1', prompt: 'Pytanie 1', points: 1, correct: false, earned: 0, answer: 'zle', correctAnswers: ['dobrze'] },
    { questionId: 'q2', prompt: null, points: 3, correct: true, earned: 3, answer: 'ok', correctAnswers: ['ok'] },
  ],
  ...over,
})

test('summary rows leave the answers out by default', () => {
  const [row] = attemptRows([attempt()], false, new Map())
  assert.equal(row.questions, undefined)
  assert.deepEqual(Object.keys(row).sort(), ['courseId', 'createdAt', 'id', 'maxScore', 'passed', 'percent', 'quizId', 'quizTitle', 'score', 'source'])
  assert.equal(row.quizTitle, 'Quiz A')
  assert.equal(row.percent, 25)
})

test('includeAnswers adds the per-question detail with the type when the question still exists', () => {
  const [row] = attemptRows([attempt()], true, new Map([['q1', 'text']]))
  assert.deepEqual(row.questions, [
    { questionId: 'q1', prompt: 'Pytanie 1', type: 'text', points: 1, correct: false, earned: 0, answer: 'zle', correctAnswers: ['dobrze'] },
    { questionId: 'q2', prompt: null, type: null, points: 3, correct: true, earned: 3, answer: 'ok', correctAnswers: ['ok'] },
  ])
})

test('the analysis input takes quizzes as assignments and uses the id when a quiz was deleted', () => {
  const input = historyAnalysisInput(
    [attempt(), attempt({ id: 'att-2', quizId: null, courseId: null, title: 'Usunięty', percent: 75 })],
    '2026-10-19',
  )
  assert.equal(input.lastActiveDay, '2026-10-19')
  assert.deepEqual(input.assignments, [])
  assert.deepEqual(input.attempts.map((a) => a.assignmentId), ['quiz-1', 'att-2'])
  assert.equal(input.attempts[0].questions[1].prompt, null)
})

test('course exams are keyed by their course', () => {
  const input = historyAnalysisInput([attempt({ quizId: null, courseId: 'course-9', source: 'course-exam' })], null)
  assert.equal(input.attempts[0].assignmentId, 'course-9')
})

test('analyzeStudent gets the whole history through the mapping', () => {
  const history = [
    attempt({ id: 'a', percent: 20, createdAt: '2026-10-01T10:00:00.000Z' }),
    attempt({ id: 'b', percent: 30, createdAt: '2026-10-02T10:00:00.000Z' }),
    attempt({ id: 'c', percent: 40, createdAt: '2026-10-03T10:00:00.000Z' }),
    attempt({ id: 'd', percent: 90, createdAt: '2026-10-04T10:00:00.000Z' }),
  ]
  const analysis = analyzeStudent(historyAnalysisInput(history, '2026-10-04'), new Date('2026-10-04T12:00:00Z'))
  assert.equal(analysis.attempts.count, 4)
  assert.equal(analysis.attempts.bestPercent, 90)
  assert.equal(analysis.attempts.latestPercent, 90)
  assert.equal(analysis.daysSinceActive, 0)
  assert.deepEqual(analysis.assignments, { total: 0, done: 0, inProgress: 0, todo: 0, overdue: [] })
  assert.equal(analysis.hardestQuestions[0].prompt, 'Pytanie 1')
})
