import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLessonRegistry } from '../server/lessonHooks.ts'
import type { LessonCompletedContext } from '../server/lessonHooks.ts'

const ctx = {
  user: 'user-1',
  userId: 'user-1',
  courseId: 'course-1',
  lessonId: 'lesson-1',
} as LessonCompletedContext

test('an empty registry is a no-op', async () => {
  const registry = createLessonRegistry()
  await registry.runCompleted(ctx)
})

test('hooks run sequentially in registration order with the same context', async () => {
  const registry = createLessonRegistry()
  const seen: string[] = []
  registry.onCompleted(async (c) => {
    seen.push(`first:${c.user}:${c.courseId}:${c.lessonId}`)
  })
  registry.onCompleted(async () => {
    seen.push('second')
  })
  await registry.runCompleted(ctx)
  assert.deepEqual(seen, ['first:user-1:course-1:lesson-1', 'second'])
})

test('the first error propagates unchanged and the later hooks do not run', async () => {
  const registry = createLessonRegistry()
  const boom = new Error('boom')
  const seen: string[] = []
  registry.onCompleted(async () => {
    seen.push('first')
    throw boom
  })
  registry.onCompleted(async () => {
    seen.push('second')
  })
  await assert.rejects(registry.runCompleted(ctx), (error) => error === boom)
  assert.deepEqual(seen, ['first'])
})

test('registering the same hook twice runs it once', async () => {
  const registry = createLessonRegistry()
  let calls = 0
  const hook = async () => {
    calls += 1
  }
  registry.onCompleted(hook)
  registry.onCompleted(hook)
  await registry.runCompleted(ctx)
  assert.equal(calls, 1)
})

test('two registries do not share hooks', async () => {
  const a = createLessonRegistry()
  const b = createLessonRegistry()
  let calls = 0
  a.onCompleted(async () => {
    calls += 1
  })
  await b.runCompleted(ctx)
  assert.equal(calls, 0)
})
