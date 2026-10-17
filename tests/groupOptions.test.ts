import assert from 'node:assert/strict'
import { test } from 'node:test'
import { difficultyOptions, popularityOptions } from '../src/components/groupOptions.ts'

test('difficultyOptions matches difficulty count', () => {
  assert.ok(difficultyOptions.length >= 3)
  assert.ok(difficultyOptions.every((o) => typeof o.value === 'string' && typeof o.label === 'string'))
})

test('popularityOptions matches popularity count', () => {
  assert.ok(popularityOptions.length >= 3)
  assert.ok(popularityOptions.every((o) => typeof o.value === 'string' && typeof o.label === 'string'))
})

test('difficultyOptions has expected labels', () => {
  assert.ok(difficultyOptions.some((o) => o.value === 'easy'))
})

test('popularityOptions has expected labels', () => {
  assert.ok(popularityOptions.some((o) => o.value === 'core'))
})
