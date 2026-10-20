import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildQuestionsSnapshot, parseQuestionsSnapshot } from '../src/shared/quiz/questionsSnapshot.ts'

const question = {
  id: 'q1',
  type: 'single',
  prompt: 'Stolica Polski?',
  points: 2,
  explanation: 'Warszawa',
  options: [{ id: 'o1', text: 'Warszawa', isCorrect: true }],
  config: { answer: 3 },
}

test('copies only id, type, prompt and points', () => {
  const [snap] = buildQuestionsSnapshot([question])
  assert.deepEqual(snap, { id: 'q1', type: 'single', prompt: 'Stolica Polski?', points: 2 })
})

test('preserves the order of the graded questions', () => {
  const snap = buildQuestionsSnapshot([
    { id: 'b', type: 'text', prompt: 'B', points: 1 },
    { id: 'a', type: 'numeric', prompt: 'A', points: 3 },
  ])
  assert.deepEqual(snap.map((q) => q.id), ['b', 'a'])
})

test('empty input gives an empty snapshot', () => {
  assert.deepEqual(buildQuestionsSnapshot([]), [])
})

test('parse drops malformed items and keeps valid ones', () => {
  const parsed = parseQuestionsSnapshot([
    { id: 'q1', type: 'single', prompt: 'P', points: 1, extra: 'ignored' },
    null,
    'text',
    [1, 2],
    { id: 2, type: 'single', prompt: 'P', points: 1 },
    { id: 'q2', type: 'single', prompt: 'P', points: '1' },
    { id: 'q3', type: 'single', prompt: 'P', points: Number.NaN },
    { id: 'q4', type: 'single', prompt: null, points: 1 },
    { id: 'q5', type: 'multiple', prompt: 'Q', points: 0.5 },
  ])
  assert.deepEqual(parsed, [
    { id: 'q1', type: 'single', prompt: 'P', points: 1 },
    { id: 'q5', type: 'multiple', prompt: 'Q', points: 0.5 },
  ])
})

test('parse returns null for non-arrays', () => {
  assert.equal(parseQuestionsSnapshot(null), null)
  assert.equal(parseQuestionsSnapshot(undefined), null)
  assert.equal(parseQuestionsSnapshot({ id: 'q1' }), null)
  assert.equal(parseQuestionsSnapshot('[]'), null)
  assert.equal(parseQuestionsSnapshot(42), null)
})

test('parse of an empty array is an empty array, not null', () => {
  assert.deepEqual(parseQuestionsSnapshot([]), [])
})
