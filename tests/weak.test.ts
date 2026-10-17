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

import { MIN_ATTEMPTS, WEAK_ACCURACY, RECOVERED_BOX } from '../src/shared/quiz/weak.ts'

test('constants have expected values', () => {
  assert.equal(MIN_ATTEMPTS, 3)
  assert.equal(WEAK_ACCURACY, 0.75)
  assert.equal(RECOVERED_BOX, 4)
})

test('isWeak false when not enough attempts', () => {
  assert.equal(isWeak({ attempts: 2, correct: 0, box: 0, lastWrongAt: null }), false)
})

test('isWeak false when accuracy is high', () => {
  assert.equal(isWeak({ attempts: 4, correct: 4, box: 0, lastWrongAt: null }), false)
})

test('isWeak false when recovered (box >= 4)', () => {
  assert.equal(isWeak({ attempts: 4, correct: 1, box: 4, lastWrongAt: null }), false)
})

test('rankWeak respects limit 0', () => {
  const items = [{ id: 'a', attempts: 4, correct: 1, box: 0, lastWrongAt: '2026-06-01' }]
  assert.deepEqual(rankWeak(items, 0), [])
})

test('rankWeak sorts by most recent mistake when accuracy and attempts tie', () => {
  const items = [
    { id: 'a', attempts: 4, correct: 2, box: 0, lastWrongAt: '2026-06-01' },
    { id: 'b', attempts: 4, correct: 2, box: 0, lastWrongAt: '2026-06-09' },
  ]
  assert.deepEqual(rankWeak(items, 10).map((i) => i.id), ['b', 'a'])
})
