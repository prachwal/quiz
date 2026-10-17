import assert from 'node:assert/strict'
import { test } from 'node:test'
import { csvCell, reportToCsv } from '../src/shared/quiz/csv.ts'

test('csvCell quotes and escapes double quotes', () => {
  assert.equal(csvCell('a "b"'), '"a ""b"""')
  assert.equal(csvCell(null), '""')
  assert.equal(csvCell(7), '"7"')
})

test('csvCell neutralises spreadsheet formulas', () => {
  for (const evil of ['=HYPERLINK("http://x")', '+1+1', '-2', '@SUM(A1)']) {
    assert.ok(csvCell(evil).startsWith(`"'`), evil)
  }
  assert.equal(csvCell('Anna'), '"Anna"')
})

test('reportToCsv has a header, a row per student and status labels with best percent', () => {
  const csv = reportToCsv({
    assignments: [{ id: 'a1', classId: 'c', kind: 'course', courseId: 'x', quizId: null, title: 'Kurs, łatwy', dueAt: null, createdAt: '' }],
    rows: [
      { userId: 'u1', name: '=cmd', email: 'a@b.pl', lessonsCompleted: 3, lastActiveDay: '2026-06-10', weakVerbs: 2, statuses: { a1: 'done' }, bestPercent: { a1: 90 } },
      { userId: 'u2', name: null, email: null, lessonsCompleted: 0, lastActiveDay: null, weakVerbs: 0, statuses: { a1: 'todo' }, bestPercent: { a1: null } },
    ],
  })
  const lines = csv.split('\r\n')
  assert.equal(lines.length, 3)
  assert.ok(lines[0].includes('"Kurs, łatwy"'))
  assert.ok(lines[1].startsWith(`"'=cmd"`))
  assert.ok(lines[1].endsWith('"zrobione (90%)"'))
  assert.ok(lines[2].startsWith('"u2"'))
  assert.ok(lines[2].endsWith('"do zrobienia"'))
})
