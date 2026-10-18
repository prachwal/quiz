import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeStudent, trendOf } from '../src/shared/quiz/studentAnalysis.ts'
import type { AnalysisAttempt } from '../src/shared/quiz/studentAnalysis.ts'

const now = new Date('2026-10-18T12:00:00Z')
const q = (id: string, correct: boolean) => ({ questionId: id, prompt: `Pytanie ${id}`, correct, correctAnswers: [`odp ${id}`] })
const attempt = (day: number, percent: number, questions = [q('a', true)]): AnalysisAttempt => ({
  assignmentId: 'as1',
  title: 'Quiz 1',
  percent,
  createdAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`,
  questions,
})

test('trend needs four attempts and a 5 point change', () => {
  assert.equal(trendOf([50, 60, 70]), 'insufficient_data')
  assert.equal(trendOf([40, 50, 70, 80, 90]), 'improving')
  assert.equal(trendOf([90, 80, 60, 50, 40]), 'declining')
  assert.equal(trendOf([70, 72, 70, 71]), 'stable')
})

test('summarises attempts regardless of input order', () => {
  const a = analyzeStudent(
    { lastActiveDay: '2026-10-17', assignments: [], attempts: [attempt(15, 80), attempt(10, 40), attempt(12, 60)] },
    now,
  )
  assert.equal(a.attempts.count, 3)
  assert.equal(a.attempts.averagePercent, 60)
  assert.equal(a.attempts.bestPercent, 80)
  assert.equal(a.attempts.latestPercent, 80)
  assert.equal(a.daysSinceActive, 1)
  assert.deepEqual(a.perAssignment, [{ title: 'Quiz 1', attempts: 3, bestPercent: 80, latestPercent: 80 }])
})

test('finds the questions missed most often', () => {
  const a = analyzeStudent(
    {
      lastActiveDay: '2026-10-18',
      assignments: [],
      attempts: [
        attempt(10, 50, [q('a', false), q('b', true)]),
        attempt(11, 50, [q('a', false), q('b', false)]),
        attempt(12, 100, [q('a', true), q('b', true)]),
      ],
    },
    now,
  )
  assert.deepEqual(
    a.hardestQuestions.map((x) => [x.prompt, x.missed, x.seen]),
    [
      ['Pytanie a', 2, 3],
      ['Pytanie b', 1, 3],
    ],
  )
})

test('flags overdue work, inactivity, decline and low averages', () => {
  const a = analyzeStudent(
    {
      lastActiveDay: '2026-10-01',
      assignments: [
        { assignmentId: '1', title: 'Kurs A', dueAt: '2026-10-10T00:00:00Z', status: 'in_progress' },
        { assignmentId: '2', title: 'Quiz B', dueAt: '2026-10-10T00:00:00Z', status: 'done' },
        { assignmentId: '3', title: 'Quiz C', dueAt: '2027-01-01T00:00:00Z', status: 'todo' },
      ],
      attempts: [attempt(1, 90), attempt(2, 80), attempt(3, 30), attempt(4, 20), attempt(5, 10)],
    },
    now,
  )
  assert.deepEqual(a.assignments, { total: 3, done: 1, inProgress: 1, todo: 1, overdue: ['Kurs A'] })
  assert.equal(a.attempts.trend, 'declining')
  assert.equal(a.daysSinceActive, 17)
  assert.ok(a.flags.some((f) => f.includes('po terminie') && f.includes('Kurs A')))
  assert.ok(a.flags.some((f) => f.includes('17 dni')))
  assert.ok(a.flags.some((f) => f.includes('spadają')))
  assert.ok(a.flags.some((f) => f.includes('Niska średnia')))
})

test('a student with no activity is reported, not crashed on', () => {
  const a = analyzeStudent(
    { lastActiveDay: null, assignments: [{ assignmentId: '1', title: 'Quiz', dueAt: null, status: 'todo' }], attempts: [] },
    now,
  )
  assert.equal(a.attempts.averagePercent, null)
  assert.equal(a.daysSinceActive, null)
  assert.ok(a.flags.some((f) => f.includes('żadnej aktywności')))
  assert.ok(a.flags.some((f) => f.includes('Żadne zadanie')))
})

test('falls back to the latest attempt when no daily activity was recorded', () => {
  const a = analyzeStudent({ lastActiveDay: null, assignments: [], attempts: [attempt(10, 50)] }, now)
  assert.equal(a.daysSinceActive, 8)
  assert.ok(!a.flags.some((f) => f.includes('żadnej aktywności')))
})
