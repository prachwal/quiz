import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  quizInput,
  questionInput,
  generateInput,
  joinInput,
  classInput,
  profileInput,
  reviewSessionInput,
  optionInput,
  answerInput,
  gradeInput,
  retryWrongInput,
  assignmentInput,
  feedbackStatusInput,
  rolesInput,
  blockedInput,
  DIFFICULTIES,
  POPULARITIES,
  QUIZ_VARIANTS,
} from '../src/shared/quiz/schema.ts'
import { feedbackInput, tokenInput } from '../src/shared/platform/schema.ts'

test('quizInput accepts a minimal valid quiz', () => {
  const parsed = quizInput.parse({
    title: 'T',
    questions: [{ type: 'single', prompt: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] }],
  })
  assert.equal(parsed.title, 'T')
  assert.equal(parsed.questions.length, 1)
})

test('quizInput rejects empty questions', () => {
  assert.throws(() => quizInput.parse({ title: 'T', questions: [] }))
})

test('questionInput rejects single with two correct', () => {
  assert.throws(() =>
    questionInput.parse({ type: 'single', prompt: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }] }),
  )
})

test('generateInput defaults count to 10 and variant to mixed', () => {
  const parsed = generateInput.parse({})
  assert.equal(parsed.count, 10)
  assert.equal(parsed.variant, 'mixed')
  assert.equal(parsed.onlyWeak, false)
})

test('generateInput enforces count range', () => {
  assert.throws(() => generateInput.parse({ count: 4 }))
  assert.throws(() => generateInput.parse({ count: 51 }))
})

test('joinInput uppercases and validates 6 alphanumerics', () => {
  assert.equal(joinInput.parse({ code: 'ab12cd' }).code, 'AB12CD')
  assert.throws(() => joinInput.parse({ code: 'abc' }))
})

test('classInput requires at least 2 chars', () => {
  assert.throws(() => classInput.parse({ name: 'a' }))
  assert.equal(classInput.parse({ name: 'AB' }).name, 'AB')
})

test('profileInput requires at least one field', () => {
  assert.throws(() => profileInput.parse({}))
  assert.equal(profileInput.parse({ dailyGoal: 5 }).dailyGoal, 5)
})

test('reviewSessionInput defaults count to 10', () => {
  assert.equal(reviewSessionInput.parse({}).count, 10)
  assert.throws(() => reviewSessionInput.parse({ count: 0 }))
})

test('feedbackInput requires message of at least 3 chars', () => {
  assert.throws(() => feedbackInput.parse({ kind: 'bug', message: 'ab' }))
  assert.equal(feedbackInput.parse({ kind: 'idea', message: 'abc' }).kind, 'idea')
})

test('tokenInput defaults expiresInDays to 90 and write to false', () => {
  const parsed = tokenInput.parse({ name: 'tok' })
  assert.equal(parsed.expiresInDays, 90)
  assert.equal(parsed.write, false)
})

test('optionInput requires non-empty text', () => {
  assert.throws(() => optionInput.parse({ text: '', isCorrect: true }))
  assert.equal(optionInput.parse({ text: 'ok', isCorrect: false }).isCorrect, false)
})

test('answerInput allows optional fields', () => {
  assert.deepEqual(answerInput.parse({}), {})
  assert.equal(answerInput.parse({ text: 'x' }).text, 'x')
})

test('gradeInput requires answers record', () => {
  assert.throws(() => gradeInput.parse({}))
  assert.ok(gradeInput.parse({ answers: {} }))
})

test('retryWrongInput requires at least one uuid', () => {
  assert.throws(() => retryWrongInput.parse({ questionIds: [] }))
})

test('assignmentInput course requires courseId', () => {
  assert.throws(() => assignmentInput.parse({ kind: 'course' }))
  assert.ok(assignmentInput.parse({ kind: 'quiz', quizId: '550e8400-e29b-41d4-a716-446655440000' }))
})

test('feedbackStatusInput validates status', () => {
  assert.equal(feedbackStatusInput.parse({ status: 'done' }).status, 'done')
  assert.throws(() => feedbackStatusInput.parse({ status: 'x' }))
})

test('rolesInput validates roles array', () => {
  assert.deepEqual(rolesInput.parse({ roles: ['admin', 'student'] }).roles, ['admin', 'student'])
  assert.throws(() => rolesInput.parse({ roles: ['nope'] }))
})

test('blockedInput requires boolean', () => {
  assert.equal(blockedInput.parse({ blocked: true }).blocked, true)
  assert.throws(() => blockedInput.parse({ blocked: 'yes' }))
})

test('schema constants are non-empty', () => {
  assert.ok(DIFFICULTIES.length > 0)
  assert.ok(POPULARITIES.length > 0)
  assert.ok(QUIZ_VARIANTS.length > 0)
})
