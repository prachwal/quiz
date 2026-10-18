import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectiveShuffle, resolveGradedIds, sampleFromPool, shuffle } from '../src/shared/quiz/sampling.ts'

const pool = Array.from({ length: 50 }, (_, i) => `q${i}`)

test('sampleFromPool draws the requested number of distinct questions', () => {
  for (const size of [10, 20, 30]) {
    const drawn = sampleFromPool(pool, size)
    assert.equal(drawn.length, size)
    assert.equal(new Set(drawn).size, size)
    assert.ok(drawn.every((q) => pool.includes(q)))
  }
})

test('sampleFromPool returns the whole pool for null or an oversized sample', () => {
  assert.deepEqual(sampleFromPool(pool, null), pool)
  assert.deepEqual(sampleFromPool(pool.slice(0, 8), 10), pool.slice(0, 8))
})

test('shuffle keeps all items and does not mutate the input', () => {
  const input = [1, 2, 3, 4, 5]
  const out = shuffle(input, () => 0)
  assert.deepEqual([...out].sort(), input)
  assert.deepEqual(input, [1, 2, 3, 4, 5])
})

test('a quiz setting overrides the player setting, null follows it', () => {
  assert.equal(effectiveShuffle(null, true), true)
  assert.equal(effectiveShuffle(undefined, false), false)
  assert.equal(effectiveShuffle(false, true), false)
  assert.equal(effectiveShuffle(true, false), true)
})

test('resolveGradedIds grades the whole pool when no sample is configured', () => {
  assert.deepEqual(resolveGradedIds(pool, undefined, null), pool)
  assert.deepEqual(resolveGradedIds(pool, ['q1'], null), pool)
})

test('resolveGradedIds accepts exactly sampleSize distinct known questions', () => {
  const ids = pool.slice(5, 15)
  assert.deepEqual(resolveGradedIds(pool, ids, 10), ids)
})

test('resolveGradedIds rejects wrong size, duplicates and foreign ids', () => {
  assert.equal(resolveGradedIds(pool, pool.slice(0, 9), 10), null)
  assert.equal(resolveGradedIds(pool, [...pool.slice(0, 9), 'q0'], 10), null)
  assert.equal(resolveGradedIds(pool, [...pool.slice(0, 9), 'nope'], 10), null)
})

test('resolveGradedIds falls back to the whole pool for old clients', () => {
  assert.deepEqual(resolveGradedIds(pool, undefined, 10), pool)
})
