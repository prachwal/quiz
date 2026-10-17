import assert from 'node:assert/strict'
import { test } from 'node:test'
import { swipeDirection, startsAtEdge, SWIPE } from '../src/features/learn/swipe.ts'

test('swipeDirection horizontal swipe left', () => {
  assert.equal(swipeDirection(-100, 10, 200), 'left')
})

test('swipeDirection horizontal swipe right', () => {
  assert.equal(swipeDirection(100, 10, 200), 'right')
})

test('swipeDirection too slow', () => {
  assert.equal(swipeDirection(100, 10, 1000), null)
})

test('swipeDirection too short', () => {
  assert.equal(swipeDirection(10, 0, 100), null)
})

test('swipeDirection vertical dominance', () => {
  assert.equal(swipeDirection(60, 100, 100), null)
})

test('startsAtEdge near left or right edges', () => {
  assert.equal(startsAtEdge(10, 390), true)
  assert.equal(startsAtEdge(380, 390), true)
  assert.equal(startsAtEdge(100, 390), false)
})

test('SWIPE constants are positive', () => {
  assert.ok(SWIPE.minDistance > 0)
  assert.ok(SWIPE.dominance > 1)
})
