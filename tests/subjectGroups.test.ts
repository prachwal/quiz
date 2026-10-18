import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupBySubject } from '../src/shared/quiz/subjectGroups.ts'
import { SUBJECTS } from '../src/shared/quiz/types.ts'
import type { SubjectCode } from '../src/shared/quiz/types.ts'

const q = (id: string, subject: SubjectCode | null) => ({ id, subject })

test('groups follow the subject order, keep item order and put unassigned quizzes last', () => {
  const groups = groupBySubject([q('a', null), q('b', 'chemistry'), q('c', 'math'), q('d', 'chemistry')])
  assert.deepEqual(
    groups.map((g) => [g.key, g.items.map((i) => i.id)]),
    [
      ['math', ['c']],
      ['chemistry', ['b', 'd']],
      ['none', ['a']],
    ],
  )
  assert.equal(groups[0].title, 'Matematyka')
  assert.equal(groups[2].title, 'Bez przedmiotu')
})

test('empty groups are dropped and nothing is lost', () => {
  assert.deepEqual(groupBySubject([]), [])
  const all = SUBJECTS.map((s, i) => q(String(i), s))
  assert.equal(groupBySubject(all).flatMap((g) => g.items).length, SUBJECTS.length)
})
