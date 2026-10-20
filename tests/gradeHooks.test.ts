import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGradeRegistry } from '../server/gradeHooks.ts'
import type { GradeContext, SavedAttempt } from '../server/gradeHooks.ts'

// the registry never looks inside the quiz or the result, so placeholders are enough
const ctx = {
  quiz: { id: 'quiz-1' },
  quizId: 'quiz-1',
  userId: 'user-1',
  user: 'user-1',
  answers: {},
  result: { score: 1, maxScore: 2, percent: 50, results: [] },
} as unknown as GradeContext

const noErrors = () => assert.fail('no hook error expected')

test('without handlers the attempt is saved with no course and the response is empty', async () => {
  const registry = createGradeRegistry()
  const saved: SavedAttempt[] = []
  const out = await registry.run(
    ctx,
    async (outcome) => {
      saved.push(outcome)
      return 'attempt-1'
    },
    noErrors,
  )
  assert.deepEqual(saved, [{ courseId: null, passed: null }])
  assert.deepEqual(out, { attemptId: 'attempt-1', response: {} })
})

test('a beforeSave outcome reaches save and the response', async () => {
  const registry = createGradeRegistry()
  registry.onBeforeSave(async () => ({ courseId: 'course-1', passed: true, response: { course: { id: 'course-1' } } }))
  const saved: SavedAttempt[] = []
  const out = await registry.run(
    ctx,
    async (outcome) => {
      saved.push(outcome)
      return 'attempt-2'
    },
    noErrors,
  )
  assert.deepEqual(saved, [{ courseId: 'course-1', passed: true }])
  assert.deepEqual(out.response, { course: { id: 'course-1' } })
})

test('beforeSave handlers merge in registration order, later values win, responses are shallow-merged', async () => {
  const registry = createGradeRegistry()
  registry.onBeforeSave(async () => ({ courseId: 'first', passed: false, response: { a: 1, shared: 'first' } }))
  registry.onBeforeSave(async () => undefined)
  registry.onBeforeSave(async () => ({ passed: true, response: { b: 2, shared: 'second' } }))
  const saved: SavedAttempt[] = []
  const out = await registry.run(
    ctx,
    async (outcome) => {
      saved.push(outcome)
      return 'attempt-3'
    },
    noErrors,
  )
  assert.deepEqual(saved, [{ courseId: 'first', passed: true }])
  assert.deepEqual(out.response, { a: 1, b: 2, shared: 'second' })
})

test('an error in beforeSave propagates and nothing is saved', async () => {
  const registry = createGradeRegistry()
  registry.onBeforeSave(async () => {
    throw new Error('course lookup failed')
  })
  let saves = 0
  let afterRan = false
  registry.onAfterSave(async () => {
    afterRan = true
  })
  await assert.rejects(
    registry.run(
      ctx,
      async () => {
        saves += 1
        return 'never'
      },
      noErrors,
    ),
    /course lookup failed/,
  )
  assert.equal(saves, 0)
  assert.equal(afterRan, false)
})

test('afterSave handlers run after save, in order, and receive the attemptId', async () => {
  const registry = createGradeRegistry()
  const calls: string[] = []
  registry.onAfterSave(async (c) => {
    calls.push(`first:${c.attemptId}`)
  })
  registry.onAfterSave(async (c) => {
    calls.push(`second:${c.attemptId}`)
  })
  await registry.run(
    ctx,
    async () => {
      calls.push('save')
      return 'attempt-4'
    },
    noErrors,
  )
  assert.deepEqual(calls, ['save', 'first:attempt-4', 'second:attempt-4'])
})

test('an afterSave error is reported, later handlers still run and the attempt is returned', async () => {
  const registry = createGradeRegistry()
  const reported: number[] = []
  let laterRan = false
  registry.onAfterSave(async () => {
    throw new Error('reviews down')
  })
  registry.onAfterSave(async () => {
    laterRan = true
  })
  const out = await registry.run(
    ctx,
    async () => 'attempt-5',
    (_error, index) => {
      reported.push(index)
    },
  )
  assert.deepEqual(reported, [0])
  assert.equal(laterRan, true)
  assert.deepEqual(out, { attemptId: 'attempt-5', response: {} })
})

test('registering the same hook twice does not run it twice', async () => {
  const registry = createGradeRegistry()
  let runs = 0
  const hook = async () => {
    runs += 1
  }
  registry.onAfterSave(hook)
  registry.onAfterSave(hook)
  await registry.run(ctx, async () => 'attempt-6', noErrors)
  assert.equal(runs, 1)
})
