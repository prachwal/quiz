import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gradeQuiz, questionTypes, QUESTION_TYPES } from '../src/shared/quiz/engine.ts'

test('QUESTION_TYPES lists all four supported types', () => {
  assert.deepEqual([...QUESTION_TYPES], ['single', 'multiple', 'truefalse', 'text'])
})

test('single validates exactly one correct option', () => {
  const t = questionTypes.single
  assert.equal(t.validate({ type: 'single', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] }), null)
  assert.ok(t.validate({ type: 'single', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }] }))
  assert.ok(t.validate({ type: 'single', options: [{ text: 'a', isCorrect: false }] }))
})

test('multiple requires at least one correct option', () => {
  const t = questionTypes.multiple
  assert.equal(t.validate({ type: 'multiple', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] }), null)
  assert.ok(t.validate({ type: 'multiple', options: [{ text: 'a', isCorrect: false }, { text: 'b', isCorrect: false }] }))
})

test('truefalse requires exactly two options and one correct', () => {
  const t = questionTypes.truefalse
  assert.equal(t.validate({ type: 'truefalse', options: [{ text: 'Prawda', isCorrect: true }, { text: 'Fałsz', isCorrect: false }] }), null)
  assert.ok(t.validate({ type: 'truefalse', options: [{ text: 'Prawda', isCorrect: true }] }))
})

test('text requires at least one accepted answer', () => {
  const t = questionTypes.text
  assert.equal(t.validate({ type: 'text', options: [{ text: 'go', isCorrect: true }] }), null)
  assert.ok(t.validate({ type: 'text', options: [{ text: 'go', isCorrect: false }] }))
})

test('gradeQuiz single choice exact match', () => {
  const q = [{ id: 'q1', type: 'single' as const, points: 2, explanation: '', options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false }] }]
  const r = gradeQuiz(q, { q1: { optionIds: ['a'] } })
  assert.equal(r.score, 2)
  assert.equal(r.maxScore, 2)
  assert.equal(r.percent, 100)
  assert.equal(r.results[0].correct, true)
})

test('gradeQuiz single choice wrong answer scores 0', () => {
  const q = [{ id: 'q1', type: 'single' as const, points: 2, explanation: '', options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false }] }]
  const r = gradeQuiz(q, { q1: { optionIds: ['b'] } })
  assert.equal(r.score, 0)
  assert.equal(r.percent, 0)
  assert.equal(r.results[0].correct, false)
})

test('gradeQuiz multiple requires exact set', () => {
  const q = [{ id: 'q1', type: 'multiple' as const, points: 1, explanation: '', options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: true }, { id: 'c', text: 'C', isCorrect: false }] }]
  const full = gradeQuiz(q, { q1: { optionIds: ['a', 'b'] } })
  const partial = gradeQuiz(q, { q1: { optionIds: ['a'] } })
  const extra = gradeQuiz(q, { q1: { optionIds: ['a', 'b', 'c'] } })
  assert.equal(full.percent, 100)
  assert.equal(partial.percent, 0)
  assert.equal(extra.percent, 0)
})

test('gradeQuiz text is case and whitespace insensitive', () => {
  const q = [{ id: 'q1', type: 'text' as const, points: 1, explanation: '', options: [{ id: 'a', text: 'Go', isCorrect: true }] }]
  const r = gradeQuiz(q, { q1: { text: '  go ' } })
  assert.equal(r.percent, 100)
})

test('gradeQuiz missing answer scores 0 and maxScore sums points', () => {
  const q = [
    { id: 'q1', type: 'single' as const, points: 1, explanation: '', options: [{ id: 'a', text: 'A', isCorrect: true }] },
    { id: 'q2', type: 'text' as const, points: 3, explanation: '', options: [{ id: 'b', text: 'x', isCorrect: true }] },
  ]
  const r = gradeQuiz(q, {})
  assert.equal(r.score, 0)
  assert.equal(r.maxScore, 4)
  assert.equal(r.percent, 0)
  assert.equal(r.results.length, 2)
})

test('gradeQuiz percent is 0 when maxScore is 0', () => {
  const r = gradeQuiz([], {})
  assert.equal(r.percent, 0)
  assert.equal(r.score, 0)
  assert.equal(r.maxScore, 0)
})

test('questionTypes defaultOptions produce at least one option', () => {
  for (const type of QUESTION_TYPES) {
    assert.ok(questionTypes[type].defaultOptions().length >= 1)
  }
})

test('gradeQuiz text empty answer scores 0', () => {
  const q = [{ id: 'q1', type: 'text' as const, points: 1, explanation: 'exp', options: [{ id: 'a', text: 'Go', isCorrect: true }] }]
  const r = gradeQuiz(q, { q1: { text: '   ' } })
  assert.equal(r.percent, 0)
  assert.equal(r.results[0].correct, false)
  assert.deepEqual(r.results[0].correctAnswers, ['Go'])
  assert.equal(r.results[0].explanation, 'exp')
})

test('gradeQuiz result includes correctOptionIds and points', () => {
  const q = [{ id: 'q1', type: 'single' as const, points: 3, explanation: '', options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false }] }]
  const r = gradeQuiz(q, { q1: { optionIds: ['a'] } })
  assert.deepEqual(r.results[0].correctOptionIds, ['a'])
  assert.equal(r.results[0].points, 3)
  assert.equal(r.results[0].earned, 3)
})

test('multiple validate requires at least 2 options', () => {
  const t = questionTypes.multiple
  assert.ok(t.validate({ type: 'multiple', options: [{ text: 'a', isCorrect: true }] }))
})
