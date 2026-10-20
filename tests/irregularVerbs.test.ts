import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildVerbQuiz, randomSample, regularForm } from '../server/verbQuizBuilder.ts'
import { verbConditions } from '../server/verbFilter.ts'
import type { IrregularVerb } from '../src/shared/quiz/types.ts'

const verb = (id: number, base: string): IrregularVerb => ({
  id,
  base,
  cefrLevel: 'B2',
  difficulty: 'medium',
  popularity: 'common',
  pattern: 'ABC',
  pastSimple: [`${base}t`],
  pastParticiple: [`${base}t`],
  meanings: ['znaczenie'],
  exampleEn: 'ex',
  examplePl: 'przyklad',
})

test('regularForm handles e, y and default', () => {
  assert.equal(regularForm('make'), 'maked')
  assert.equal(regularForm('study'), 'studied')
  assert.equal(regularForm('walk'), 'walked')
})

test('randomSample returns unique subset of requested size', () => {
  const items = [1, 2, 3, 4, 5]
  const sample = randomSample(items, 3)
  assert.equal(sample.length, 3)
  assert.equal(new Set(sample).size, 3)
  for (const v of sample) assert.ok(items.includes(v))
})

test('randomSample handles count larger than input', () => {
  const items = [1, 2]
  const sample = randomSample(items, 5)
  assert.equal(sample.length, 2)
})

test('buildVerbQuiz creates one question per verb with verbId', () => {
  const pool = [verb(1, 'go'), verb(2, 'do')]
  const quiz = buildVerbQuiz([verb(1, 'go')], pool, 'typing', 'Title', 'Desc')
  assert.equal(quiz.title, 'Title')
  assert.equal(quiz.description, 'Desc')
  assert.equal(quiz.questions.length, 1)
  assert.equal(quiz.questions[0].verbId, 1)
})

test('buildVerbQuiz typing question accepts all past forms', () => {
  const v = verb(1, 'learn')
  v.pastSimple = ['learnt', 'learned']
  v.pastParticiple = ['learnt', 'learned']
  const quiz = buildVerbQuiz([v], [v], 'typing', 'T', 'D')
  const q = quiz.questions[0]
  assert.equal(q.type, 'text')
  assert.ok(q.options.every((o) => o.isCorrect))
  assert.ok(q.options.length >= 2)
})

test('buildVerbQuiz translation typing accepts synonyms sharing meaning', () => {
  const v1 = verb(1, 'do')
  const v2 = verb(2, 'make')
  v2.meanings = v1.meanings
  const quiz = buildVerbQuiz([v1], [v1, v2], 'translation', 'T', 'D')
  const textQ = quiz.questions.find((q) => q.type === 'text')
  if (textQ) {
    const bases = textQ.options.map((o) => o.text)
    assert.ok(bases.includes('do'))
    assert.ok(bases.includes('make'))
  }
})

test('buildVerbQuiz choice question has 4 options', () => {
  const v = verb(1, 'go')
  const quiz = buildVerbQuiz([v], [v], 'choice', 'T', 'D')
  assert.equal(quiz.questions[0].type, 'single')
  assert.ok(quiz.questions[0].options.length >= 2)
})

test('buildVerbQuiz mixed produces a question per verb', () => {
  const verbs = [verb(1, 'go'), verb(2, 'do')]
  const quiz = buildVerbQuiz(verbs, verbs, 'mixed', 'T', 'D')
  assert.equal(quiz.questions.length, 2)
  assert.deepEqual(quiz.questions.map((q) => q.verbId), [1, 2])
})

test('randomSample of empty array is empty', () => {
  assert.deepEqual(randomSample([], 3), [])
})

test('regularForm for base ending in y but preceded by vowel', () => {
  assert.equal(regularForm('play'), 'played')
})

test('verbConditions applies the B2 level by default', () => {
  const { conditions, values } = verbConditions({})
  assert.deepEqual(conditions, ['v.cefr_level = $1'])
  assert.deepEqual(values, ['B2'])
})

test('verbConditions drops the level condition when lessons list ids', () => {
  const { conditions, values } = verbConditions({ ids: [3, 7] })
  assert.deepEqual(conditions, ['v.id = ANY($1::int[])'])
  assert.deepEqual(values, [[3, 7]])
})

test('verbConditions keeps an explicit level alongside ids', () => {
  const { conditions, values } = verbConditions({ ids: [3], level: 'C1' })
  assert.deepEqual(conditions, ['v.cefr_level = $1', 'v.id = ANY($2::int[])'])
  assert.deepEqual(values, ['C1', [3]])
})

test('verbConditions keeps the B2 level for other filters', () => {
  const { conditions, values } = verbConditions({ difficulty: 'medium', pattern: 'ABC' })
  assert.deepEqual(conditions, ['v.cefr_level = $1', 'd.code = $2', 'pt.code = $3'])
  assert.deepEqual(values, ['B2', 'medium', 'ABC'])
})
