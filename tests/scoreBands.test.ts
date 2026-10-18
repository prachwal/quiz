import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_SCORE_THRESHOLDS, normalizeThresholds, scoreBand } from '../src/shared/quiz/scoreBands.ts'
import { appSettingsInput } from '../src/shared/quiz/schema.ts'

test('bands: below low red, below high orange, from high green', () => {
  assert.equal(scoreBand(0), 'low')
  assert.equal(scoreBand(49), 'low')
  assert.equal(scoreBand(50), 'mid')
  assert.equal(scoreBand(79), 'mid')
  assert.equal(scoreBand(80), 'high')
  assert.equal(scoreBand(100), 'high')
  assert.equal(scoreBand(65, { low: 60, high: 70 }), 'mid')
  assert.equal(scoreBand(70, { low: 60, high: 70 }), 'high')
})

test('invalid stored thresholds fall back to the defaults', () => {
  assert.deepEqual(normalizeThresholds(null), DEFAULT_SCORE_THRESHOLDS)
  assert.deepEqual(normalizeThresholds({ low: 80, high: 50 }), DEFAULT_SCORE_THRESHOLDS)
  assert.deepEqual(normalizeThresholds({ low: 0, high: 50 }), DEFAULT_SCORE_THRESHOLDS)
  assert.deepEqual(normalizeThresholds({ low: 40.5, high: 70 }), DEFAULT_SCORE_THRESHOLDS)
  assert.deepEqual(normalizeThresholds({ low: 40, high: 70 }), { low: 40, high: 70 })
})

test('the admin input requires 1 <= low < high <= 100', () => {
  assert.equal(appSettingsInput.safeParse({ scoreThresholds: { low: 40, high: 70 } }).success, true)
  assert.equal(appSettingsInput.safeParse({ scoreThresholds: { low: 70, high: 70 } }).success, false)
  assert.equal(appSettingsInput.safeParse({ scoreThresholds: { low: 0, high: 70 } }).success, false)
  assert.equal(appSettingsInput.safeParse({ scoreThresholds: { low: 40, high: 101 } }).success, false)
})
