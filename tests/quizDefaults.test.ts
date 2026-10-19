import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyQuestion, emptyQuiz } from '../src/features/quizzes/quizDefaults.ts'

test('emptyQuestion defaults to single', () => {
  assert.equal(emptyQuestion().type, 'single')
  assert.ok((emptyQuestion().options?.length ?? 0) >= 2)
})

test('emptyQuiz has one question', () => {
  const q = emptyQuiz()
  assert.equal(q.questions.length, 1)
  assert.equal(q.title, '')
})
