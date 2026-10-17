import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formsText, PATTERN_HINTS } from '../src/features/learn/format.ts'

test('formsText joins forms with slash', () => {
  assert.equal(formsText(['a', 'b']), 'a / b')
  assert.equal(formsText([]), '')
})

test('PATTERN_HINTS has all four patterns', () => {
  for (const p of ['AAA', 'ABA', 'ABB', 'ABC'] as const) {
    assert.ok(PATTERN_HINTS[p].length > 0)
  }
})

test('PATTERN_HINTS values are non-empty strings', () => {
  for (const key of Object.keys(PATTERN_HINTS)) {
    assert.equal(typeof PATTERN_HINTS[key as keyof typeof PATTERN_HINTS], 'string')
  }
})
