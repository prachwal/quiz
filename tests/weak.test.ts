import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accuracyOf, isWeak, rankWeak } from '../src/shared/quiz/weak.ts'

const stat = (attempts: number, correct: number, box = 0, lastWrongAt: string | null = null) => ({ attempts, correct, box, lastWrongAt })

test('needs at least 3 attempts to be judged', () => {
  assert.equal(isWeak(stat(2, 0)), false)
  assert.equal(isWeak(stat(3, 0)), true)
})

test('3 wrong out of 4 is weak, 3 right out of 4 is not', () => {
  assert.equal(isWeak(stat(4, 1)), true)
  assert.equal(isWeak(stat(4, 3)), false)
})

test('a verb answered correctly several times in a row (box >= 4) has recovered', () => {
  assert.equal(isWeak(stat(8, 4, 3)), true)
  assert.equal(isWeak(stat(8, 4, 4)), false)
})

test('ranking: lowest accuracy first, then more attempts, then the most recent mistake', () => {
  const items = [
    { id: 'a', ...stat(4, 2, 0, '2026-06-01') }, // 50%
    { id: 'b', ...stat(4, 1, 0, '2026-06-02') }, // 25%
    { id: 'c', ...stat(8, 4, 0, '2026-06-05') }, // 50%, more attempts
    { id: 'd', ...stat(4, 2, 0, '2026-06-09') }, // 50%, same attempts as a, newer mistake
    { id: 'e', ...stat(10, 10) }, // fine
    { id: 'f', ...stat(2, 0) }, // too few attempts
  ]
  assert.deepEqual(rankWeak(items, 10).map((i) => i.id), ['b', 'c', 'd', 'a'])
  assert.deepEqual(rankWeak(items, 2).map((i) => i.id), ['b', 'c'])
})

test('accuracyOf treats no attempts as perfect', () => {
  assert.equal(accuracyOf({ attempts: 0, correct: 0 }), 1)
  assert.equal(accuracyOf({ attempts: 4, correct: 1 }), 0.25)
})
