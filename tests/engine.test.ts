import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  gradeQuiz,
  isAnswered,
  orderingItems,
  parseNumeric,
  promptText,
  questionTypes,
  typeDef,
  QUESTION_TYPES,
} from '../src/shared/quiz/engine.ts'

test('QUESTION_TYPES lists every supported type', () => {
  assert.deepEqual([...QUESTION_TYPES], ['single', 'multiple', 'truefalse', 'text', 'numeric', 'ordering'])
})

test('every type defines playerView and describe', () => {
  for (const type of QUESTION_TYPES) {
    const def = typeDef(type)
    assert.equal(typeof def.playerView, 'function', type)
    assert.equal(typeof def.describe, 'function', type)
  }
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

test('option-based types produce default options, config types produce config', () => {
  for (const type of QUESTION_TYPES) {
    const def = typeDef(type)
    if (def.usesOptions) assert.ok(def.defaultOptions().length >= 1, type)
    else assert.equal(def.defaultOptions().length, 0, type)
    if (!def.usesOptions) assert.ok(def.defaultConfig?.() !== undefined, type)
  }
})

// ---- numeric -----------------------------------------------------------------------------

const numericQuestion = (answer: number, tolerance?: { kind: 'absolute' | 'relative'; value: number }) => [
  {
    id: 'n1',
    type: 'numeric' as const,
    points: 1,
    explanation: '',
    options: [],
    config: tolerance ? { answer, tolerance } : { answer },
  },
]

test('numeric parses decimal comma, dot, fractions, exponent and Unicode minus', () => {
  assert.equal(parseNumeric('110.0'), 110)
  assert.equal(parseNumeric('110'), 110)
  assert.equal(parseNumeric('0,5'), 0.5)
  assert.equal(parseNumeric('1/2'), 0.5)
  assert.equal(parseNumeric('1e3'), 1000)
  assert.equal(parseNumeric('\u22123'), -3)
  assert.equal(parseNumeric('1 000'), 1000)
  assert.equal(parseNumeric('1,000'), 1)
})

test('numeric rejects units, percentages and broken fractions', () => {
  for (const raw of ['5 m/s', '50%', '1/0', '', '   ', 'abc', 'NaN', 'Infinity']) {
    assert.equal(parseNumeric(raw), null, raw)
  }
})

test('numeric grades exact answers and applies both tolerance kinds', () => {
  assert.equal(gradeQuiz(numericQuestion(110), { n1: { text: '110,0' } }).results[0].correct, true)
  assert.equal(gradeQuiz(numericQuestion(110), { n1: { text: '111' } }).results[0].correct, false)
  const relative = numericQuestion(100, { kind: 'relative', value: 0.01 })
  assert.equal(gradeQuiz(relative, { n1: { text: '99' } }).results[0].correct, true)
  assert.equal(gradeQuiz(relative, { n1: { text: '101' } }).results[0].correct, true)
  assert.equal(gradeQuiz(relative, { n1: { text: '98' } }).results[0].correct, false)
  const absolute = numericQuestion(10, { kind: 'absolute', value: 0.5 })
  assert.equal(gradeQuiz(absolute, { n1: { text: '10,4' } }).results[0].correct, true)
  assert.equal(gradeQuiz(absolute, { n1: { text: '10,6' } }).results[0].correct, false)
})

test('numeric validates config and relative tolerance for zero', () => {
  const def = typeDef('numeric')
  assert.equal(def.validate({ type: 'numeric', options: [], config: { answer: 1 } }), null)
  assert.ok(def.validate({ type: 'numeric', options: [], config: {} }))
  assert.ok(def.validate({ type: 'numeric', options: [], config: { answer: 1, tolerance: { kind: 'absolute', value: -1 } } }))
  assert.ok(def.validate({ type: 'numeric', options: [], config: { answer: 0, tolerance: { kind: 'relative', value: 0.1 } } }))
})

test('numeric playerView hides the answer and the tolerance', () => {
  const view = typeDef('numeric').playerView(
    { type: 'numeric', options: [], config: { answer: 42, tolerance: { kind: 'absolute', value: 1 } } },
    Math.random,
    false,
  )
  assert.equal(view.config, undefined)
  assert.deepEqual(view.options, [])
})

test('numeric describe gives the typed answer and the expected value', () => {
  const described = typeDef('numeric').describe(
    { type: 'numeric', options: [], config: { answer: 42 } },
    { text: ' 42,0 ' },
  )
  assert.equal(described.answerText, '42,0')
  assert.deepEqual(described.correctAnswers, ['42'])
})

test('isAnswered understands every answer shape', () => {
  assert.equal(isAnswered(undefined), false)
  assert.equal(isAnswered({ text: '   ' }), false)
  assert.equal(isAnswered({ order: [] }), false)
  assert.equal(isAnswered({ gaps: { 1: ' ' } }), false)
  assert.equal(isAnswered({ text: '1' }), true)
  assert.equal(isAnswered({ order: ['a'] }), true)
  assert.equal(isAnswered({ pairs: { a: 'b' } }), true)
  assert.equal(isAnswered({ gaps: { 1: 'went' } }), true)
})

test('promptText replaces cloze markers in text-only views', () => {
  assert.equal(promptText('He {{1}} to school and {{2}} it.'), 'He ___ to school and ___ it.')
  assert.equal(promptText('Bez luk'), 'Bez luk')
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

// ---- ordering ----------------------------------------------------------------------------

const items = [
  { id: 'a', text: 'Pierwszy' },
  { id: 'b', text: 'Drugi' },
  { id: 'c', text: 'Trzeci' },
]

const orderingQuestion = (list = items) => [
  { id: 'o1', type: 'ordering' as const, points: 1, explanation: '', options: [], config: { items: list } },
]

const rngFrom = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

test('ordering validates item count, empty texts and duplicate ids', () => {
  const t = questionTypes.ordering
  assert.equal(t.validate({ type: 'ordering', options: [], config: { items } }), null)
  assert.ok(t.validate({ type: 'ordering', options: [], config: { items: [items[0]] } }))
  assert.ok(t.validate({ type: 'ordering', options: [], config: { items: [items[0], { id: 'x', text: '  ' }] } }))
  assert.ok(t.validate({ type: 'ordering', options: [], config: { items: [items[0], { id: 'a', text: 'Inny' }] } }))
  assert.ok(t.validate({ type: 'ordering', options: [], config: undefined }))
})

test('ordering grades the exact sequence by normalized text', () => {
  const ok = gradeQuiz(orderingQuestion(), { o1: { order: ['a', 'b', 'c'] } })
  assert.equal(ok.percent, 100)
  // case and spacing do not matter, the text sequence does
  const spaced = gradeQuiz(orderingQuestion([{ id: 'a', text: 'Alfa' }, { id: 'b', text: 'Beta' }]), {
    o1: { order: ['a', 'b'] },
  })
  assert.equal(spaced.percent, 100)
  assert.equal(gradeQuiz(orderingQuestion(), { o1: { order: ['b', 'a', 'c'] } }).percent, 0)
  assert.equal(gradeQuiz(orderingQuestion(), { o1: { order: ['a', 'b'] } }).percent, 0)
  assert.equal(gradeQuiz(orderingQuestion(), {}).percent, 0)
})

test('ordering rejects duplicated and unknown ids', () => {
  assert.equal(gradeQuiz(orderingQuestion(), { o1: { order: ['a', 'a', 'b'] } }).percent, 0)
  assert.equal(gradeQuiz(orderingQuestion(), { o1: { order: ['a', 'b', 'zzz'] } }).percent, 0)
  assert.equal(gradeQuiz(orderingQuestion(), { o1: { order: [] } }).percent, 0)
})

test('ordering accepts a swap of two identical items', () => {
  const list = [
    { id: 'a', text: 'Ten sam' },
    { id: 'b', text: 'ten  SAM' },
    { id: 'c', text: 'Inny' },
  ]
  assert.equal(gradeQuiz(orderingQuestion(list), { o1: { order: ['b', 'a', 'c'] } }).percent, 100)
  assert.equal(gradeQuiz(orderingQuestion(list), { o1: { order: ['a', 'c', 'b'] } }).percent, 0)
})

test('ordering playerView shuffles and never returns the correct order', () => {
  // a degenerate rng would leave the list untouched: the fallback rotation must kick in
  const view = typeDef('ordering').playerView(
    { type: 'ordering', options: [], config: { items } },
    () => 0.999999,
    false,
  ) as { config: { items: { id: string }[] } }
  assert.notDeepEqual(
    view.config.items.map((i) => i.id),
    ['a', 'b', 'c'],
  )
  assert.deepEqual([...view.config.items.map((i) => i.id)].sort(), ['a', 'b', 'c'])
})

test('ordering playerView keeps the author order in the editor view', () => {
  const view = typeDef('ordering').playerView(
    { type: 'ordering', options: [], config: { items } },
    rngFrom([0.1]),
    true,
  ) as { config: { items: { id: string }[] } }
  assert.deepEqual(
    view.config.items.map((i) => i.id),
    ['a', 'b', 'c'],
  )
})

test('ordering describe lists the player order and the correct sequence', () => {
  const described = typeDef('ordering').describe(
    { type: 'ordering', options: [], config: { items } },
    { order: ['b', 'a', 'c'] },
  )
  assert.equal(described.answerText, '1. Drugi, 2. Pierwszy, 3. Trzeci')
  assert.deepEqual(described.correctAnswers, ['Pierwszy → Drugi → Trzeci'])
})

test('orderingItems reads the player payload and ignores broken config', () => {
  assert.deepEqual(orderingItems({ items }), items)
  assert.deepEqual(orderingItems({ items: 42 }), [])
  assert.deepEqual(orderingItems(undefined), [])
})
