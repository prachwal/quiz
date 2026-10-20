import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  introNeedsSlide,
  LESSON_INTRO_MAX_LENGTH,
  validateLessonIntro,
} from '../src/shared/quiz/lessonIntro.ts'

const ID = '6f1c2a4e-9b3d-4e8f-8a7b-1c2d3e4f5a6b'

test('plain intro of any length up to 2000 characters is valid', () => {
  assert.deepEqual(validateLessonIntro(''), [])
  assert.deepEqual(validateLessonIntro('Krótki wstęp.'), [])
  assert.deepEqual(validateLessonIntro('a'.repeat(LESSON_INTRO_MAX_LENGTH)), [])
})

test('more than 2000 characters is refused (code points, not bytes)', () => {
  const problems = validateLessonIntro('a'.repeat(LESSON_INTRO_MAX_LENGTH + 1))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /najwyżej 2000 znaków/)
  // an emoji is one character for the author even though it is two UTF-16 units
  assert.deepEqual(validateLessonIntro('😀'.repeat(LESSON_INTRO_MAX_LENGTH)), [])
})

test('a valid image reference is allowed (up to three per intro)', () => {
  assert.deepEqual(validateLessonIntro(`Patrz ![Tabela form](media:${ID}).`), [])
  const three = [1, 2, 3].map((n) => `![obraz ${n}](media:${ID.slice(0, -1)}${n})`).join(' ')
  assert.deepEqual(validateLessonIntro(three), [])
  const four = [1, 2, 3, 4].map((n) => `![obraz ${n}](media:${ID.slice(0, -1)}${n})`).join(' ')
  assert.match(validateLessonIntro(four).join(' '), /najwyżej 3 obrazy/)
})

test('external images are refused with the quiz message', () => {
  const problems = validateLessonIntro('Patrz ![x](https://example.com/a.png)')
  assert.equal(problems.length, 1)
  assert.match(problems[0], /zewnętrznego adresu/)
})

test('an image without alt text or with a malformed target is refused', () => {
  assert.match(validateLessonIntro(`![](media:${ID})`).join(' '), /wymaga opisu/)
  assert.match(validateLessonIntro(`![x](media:NIE-UUID)`).join(' '), /Niepoprawny zapis obrazu/)
  assert.match(validateLessonIntro(`![${'x'.repeat(201)}](media:${ID})`).join(' '), /najwyżej 200 znaków/)
})

test('the first slide appears for an image or for a text longer than 140 characters', () => {
  assert.equal(introNeedsSlide(''), false)
  assert.equal(introNeedsSlide('a'.repeat(140)), false)
  assert.equal(introNeedsSlide('a'.repeat(141)), true)
  assert.equal(introNeedsSlide(`Krótko ![ilustracja](media:${ID})`), true)
})
