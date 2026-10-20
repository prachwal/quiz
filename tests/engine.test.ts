import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clozeParts, gradedImageIds, imageFieldErrors, quizImageCount, quizImageIds } from '../src/shared/quiz/engine.ts'
import {
  clozeMarkers,
  gradeQuiz,
  isAnswered,
  normalizeGapAnswer,
  normalizeText,
  orderingItems,
  parseNumeric,
  promptText,
  questionTypes,
  typeDef,
  QUESTION_TYPES,
} from '../src/shared/quiz/engine.ts'

test('QUESTION_TYPES lists every supported type', () => {
  assert.deepEqual([...QUESTION_TYPES], ['single', 'multiple', 'truefalse', 'text', 'numeric', 'ordering', 'matching', 'cloze'])
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

test('ordering playerView shuffles uniformly with the injected rng', () => {
  // rng 0 always swaps with index 0: Fisher-Yates on [a, b, c] gives [b, c, a]
  const view = typeDef('ordering').playerView(
    { type: 'ordering', options: [], config: { items } },
    () => 0,
    false,
  ) as { config: { items: { id: string }[] } }
  assert.deepEqual(
    view.config.items.map((i) => i.id),
    ['b', 'c', 'a'],
  )
  // the author order is a possible arrangement: an identity permutation from the rng keeps it
  const identity = typeDef('ordering').playerView(
    { type: 'ordering', options: [], config: { items } },
    () => 0.999999,
    false,
  ) as { config: { items: { id: string }[] } }
  assert.deepEqual(
    identity.config.items.map((i) => i.id),
    ['a', 'b', 'c'],
  )
})

test('ordering playerView returns a permutation of the same items', () => {
  const view = typeDef('ordering').playerView(
    { type: 'ordering', options: [], config: { items } },
    rngFrom([0.3, 0.8, 0.1]),
    false,
  ) as { config: { items: { id: string; text: string }[] } }
  assert.deepEqual(
    [...view.config.items].sort((x, y) => x.id.localeCompare(y.id)),
    [...items].sort((x, y) => x.id.localeCompare(y.id)),
  )
})

test('ordering without an order is unanswered and grades 0', () => {
  assert.equal(gradeQuiz(orderingQuestion(), { o1: {} }).percent, 0)
  assert.equal(gradeQuiz(orderingQuestion(), {}).percent, 0)
  assert.equal(isAnswered(undefined), false)
  assert.equal(isAnswered({}), false)
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

// ---- matching ----------------------------------------------------------------------------

const pairs = [
  { id: 'p1', rightId: 'r1', left: 'kot', right: 'cat' },
  { id: 'p2', rightId: 'r2', left: 'pies', right: 'dog' },
]

const matchingQuestion = (list = pairs) => [
  { id: 'm1', type: 'matching' as const, points: 1, explanation: '', options: [], config: { pairs: list } },
]

test('matching validates pair count, both sides and distinct ids', () => {
  const t = questionTypes.matching
  assert.equal(t.validate({ type: 'matching', options: [], config: { pairs } }), null)
  assert.ok(t.validate({ type: 'matching', options: [], config: { pairs: [pairs[0]] } }))
  assert.ok(t.validate({ type: 'matching', options: [], config: { pairs: [pairs[0], { ...pairs[1], right: ' ' }] } }))
  assert.ok(t.validate({ type: 'matching', options: [], config: { pairs: [pairs[0], { ...pairs[1], id: 'p1' }] } }))
  assert.ok(t.validate({ type: 'matching', options: [], config: { pairs: [pairs[0], { ...pairs[1], rightId: 'r1' }] } }))
  assert.ok(t.validate({ type: 'matching', options: [], config: undefined }))
})

test('matching playerView shuffles the rights with the injected rng and keeps the lefts', () => {
  // rng 0 on [r1, r2]: one swap with index 0 gives [r2, r1]
  const view = typeDef('matching').playerView({ type: 'matching', options: [], config: { pairs } }, () => 0, false) as {
    config: { lefts: { id: string }[]; rights: { id: string }[] }
  }
  assert.deepEqual(view.config.rights.map((r) => r.id), ['r2', 'r1'])
  assert.deepEqual(view.config.lefts.map((l) => l.id), ['p1', 'p2'])
})

test('matching grades proportionally', () => {
  assert.equal(gradeQuiz(matchingQuestion(), { m1: { pairs: { p1: 'r1', p2: 'r2' } } }).percent, 100)
  assert.equal(gradeQuiz(matchingQuestion(), { m1: { pairs: { p1: 'r1', p2: 'r1' } } }).percent, 50)
  assert.equal(gradeQuiz(matchingQuestion(), { m1: { pairs: { p1: 'r1' } } }).percent, 50)
  assert.equal(gradeQuiz(matchingQuestion(), { m1: { pairs: {} } }).percent, 0)
  assert.equal(gradeQuiz(matchingQuestion(), {}).percent, 0)
})

test('matching scores a crossed mistake as 0 for both pairs', () => {
  assert.equal(gradeQuiz(matchingQuestion(), { m1: { pairs: { p1: 'r2', p2: 'r1' } } }).percent, 0)
})

test('matching ignores a right tile used twice and unknown keys', () => {
  // the same tile cannot answer two pairs, even when its text would match
  const same = [
    { id: 'p1', rightId: 'r1', left: 'być', right: 'be' },
    { id: 'p2', rightId: 'r2', left: 'istnieć', right: 'be' },
  ]
  assert.equal(gradeQuiz(matchingQuestion(same), { m1: { pairs: { p1: 'r1', p2: 'r1' } } }).percent, 50)
  // two distinct tiles with the same text are both correct, in either arrangement
  assert.equal(gradeQuiz(matchingQuestion(same), { m1: { pairs: { p1: 'r1', p2: 'r2' } } }).percent, 100)
  assert.equal(gradeQuiz(matchingQuestion(same), { m1: { pairs: { p1: 'r2', p2: 'r1' } } }).percent, 100)
  assert.equal(gradeQuiz(matchingQuestion(), { m1: { pairs: { p1: 'zzz', p2: 'r2' } } }).percent, 50)
})

// ---- cloze -------------------------------------------------------------------------------

const clozeQuestion = (prompt = 'He {{1}} to school and {{2}} it.', gaps = [{ answers: ['went'] }, { answers: ['learnt', 'learned'] }]) => [
  { id: 'c1', type: 'cloze' as const, points: 4, explanation: '', options: [], config: { gaps } },
]

test('cloze validates markers against the gap list', () => {
  const t = questionTypes.cloze
  assert.equal(t.validate({ type: 'cloze', prompt: 'He {{1}} and {{2}}.', options: [], config: { gaps: [{ answers: ['a'] }, { answers: ['b'] }] } }), null)
  // marker without a gap, gap without a marker, wrong order, duplicate marker
  assert.ok(t.validate({ type: 'cloze', prompt: 'He {{1}} and {{2}}.', options: [], config: { gaps: [{ answers: ['a'] }] } }))
  assert.ok(t.validate({ type: 'cloze', prompt: 'He {{1}}.', options: [], config: { gaps: [{ answers: ['a'] }, { answers: ['b'] }] } }))
  assert.ok(t.validate({ type: 'cloze', prompt: 'He {{2}} and {{1}}.', options: [], config: { gaps: [{ answers: ['a'] }, { answers: ['b'] }] } }))
  assert.ok(t.validate({ type: 'cloze', prompt: 'He {{1}} and {{1}}.', options: [], config: { gaps: [{ answers: ['a'] }, { answers: ['b'] }] } }))
  assert.ok(t.validate({ type: 'cloze', prompt: 'Bez znaczników.', options: [], config: { gaps: [{ answers: ['a'] }] } }))
  // empty accepted answers
  assert.ok(t.validate({ type: 'cloze', prompt: 'He {{1}}.', options: [], config: { gaps: [{ answers: [' '] }] } }))
})

test('cloze validate: only canonical markers count', () => {
  const t = questionTypes.cloze
  // {{01}} must not be treated as gap 1: the player would submit under "01" while grading reads "1"
  assert.deepEqual(clozeMarkers('a {{01}} b'), [])
  assert.deepEqual(clozeMarkers('a {{1}} b {{2}}'), [1, 2])
  assert.ok(t.validate({ type: 'cloze', prompt: 'He {{01}}.', options: [], config: { gaps: [{ answers: ['x'] }] } }))
  // {{01}} does not count as gap 1, so a prompt that mixes it with a real marker is also rejected
  assert.ok(t.validate({ type: 'cloze', prompt: 'He {{01}} and {{2}}.', options: [], config: { gaps: [{ answers: ['x'] }, { answers: ['y'] }] } }))
  assert.equal(t.validate({ type: 'cloze', prompt: 'He {{1}} and {{2}}.', options: [], config: { gaps: [{ answers: ['x'] }, { answers: ['y'] }] } }), null)
  // promptText leaves a non-canonical marker alone instead of hiding it
  assert.equal(promptText('He {{01}} and {{2}}.'), 'He {{01}} and ___.')
})

test('cloze validate: answer count and length limits', () => {
  const t = questionTypes.cloze
  const gap = (answers: string[]) => ({ type: 'cloze' as const, prompt: 'He {{1}}.', options: [], config: { gaps: [{ answers }] } })
  assert.equal(t.validate(gap(['a'])), null)
  assert.equal(t.validate(gap(Array.from({ length: 10 }, (_, i) => `v${i}`))), null)
  assert.ok(t.validate(gap(Array.from({ length: 11 }, (_, i) => `v${i}`))))
  assert.equal(t.validate(gap(['x'.repeat(200)])), null)
  assert.ok(t.validate(gap(['x'.repeat(201)])))
  // a single blank variant is rejected even when other variants are fine
  assert.ok(t.validate(gap(['went', '   '])))
  assert.ok(t.validate(gap(['went', ''])))
})

test('normalizeText folds typographic quotes and dashes', () => {
  assert.equal(normalizeText('don’t'), normalizeText("don't"))
  assert.equal(normalizeText('don‘t'), normalizeText("don't"))
  assert.equal(normalizeText('„a”'), normalizeText('"a"'))
  assert.equal(normalizeText('well–known'), normalizeText('well-known'))
  assert.equal(normalizeText('well—known'), normalizeText('well-known'))
  assert.equal(normalizeText('a‑b'), normalizeText('a-b'))
  // diacritics still matter
  assert.notEqual(normalizeText('Do szkoły'), normalizeText('do szkoly'))
})

test('cloze grades proportionally with accepted variants', () => {
  assert.equal(gradeQuiz(clozeQuestion(), { c1: { gaps: { 1: 'went', 2: 'learnt' } } }).percent, 100)
  assert.equal(gradeQuiz(clozeQuestion(), { c1: { gaps: { 1: 'went', 2: 'learned' } } }).percent, 100)
  assert.equal(gradeQuiz(clozeQuestion(), { c1: { gaps: { 1: 'went', 2: 'learn' } } }).percent, 50)
  assert.equal(gradeQuiz(clozeQuestion(), { c1: { gaps: { 1: 'went' } } }).percent, 50)
  assert.equal(gradeQuiz(clozeQuestion(), { c1: { gaps: { 1: '', 2: '' } } }).percent, 0)
  assert.equal(gradeQuiz(clozeQuestion(), {}).percent, 0)
})

test('cloze is case, whitespace and diacritic sensitive', () => {
  const q = clozeQuestion('Idzie {{1}}.', [{ answers: ['do szkoły'] }])
  assert.equal(gradeQuiz(q, { c1: { gaps: { 1: '  Do   SZKOŁY ' } } }).percent, 100)
  assert.equal(gradeQuiz(q, { c1: { gaps: { 1: 'do szkoly' } } }).percent, 0)
})

test('cloze playerView exposes only the gap count', () => {
  const view = typeDef('cloze').playerView(
    { type: 'cloze', options: [], config: { gaps: [{ answers: ['went'] }] } },
    rngFrom([0.5]),
    false,
  ) as { config: unknown }
  assert.deepEqual(view.config, { gaps: 1 })
  const editorView = typeDef('cloze').playerView(
    { type: 'cloze', options: [], config: { gaps: [{ answers: ['went'] }] } },
    rngFrom([0.5]),
    true,
  ) as { config: unknown }
  assert.deepEqual(editorView.config, { gaps: [{ answers: ['went'] }] })
})

test('cloze describe numbers the answers and joins the variants', () => {
  const described = typeDef('cloze').describe(
    { type: 'cloze', options: [], config: { gaps: [{ answers: ['went'] }, { answers: ['learnt', 'learned'] }] } },
    { gaps: { 2: 'learned' } },
  )
  assert.equal(described.answerText, '2: learned')
  assert.deepEqual(described.correctAnswers, ['1: went', '2: learnt / learned'])
})

test('clozeMarkers extracts the marker numbers in order', () => {
  assert.deepEqual(clozeMarkers('a {{2}} b {{1}}'), [2, 1])
  assert.deepEqual(clozeMarkers('brak'), [])
})

// ---- config id length (checked on save, not when grading old data) ------------------------

test('ordering and matching accept ids up to 64 characters and reject 65', () => {
  const ordering = questionTypes.ordering
  const orderingWith = (id: string) => ({ type: 'ordering' as const, options: [], config: { items: [{ id, text: 'A' }, { id: 'b', text: 'B' }] } })
  assert.equal(ordering.validate(orderingWith('x'.repeat(64))), null)
  assert.ok(ordering.validate(orderingWith('x'.repeat(65))))

  const matching = questionTypes.matching
  const pairWith = (id: string, rightId: string) => ({
    type: 'matching' as const,
    options: [],
    config: { pairs: [{ id, rightId, left: 'kot', right: 'cat' }, { id: 'p2', rightId: 'r2', left: 'pies', right: 'dog' }] },
  })
  assert.equal(matching.validate(pairWith('p'.repeat(64), 'r1')), null)
  assert.ok(matching.validate(pairWith('p'.repeat(65), 'r1')))
  assert.equal(matching.validate(pairWith('p1', 'r'.repeat(64))), null)
  assert.ok(matching.validate(pairWith('p1', 'r'.repeat(65))))
})

test('ordering and matching still grade old data with ids longer than 64 characters', () => {
  const longId = 'x'.repeat(100)
  const ordering = gradeQuiz(
    [{ id: 'o1', type: 'ordering', points: 1, explanation: '', options: [], config: { items: [{ id: longId, text: 'A' }, { id: 'b', text: 'B' }] } }],
    { o1: { order: [longId, 'b'] } },
  )
  assert.equal(ordering.percent, 100)
  const matching = gradeQuiz(
    [{ id: 'm1', type: 'matching', points: 1, explanation: '', options: [], config: { pairs: [{ id: longId, rightId: longId, left: 'kot', right: 'cat' }, { id: 'p2', rightId: 'r2', left: 'pies', right: 'dog' }] } }],
    { m1: { pairs: { [longId]: longId, p2: 'r2' } } },
  )
  assert.equal(matching.percent, 100)
})

// ---- cloze: trailing punctuation (D1) ----------------------------------------------------

test('normalizeGapAnswer drops trailing . ! ? only', () => {
  assert.equal(normalizeGapAnswer('went.'), 'went')
  assert.equal(normalizeGapAnswer('went!?'), 'went')
  assert.equal(normalizeGapAnswer('  Went. '), 'went')
  assert.equal(normalizeGapAnswer('3.'), '3')
  assert.equal(normalizeGapAnswer('a.b'), 'a.b')
  // normalizeText itself is unchanged
  assert.equal(normalizeText('went.'), 'went.')
})

test('cloze ignores trailing punctuation in both directions', () => {
  const withDotAnswer = clozeQuestion('He {{1}} home.', [{ answers: ['went.'] }])
  assert.equal(gradeQuiz(withDotAnswer, { c1: { gaps: { 1: 'went' } } }).percent, 100)
  const withoutDotAnswer = clozeQuestion('He {{1}} home.', [{ answers: ['went'] }])
  assert.equal(gradeQuiz(withoutDotAnswer, { c1: { gaps: { 1: 'went.' } } }).percent, 100)
  assert.equal(gradeQuiz(withoutDotAnswer, { c1: { gaps: { 1: 'went!?' } } }).percent, 100)
  assert.equal(gradeQuiz(withoutDotAnswer, { c1: { gaps: { 1: 'gone.' } } }).percent, 0)
})

test('text keeps trailing punctuation significant', () => {
  const q = [{ id: 'q1', type: 'text' as const, points: 1, explanation: '', options: [{ id: 'a', text: '3', isCorrect: true }] }]
  assert.equal(gradeQuiz(q, { q1: { text: '3.' } }).percent, 0)
  const dotted = [{ id: 'q1', type: 'text' as const, points: 1, explanation: '', options: [{ id: 'a', text: '3.', isCorrect: true }] }]
  assert.equal(gradeQuiz(dotted, { q1: { text: '3' } }).percent, 0)
})

test('cloze gap that is only punctuation or blank scores 0', () => {
  const q = clozeQuestion('He {{1}} home.', [{ answers: ['...'] }])
  assert.equal(gradeQuiz(q, { c1: { gaps: { 1: '' } } }).percent, 0)
  assert.equal(gradeQuiz(q, { c1: { gaps: { 1: '...' } } }).percent, 0)
  assert.equal(gradeQuiz(q, { c1: { gaps: { 1: '!?' } } }).percent, 0)
  assert.equal(gradeQuiz(q, { c1: { gaps: { 1: 'went' } } }).percent, 0)
  assert.equal(gradeQuiz(q, {}).percent, 0)
})

// ---- images in question text (Media-Storage-Plan M2) -----------------------------------------------

const MID = '6f1c2a4e-9b3d-4e8f-8a7b-1c2d3e4f5a6b'
const MID2 = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

test('promptText replaces an image with its description, never with the address', () => {
  assert.equal(promptText(`Co na ![Mapa](media:${MID}) widać?`), 'Co na [obraz: Mapa] widać?')
  assert.equal(promptText(`![](media:${MID})`), '[obraz]')
  assert.equal(promptText(`![Kot](media:${MID})`).includes('media:'), false)
})

test('promptText handles cloze markers and images together, and a marker inside an alt is text', () => {
  assert.equal(promptText(`![Kot](media:${MID}) He {{1}} home.`), '[obraz: Kot] He ___ home.')
  assert.equal(promptText(`![{{1}} kot](media:${MID}) He {{2}} home.`), '[obraz: {{1}} kot] He ___ home.')
})

test('clozeMarkers ignores a marker-like text inside an alt, but counts markers around images', () => {
  assert.deepEqual(clozeMarkers(`![{{1}} tekst](media:${MID}) He {{1}} home.`), [1])
  assert.deepEqual(clozeMarkers(`![{{2}}](media:${MID}){{1}} and {{2}}`), [1, 2])
  assert.deepEqual(clozeMarkers(`![Kot](media:${MID})`), [])
})

test('clozeParts keeps images inside text parts so markers around them still split', () => {
  assert.deepEqual(clozeParts(`![{{1}}](media:${MID}) He {{1}} home.`), [`![{{1}}](media:${MID}) He `, '{{1}}', ' home.'])
  assert.deepEqual(clozeParts(`a ![Kot](media:${MID}){{1}}![Pies](media:${MID2}) b`), [
    `a ![Kot](media:${MID})`,
    '{{1}}',
    `![Pies](media:${MID2}) b`,
  ])
  // no images: exactly the old split
  assert.deepEqual(clozeParts('He {{1}} to {{2}}.'), ['He ', '{{1}}', ' to ', '{{2}}', '.'])
})

test('imageFieldErrors: images are allowed in prompt, explanation and choice options only', () => {
  const choice = { type: 'single' as const, prompt: `![Kot](media:${MID})`, explanation: `![Pies](media:${MID2})`, options: [{ text: `![A](media:${MID})`, isCorrect: true }, { text: 'b', isCorrect: false }] }
  assert.deepEqual(imageFieldErrors(choice), [])
  for (const type of ['multiple', 'truefalse'] as const) {
    assert.deepEqual(imageFieldErrors({ ...choice, type, options: [{ text: `![A](media:${MID})`, isCorrect: true }, { text: 'b', isCorrect: false }] }), [])
  }
  const textOption = { type: 'text' as const, prompt: 'P', options: [{ text: `![A](media:${MID})`, isCorrect: true }] }
  const errors = imageFieldErrors(textOption)
  assert.equal(errors.length, 1)
  assert.deepEqual(errors[0].path, ['options', 0, 'text'])
  assert.match(errors[0].message, /odpowiedziach tekstowych/)
  // a text option with a bracket but no image is fine
  assert.deepEqual(imageFieldErrors({ type: 'text', prompt: 'P', options: [{ text: 'wow![x', isCorrect: true }] }), [])

  for (const config of [
    { type: 'matching', config: { pairs: [{ id: '1', rightId: 'r1', left: `![k](media:${MID})`, right: 'cat' }] } },
    { type: 'ordering', config: { items: [{ id: 'a', text: `![k](media:${MID})` }] } },
    { type: 'cloze', prompt: 'He {{1}}.', config: { gaps: [{ answers: [`![k](media:${MID})`] }] } },
    { type: 'numeric', config: { answer: 1 } },
  ] as const) {
    const problems = imageFieldErrors({ options: [], ...config } as never)
    if (config.type === 'numeric') assert.deepEqual(problems, [])
    else assert.deepEqual(problems.map((p) => p.path), [['config']], config.type)
  }
  // a cloze prompt may hold an image; only its gap answers may not
  assert.deepEqual(imageFieldErrors({ type: 'cloze', prompt: `![k](media:${MID}) He {{1}}.`, options: [], config: { gaps: [{ answers: ['went'] }] } }), [])
})

test('imageFieldErrors reports the syntax problems of each field with its path', () => {
  const problems = imageFieldErrors({ type: 'single', prompt: '![](media:' + MID + ')', explanation: '![x](https://a.pl/b.png)', options: [{ text: 'a', isCorrect: true }] })
  assert.deepEqual(problems.map((p) => p.path), [['prompt'], ['explanation']])
})

test('image ids of a question view and of a grading response come from the content only', () => {
  const question = { prompt: `![a](media:${MID})`, explanation: `![b](media:${MID2})`, options: [{ id: 'o1', text: `![c](media:${MID})`, isCorrect: true }, { id: 'o2', text: `![d](media:${MID2})`, isCorrect: false }] }
  assert.deepEqual(quizImageIds({ questions: [question] }).sort(), [MID, MID2].sort())
  // a player-view question carries no explanation: its ids come from prompt and options only
  assert.deepEqual(quizImageIds({ questions: [{ prompt: `![a](media:${MID})`, options: [] }] }), [MID])
  // grading: explanations of graded questions, correct options and the chosen ones; never a typed text
  const graded = gradedImageIds([{ id: 'q1', ...question }], { q1: { optionIds: ['o2'] } })
  assert.deepEqual(graded.sort(), [MID, MID2].sort())
  assert.deepEqual(gradedImageIds([{ id: 'q1', ...question }], { q1: { text: `![x](media:${MID2})` } }).sort(), [MID, MID2].sort())
  assert.deepEqual(gradedImageIds([{ id: 'q1', ...question, explanation: '' }], { q1: { optionIds: [] } }), [MID])
  assert.deepEqual(gradedImageIds([{ id: 'q1', explanation: 'brak', options: [{ id: 'o', text: 'x', isCorrect: true }] }], {}), [])
  assert.equal(quizImageCount([question, question]), 8)
})

