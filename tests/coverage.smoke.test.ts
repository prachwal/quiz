import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as engine from '../src/shared/quiz/engine.ts'
import * as schema from '../src/shared/quiz/schema.ts'
import * as spaced from '../src/shared/quiz/spaced.ts'
import * as streaks from '../src/shared/quiz/streaks.ts'
import * as weak from '../src/shared/quiz/weak.ts'
import * as csv from '../src/shared/quiz/csv.ts'
import * as counts from '../src/features/quizzes/counts.ts'
import * as format from '../src/features/learn/format.ts'
import * as swipe from '../src/features/learn/swipe.ts'
import * as groupOptions from '../src/components/groupOptions.ts'
import * as speech from '../src/features/audio/speech.ts'
import * as builder from '../server/verbQuizBuilder.ts'

test('smoke: pure modules load and expose exports', () => {
  for (const mod of [engine, schema, spaced, streaks, weak, csv, counts, format, swipe, groupOptions, speech, builder]) {
    assert.ok(Object.keys(mod).length > 0)
  }
})

test('smoke: engine defaultOptions and validators callable', () => {
  for (const t of engine.QUESTION_TYPES) {
    const def = engine.questionTypes[t].defaultOptions()
    assert.ok(Array.isArray(def))
    engine.questionTypes[t].validate({ type: t, options: def })
  }
})

test('smoke: spaced accuracy and nextReview', () => {
  assert.equal(spaced.accuracy({ attempts: 0, correct: 0 }), null)
  assert.equal(spaced.accuracy({ attempts: 2, correct: 1 }), 0.5)
  spaced.nextReview(spaced.newReviewState(), true, new Date())
  spaced.nextReview(spaced.newReviewState(), false, new Date())
})

test('smoke: streaks helpers', () => {
  streaks.localDay(new Date(), 'UTC')
  streaks.shiftDay('2026-01-01', 1)
  streaks.isValidTimeZone('UTC')
  streaks.isActiveDay({ answered: 1, lessons: 0 })
  streaks.lastSevenDays(new Map(), '2026-01-01')
  streaks.computeStreaks([], '2026-01-01')
})

test('smoke: weak helpers', () => {
  weak.accuracyOf({ attempts: 0, correct: 0 })
  weak.isWeak({ attempts: 3, correct: 1, box: 0, lastWrongAt: null })
  weak.rankWeak([], 5)
})

test('smoke: csv helpers', () => {
  csv.csvCell('x')
  csv.reportToCsv({ assignments: [], rows: [] })
})

test('smoke: counts clamp', () => {
  counts.clampCount(10, counts.GENERATE_COUNT)
})

test('smoke: format/swipe/groupOptions', () => {
  format.formsText(['a'])
  assert.equal(typeof format.PATTERN_HINTS.AAA, 'string')
  swipe.swipeDirection(10, 0, 100)
  swipe.startsAtEdge(1, 10)
  assert.ok(groupOptions.difficultyOptions.length > 0)
  assert.ok(groupOptions.popularityOptions.length > 0)
})

test('smoke: speech helpers', () => {
  speech.pickVoice([{ lang: 'en-US' }], 'en-US')
  speech.verbSpeechParts({ base: 'go', pastSimple: ['went'], pastParticiple: ['gone'] })
  speech.getVoices()
  speech.getActiveKey()
  speech.stopSpeaking()
  speech.speakParts('k', ['a'], { accent: 'en-US', rate: 1 })
})

test('smoke: builder helpers', () => {
  builder.regularForm('go')
  builder.randomSample([1, 2, 3], 2)
  const v = { id: 1, base: 'go', cefrLevel: 'B2', difficulty: 'medium', popularity: 'common', pattern: 'ABC', pastSimple: ['went'], pastParticiple: ['gone'], meanings: ['isc'], exampleEn: 'e', examplePl: 'p' } as any
  builder.buildVerbQuiz([v], [v], 'mixed', 'T', 'D')
})
