import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BOX_INTERVAL_DAYS, MAX_BOX, accuracy, newReviewState, nextReview } from '../src/shared/quiz/spaced.ts'

const now = new Date('2026-06-10T10:00:00Z')
const days = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 86_400_000

test('a correct answer on a fresh verb moves to box 1 and is due in a day', () => {
  const next = nextReview(newReviewState(), true, now)
  assert.equal(next.box, 1)
  assert.equal(days(now, next.dueAt), BOX_INTERVAL_DAYS[1])
  assert.deepEqual([next.repetitions, next.attempts, next.correct, next.lapses], [1, 1, 1, 0])
})

test('intervals grow with consecutive correct answers', () => {
  let state = newReviewState()
  const seen: number[] = []
  for (let i = 0; i < 6; i++) {
    const next = nextReview(state, true, now)
    seen.push(days(now, next.dueAt))
    state = next
  }
  assert.deepEqual(seen, [1, 2, 4, 8, 16, 32])
})

test('the box is capped at the last one', () => {
  const next = nextReview({ box: MAX_BOX, repetitions: 9, lapses: 0, attempts: 9, correct: 9 }, true, now)
  assert.equal(next.box, MAX_BOX)
  assert.equal(days(now, next.dueAt), BOX_INTERVAL_DAYS[MAX_BOX])
})

test('a wrong answer resets to box 0, is due immediately and counts a lapse', () => {
  const next = nextReview({ box: 4, repetitions: 4, lapses: 1, attempts: 6, correct: 5 }, false, now)
  assert.equal(next.box, 0)
  assert.equal(next.repetitions, 0)
  assert.equal(next.lapses, 2)
  assert.equal(next.attempts, 7)
  assert.equal(next.correct, 5)
  assert.equal(next.dueAt.getTime(), now.getTime())
})

test('accuracy is null without attempts', () => {
  assert.equal(accuracy({ attempts: 0, correct: 0 }), null)
  assert.equal(accuracy({ attempts: 4, correct: 3 }), 0.75)
})

test('newReviewState starts at box 0 with zeros', () => {
  assert.deepEqual(newReviewState(), { box: 0, repetitions: 0, lapses: 0, attempts: 0, correct: 0 })
})

test('accuracy returns null with no attempts', () => {
  assert.equal(accuracy({ attempts: 0, correct: 0 }), null)
})

test('accuracy returns ratio', () => {
  assert.equal(accuracy({ attempts: 4, correct: 2 }), 0.5)
})

test('BOX_INTERVAL_DAYS has 7 entries and MAX_BOX is 6', () => {
  assert.equal(BOX_INTERVAL_DAYS.length, 7)
  assert.equal(MAX_BOX, 6)
})

test('correct answer increments box but caps at MAX_BOX', () => {
  const next = nextReview({ box: MAX_BOX, repetitions: 1, lapses: 0, attempts: 1, correct: 1 }, true, new Date('2026-06-10T10:00:00Z'))
  assert.equal(next.box, MAX_BOX)
})
