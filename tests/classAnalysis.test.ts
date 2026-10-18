import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeClass } from '../src/shared/quiz/classAnalysis.ts'
import type { AnalysisReport } from '../src/shared/quiz/classAnalysis.ts'

const now = new Date('2026-10-18T12:00:00Z')
const report: AnalysisReport = {
  assignments: [
    { id: 'a1', title: 'Quiz 1', dueAt: '2026-10-10T00:00:00Z' },
    { id: 'a2', title: 'Kurs', dueAt: null },
  ],
  rows: [
    { userId: 'u1', name: 'Ala', email: null, lastActiveDay: '2026-10-17', statuses: { a1: 'done', a2: 'in_progress' }, bestPercent: { a1: 90, a2: null } },
    { userId: 'u2', name: 'Bob', email: 'b@x.pl', lastActiveDay: '2026-10-01', statuses: { a1: 'todo', a2: 'todo' }, bestPercent: { a1: null, a2: null } },
    { userId: 'u3', name: null, email: null, lastActiveDay: null, statuses: { a1: 'done', a2: 'todo' }, bestPercent: { a1: 30, a2: null } },
  ],
}

test('counts statuses and averages per assignment', () => {
  const a = analyzeClass(report, now)
  assert.equal(a.students, 3)
  assert.deepEqual(a.assignments[0], { title: 'Quiz 1', dueAt: '2026-10-10T00:00:00Z', overdue: true, done: 2, inProgress: 0, todo: 1, averageBestPercent: 60 })
  assert.deepEqual(a.assignments[1], { title: 'Kurs', dueAt: null, overdue: false, done: 0, inProgress: 1, todo: 2, averageBestPercent: null })
})

test('lists students that need attention with reasons', () => {
  const a = analyzeClass(report, now)
  assert.deepEqual(a.needsAttention.map((s) => s.userId), ['u2', 'u3'])
  const bob = a.needsAttention[0].reasons.join(' | ')
  assert.match(bob, /17 dni/)
  assert.match(bob, /po terminie: Quiz 1/)
  const third = a.needsAttention[1].reasons.join(' | ')
  assert.match(third, /brak jakiejkolwiek aktywności/)
  assert.match(third, /niska średnia/)
  assert.deepEqual(a.summary, { averageBestPercent: 60, inactive7Days: 2, withOverdueWork: 1 })
})

test('an empty class does not crash', () => {
  const a = analyzeClass({ assignments: [], rows: [] }, now)
  assert.equal(a.students, 0)
  assert.equal(a.summary.averageBestPercent, null)
})
