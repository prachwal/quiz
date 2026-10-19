import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { z } from 'zod'
import { quizInput } from '../src/shared/quiz/schema.ts'

const read = (file: string) => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'))
const schema = read('quiz.schema.json')
const validate = new (Ajv2020 as unknown as typeof Ajv2020.default)({ strict: false }).compile(schema)

const option = (text: string, isCorrect: boolean) => ({ text, isCorrect })
const quiz = (question: object) => ({ title: 'T', questions: [{ prompt: 'P', ...question }] })

test('the shipped quiz files satisfy the schema and the server validation', () => {
  for (const file of ['quiz-lista-choice.json', 'quiz-pierwiastki.json']) {
    const data = read(file)
    assert.equal(validate(data), true, JSON.stringify(validate.errors))
    const { $schema: _ref, ...body } = data
    assert.equal(quizInput.safeParse(body).success, true)
  }
})

test('schema limits match the zod input schema', () => {
  const generated = z.toJSONSchema(quizInput, { io: 'input' }) as any
  const props = generated.properties
  const question = props.questions.items.properties
  const mine = schema.properties
  const myQuestion = schema.$defs.question.properties

  assert.deepEqual(Object.keys(props).sort(), Object.keys(mine).filter((k) => k !== '$schema').sort())
  assert.deepEqual(Object.keys(question).sort(), Object.keys(myQuestion).sort())
  for (const key of ['minLength', 'maxLength'] as const) {
    assert.equal(mine.title[key], props.title[key])
    assert.equal(mine.description[key], props.description[key])
    assert.equal(myQuestion.prompt[key], question.prompt[key])
    assert.equal(myQuestion.explanation[key], question.explanation[key])
  }
  assert.equal(schema.properties.questions.minItems, props.questions.minItems)
  assert.equal(schema.properties.questions.maxItems, props.questions.maxItems)
  assert.equal(myQuestion.points.minimum, question.points.minimum)
  assert.equal(myQuestion.points.maximum, question.points.maximum)
  assert.equal(myQuestion.options.maxItems, question.options.maxItems)
  assert.equal(schema.$defs.option.properties.text.maxLength, question.options.items.properties.text.maxLength)
  assert.deepEqual([...generated.required].sort(), [...schema.required].sort())
})

// the same documents must be accepted / rejected by the JSON schema and by the server validation
const cases: [string, object, boolean][] = [
  ['single ok', quiz({ type: 'single', options: [option('a', true), option('b', false)] }), true],
  ['single without correct', quiz({ type: 'single', options: [option('a', false), option('b', false)] }), false],
  ['single with two correct', quiz({ type: 'single', options: [option('a', true), option('b', true)] }), false],
  ['single with one option', quiz({ type: 'single', options: [option('a', true)] }), false],
  ['multiple ok', quiz({ type: 'multiple', options: [option('a', true), option('b', true), option('c', false)] }), true],
  ['multiple without correct', quiz({ type: 'multiple', options: [option('a', false), option('b', false)] }), false],
  ['truefalse ok', quiz({ type: 'truefalse', options: [option('Prawda', true), option('Fałsz', false)] }), true],
  ['truefalse with three options', quiz({ type: 'truefalse', options: [option('a', true), option('b', false), option('c', false)] }), false],
  ['text ok', quiz({ type: 'text', options: [option('went', true), option('went.', true)] }), true],
  ['text without options', quiz({ type: 'text', options: [] }), false],
  ['text with a wrong option', quiz({ type: 'text', options: [option('went', true), option('go', false)] }), false],
  ['numeric ok', quiz({ type: 'numeric', options: [], config: { answer: 42 } }), true],
  ['numeric with tolerance', quiz({ type: 'numeric', options: [], config: { answer: 4.5, tolerance: { kind: 'relative', value: 0.01 } } }), true],
  ['numeric without config', quiz({ type: 'numeric', options: [] }), false],
  ['numeric without answer', quiz({ type: 'numeric', options: [], config: {} }), false],
  ['numeric with options', quiz({ type: 'numeric', options: [option('x', true)], config: { answer: 1 } }), false],
  ['numeric with a negative tolerance', quiz({ type: 'numeric', options: [], config: { answer: 1, tolerance: { kind: 'absolute', value: -1 } } }), false],
  ['numeric relative tolerance for zero', quiz({ type: 'numeric', options: [], config: { answer: 0, tolerance: { kind: 'relative', value: 0.1 } } }), false],
  ['single without options', quiz({ type: 'single', options: undefined }), false],
  ['ordering ok', quiz({ type: 'ordering', options: [], config: { items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] } }), true],
  ['ordering without config', quiz({ type: 'ordering', options: [] }), false],
  ['ordering with one item', quiz({ type: 'ordering', options: [], config: { items: [{ id: 'a', text: 'A' }] } }), false],
  ['ordering with empty text', quiz({ type: 'ordering', options: [], config: { items: [{ id: 'a', text: 'A' }, { id: 'b', text: '' }] } }), false],
  // duplicate item ids are rejected by the engine, not by JSON Schema (it cannot express unique keys of array items)
  ['ordering with options', quiz({ type: 'ordering', options: [option('x', true)], config: { items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] } }), false],
  ['matching ok', quiz({ type: 'matching', options: [], config: { pairs: [{ id: '1', rightId: 'r1', left: 'kot', right: 'cat' }, { id: '2', rightId: 'r2', left: 'pies', right: 'dog' }] } }), true],
  ['matching without config', quiz({ type: 'matching', options: [] }), false],
  ['matching with one pair', quiz({ type: 'matching', options: [], config: { pairs: [{ id: '1', rightId: 'r1', left: 'kot', right: 'cat' }] } }), false],
  ['matching with an empty side', quiz({ type: 'matching', options: [], config: { pairs: [{ id: '1', rightId: 'r1', left: 'kot', right: '' }, { id: '2', rightId: 'r2', left: 'pies', right: 'dog' }] } }), false],
  ['matching without rightId', quiz({ type: 'matching', options: [], config: { pairs: [{ id: '1', left: 'kot', right: 'cat' }, { id: '2', rightId: 'r2', left: 'pies', right: 'dog' }] } }), false],
  ['empty prompt', { title: 'T', questions: [{ type: 'text', prompt: '', options: [option('a', true)] }] }, false],
  ['no questions', { title: 'T', questions: [] }, false],
  ['bad sample size', { ...quiz({ type: 'text', options: [option('a', true)] }), sampleSize: 15 }, false],
  ['sample size 20', { ...quiz({ type: 'text', options: [option('a', true)] }), sampleSize: 20, shuffleQuestions: null }, true],
  ['bad difficulty', { ...quiz({ type: 'text', options: [option('a', true)] }), difficulty: 'impossible' }, false],
  ['zero points', quiz({ type: 'text', points: 0, options: [option('a', true)] }), false],
]

for (const [name, doc, expected] of cases) {
  test(`schema and validation agree: ${name}`, () => {
    assert.equal(validate(doc), expected, JSON.stringify(validate.errors))
    assert.equal(quizInput.safeParse(doc).success, expected)
  })
}
