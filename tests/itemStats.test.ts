import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeItem, MIN_ANSWERS } from '../src/shared/quiz/itemStats.ts'
import type { Observation } from '../src/shared/quiz/itemStats.ts'

const right = (answer = 'A', points = 1): Observation => ({ correct: true, earned: points, points, answer })
const wrong = (answer = 'B', points = 1): Observation => ({ correct: false, earned: 0, points, answer })
const many = (n: number, make: () => Observation) => Array.from({ length: n }, () => make())

test('fewer than 10 answers never get a verdict', () => {
  const stats = analyzeItem('single', [...many(2, right), ...many(MIN_ANSWERS - 3, wrong)])
  assert.equal(stats.attempts, MIN_ANSWERS - 1)
  assert.equal(stats.flag, 'insufficient-data')
})

test('3 of 10 correct is too-hard, 9 of 10 is easy, 6 of 10 is ok', () => {
  assert.equal(analyzeItem('numeric', [...many(3, right), ...many(7, wrong)]).flag, 'too-hard')
  assert.equal(analyzeItem('numeric', [...many(9, right), ...many(1, wrong)]).flag, 'easy')
  assert.equal(analyzeItem('numeric', [...many(7, right), ...many(1, () => wrong('x')), ...many(1, () => wrong('y')), ...many(1, () => wrong('z'))]).flag, 'ok')
})

test('one distractor taking half of the mistakes marks an option question ambiguous', () => {
  const observations = [...many(5, right), ...many(4, () => wrong('C')), ...many(1, () => wrong('D'))]
  assert.equal(analyzeItem('single', observations).flag, 'ambiguous')
  assert.equal(analyzeItem('truefalse', observations).flag, 'ambiguous')
})

test('ambiguous is never given to types without options, nor when mistakes are spread out', () => {
  const observations = [...many(5, right), ...many(5, () => wrong('C'))]
  assert.equal(analyzeItem('numeric', observations).flag, 'ok')
  assert.equal(analyzeItem('cloze', observations).flag, 'ok')
  const spread = [...many(6, right), wrong('B'), wrong('C'), wrong('D'), wrong('E')]
  assert.equal(analyzeItem('single', spread).flag, 'ok')
})

test('accuracy counts earned points, not correct answers', () => {
  const partial: Observation = { correct: false, earned: 1, points: 2, answer: 'half' }
  const stats = analyzeItem('matching', [partial, right('x', 2)])
  assert.equal(stats.correct, 1)
  assert.equal(stats.accuracy, 3 / 4)
})

test('top answers are counted, trimmed and capped; blank answers are skipped', () => {
  const stats = analyzeItem('text', [right('go'), right(' go '), wrong('goed'), wrong(''), wrong('  ')])
  assert.deepEqual(stats.topAnswers, [
    { text: 'go', count: 2 },
    { text: 'goed', count: 1 },
  ])
})

test('no observations: no exception, no accuracy', () => {
  const stats = analyzeItem('single', [])
  assert.equal(stats.attempts, 0)
  assert.equal(stats.accuracy, null)
  assert.equal(stats.flag, 'insufficient-data')
})
