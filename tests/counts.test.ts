import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EXAM_COUNT, GENERATE_COUNT, REVIEW_COUNT, clampCount } from '../src/features/quizzes/counts.ts'

test('a short finished quiz (3 questions) still asks the generator for a valid count', () => {
  assert.equal(clampCount(3, GENERATE_COUNT), 5)
  assert.equal(clampCount(3, EXAM_COUNT), 5)
})

test('counts are capped at the server limits', () => {
  assert.equal(clampCount(80, GENERATE_COUNT), 50)
  assert.equal(clampCount(80, EXAM_COUNT), 40)
  assert.equal(clampCount(80, REVIEW_COUNT), 30)
})

test('valid counts pass through', () => {
  assert.equal(clampCount(10, GENERATE_COUNT), 10)
  assert.equal(clampCount(1, REVIEW_COUNT), 1)
})
