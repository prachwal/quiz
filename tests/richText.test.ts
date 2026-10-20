import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  countImages,
  extractMediaIds,
  hasImageSyntax,
  imageSyntaxErrors,
  parseRichText,
  stripImages,
} from '../src/shared/media/richText.ts'

const ID = '6f1c2a4e-9b3d-4e8f-8a7b-1c2d3e4f5a6b'
const ID2 = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const img = (alt: string, id = ID) => `![${alt}](media:${id})`

test('plain text without images is one text part and unchanged', () => {
  assert.deepEqual(parseRichText('Ile to 2+2?'), [{ type: 'text', text: 'Ile to 2+2?' }])
  assert.deepEqual(parseRichText(''), [])
  assert.deepEqual(extractMediaIds('Ile to 2+2?'), [])
  assert.equal(countImages('Ile to 2+2?'), 0)
  assert.equal(stripImages('Ile to 2+2?'), 'Ile to 2+2?')
  assert.deepEqual(imageSyntaxErrors('Ile to 2+2? (ok) [nawias] {klamra}'), [])
})

test('an image in the middle of a sentence splits the text around it', () => {
  const text = `Na mapie ${img('Mapa Polski')} widać stolicę.`
  assert.deepEqual(parseRichText(text), [
    { type: 'text', text: 'Na mapie ' },
    { type: 'image', alt: 'Mapa Polski', mediaId: ID },
    { type: 'text', text: ' widać stolicę.' },
  ])
  assert.deepEqual(imageSyntaxErrors(text), [])
  assert.equal(stripImages(text), 'Na mapie  widać stolicę.')
})

test('several images keep their order and extractMediaIds removes duplicates', () => {
  const text = `${img('a', ID2)} tekst ${img('b', ID)} ${img('c', ID2)}`
  assert.deepEqual(
    parseRichText(text).map((part) => (part.type === 'image' ? part.mediaId : part.text)),
    [ID2, ' tekst ', ID, ' ', ID2],
  )
  assert.deepEqual(extractMediaIds(text), [ID2, ID])
  assert.equal(countImages(text), 3)
  assert.deepEqual(imageSyntaxErrors(text), [])
})

test('an empty alt is an error (D5) but only for a valid reference', () => {
  assert.deepEqual(imageSyntaxErrors(`![](media:${ID})`).length, 1)
  assert.match(imageSyntaxErrors(`![](media:${ID})`)[0], /wymaga opisu/)
  // the parser still reads it (the rejection is the validation's job)
  assert.deepEqual(parseRichText(`![](media:${ID})`), [{ type: 'image', alt: '', mediaId: ID }])
})

test('a malformed uuid is flagged and is not an image', () => {
  for (const bad of ['media:1234', `media:${ID}0`, 'media:not-a-uuid', 'media:', `media:${ID.replace(/-/g, '')}`]) {
    const text = `![opis](${bad})`
    assert.deepEqual(extractMediaIds(text), [], text)
    assert.equal(countImages(text), 0, text)
    assert.equal(imageSyntaxErrors(text).length > 0, true, text)
    assert.match(imageSyntaxErrors(text)[0], /Niepoprawny zapis obrazu/, text)
  }
})

test('uppercase uuid is rejected (decision: lowercase only)', () => {
  const upper = `![opis](media:${ID.toUpperCase()})`
  assert.deepEqual(extractMediaIds(upper), [])
  assert.match(imageSyntaxErrors(upper)[0], /Niepoprawny zapis obrazu/)
})

test('an https image is rejected with the upload hint', () => {
  const text = '![schemat](https://example.com/a.png)'
  assert.deepEqual(extractMediaIds(text), [])
  const errors = imageSyntaxErrors(text)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /zewnętrznego adresu/)
  assert.match(errors[0], /media_upload_from_url/)
  assert.match(errors[0], /media_upload\b/)
  assert.match(imageSyntaxErrors('![x](HTTP://example.com/a.png)')[0], /zewnętrznego/)
})

test('an image alt longer than 200 characters is an error, exactly 200 is fine', () => {
  const max = 'a'.repeat(200)
  assert.deepEqual(imageSyntaxErrors(img(max)), [])
  assert.match(imageSyntaxErrors(img('a'.repeat(201)))[0], /200 znaków/)
})

test('more than three images in one field is an error, three is fine', () => {
  assert.deepEqual(imageSyntaxErrors([img('1'), img('2'), img('3')].join(' ')), [])
  const four = [img('1'), img('2'), img('3'), img('4')].join(' ')
  assert.equal(countImages(four), 4)
  assert.match(imageSyntaxErrors(four).join('|'), /najwyżej 3/)
})

test('cloze gap markers next to an image are kept as text, not as images', () => {
  const text = `${img('Kot')}{{1}} to {{2}}`
  assert.deepEqual(parseRichText(text), [
    { type: 'image', alt: 'Kot', mediaId: ID },
    { type: 'text', text: '{{1}} to {{2}}' },
  ])
  assert.deepEqual(imageSyntaxErrors(text), [])
})

test('text that merely contains an opening bracket is not an image attempt', () => {
  for (const text of ['wow![x', 'wow![x] bez nawiasu', 'krzyk! [x](y)', 'ok![x](']) {
    assert.equal(hasImageSyntax(text), false, text)
    assert.deepEqual(imageSyntaxErrors(text), [], text)
  }
  assert.equal(hasImageSyntax('![x](y)'), true)
})

test('an image with a newline inside the alt is not a valid image', () => {
  assert.equal(countImages(`![a\nb](media:${ID})`), 0)
})
