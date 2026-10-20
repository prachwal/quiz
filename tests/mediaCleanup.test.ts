import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CLEANUP_BATCH_SIZE,
  CLEANUP_TIME_BUDGET_MS,
  orderOldestFirst,
  pendingCutoff,
  takeBatch,
  unreferencedCutoff,
  withinBudget,
} from '../server/media/cleanupPolicy.ts'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const now = new Date('2026-10-20T12:00:00.000Z')

test('pending rows are stale after one hour, unreferenced ready rows after one day', () => {
  assert.equal(pendingCutoff(now).toISOString(), '2026-10-20T11:00:00.000Z')
  assert.equal(unreferencedCutoff(now).toISOString(), '2026-10-19T12:00:00.000Z')
  assert.equal(now.getTime() - pendingCutoff(now).getTime(), HOUR)
  assert.equal(now.getTime() - unreferencedCutoff(now).getTime(), DAY)
})

test('ordering is oldest first and deterministic for equal timestamps', () => {
  const rows = [
    { id: 'c', createdAt: '2026-10-19T10:00:00.000Z' },
    { id: 'b', createdAt: '2026-10-18T10:00:00.000Z' },
    { id: 'a', createdAt: '2026-10-18T10:00:00.000Z' },
  ]
  assert.deepEqual(
    orderOldestFirst(rows).map((row) => row.id),
    ['a', 'b', 'c'],
  )
  // the input is not reordered in place
  assert.deepEqual(rows.map((row) => row.id), ['c', 'b', 'a'])
})

test('a batch keeps the oldest rows and never more than the limit', () => {
  const rows = Array.from({ length: 450 }, (_, i) => ({
    id: String(i).padStart(3, '0'),
    createdAt: new Date(Date.UTC(2026, 0, 1) + (449 - i) * HOUR).toISOString(),
  }))
  const batch = takeBatch(rows)
  assert.equal(batch.length, CLEANUP_BATCH_SIZE)
  assert.equal(batch[0].id, '449', 'the oldest row is the one with the largest index here')
  assert.ok(batch.every((row, index) => index === 0 || Date.parse(batch[index - 1].createdAt) <= Date.parse(row.createdAt)))
  assert.deepEqual(takeBatch(rows, 0), [])
  assert.equal(takeBatch(rows.slice(0, 3), 10).length, 3)
})

test('the time budget stops new work after 20 seconds', () => {
  assert.equal(CLEANUP_TIME_BUDGET_MS, 20_000)
  assert.equal(withinBudget(1_000, 1_000), true)
  assert.equal(withinBudget(1_000, 20_999), true)
  assert.equal(withinBudget(1_000, 21_000), false)
})
