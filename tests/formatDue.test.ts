import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDue } from '../src/features/classes/formatDue.ts'

test('formatDue returns bez terminu for null', () => {
  assert.equal(formatDue(null), 'bez terminu')
})

test('formatDue formats iso date', () => {
  const out = formatDue('2026-06-10T10:00:00Z')
  assert.ok(out.length > 0)
  assert.notEqual(out, 'bez terminu')
})
