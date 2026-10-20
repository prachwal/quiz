import assert from 'node:assert/strict'
import { test } from 'node:test'
import { imageField, verbImageIds, verbListBody, weakVerbBody, weakVerbImageIds } from '../server/verbMedia.ts'
import type { IrregularVerb } from '../src/shared/quiz/types.ts'

const verb = (id: number, base: string, imageMediaId?: string | null): IrregularVerb => ({
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
  ...(imageMediaId !== undefined ? { imageMediaId } : {}),
})

// the row mapping of server/irregularVerbs.ts spreads imageField(row.image_media_id) after examplePl
const fromRow = (id: number, imageMediaId: string | null): IrregularVerb => ({
  id,
  base: 'go',
  cefrLevel: 'B2',
  difficulty: 'medium',
  popularity: 'common',
  pattern: 'ABC',
  pastSimple: ['went'],
  pastParticiple: ['gone'],
  meanings: ['iść'],
  exampleEn: 'ex',
  examplePl: 'przyklad',
  ...imageField(imageMediaId),
})

const IMAGE = '0b9c2f7e-7a4e-4d55-9d0a-2f6f3c1a9e11'

test('imageField omits the key for a verb without an image', () => {
  assert.deepEqual(imageField(null), {})
  assert.equal('imageMediaId' in fromRow(1, null), false)
})

test('imageField carries the id only when the verb has an image', () => {
  assert.deepEqual(imageField(IMAGE), { imageMediaId: IMAGE })
  assert.equal(fromRow(1, IMAGE).imageMediaId, IMAGE)
})

test('the JSON of image-free verbs is exactly the pre-L2 shape', () => {
  const json = JSON.stringify(fromRow(7, null))
  assert.equal(
    json,
    '{"id":7,"base":"go","cefrLevel":"B2","difficulty":"medium","popularity":"common","pattern":"ABC",' +
      '"pastSimple":["went"],"pastParticiple":["gone"],"meanings":["iść"],"exampleEn":"ex","examplePl":"przyklad"}',
  )
})

test('verbImageIds keeps only the verbs that have an image', () => {
  const verbs = [verb(1, 'go', IMAGE), verb(2, 'do', null), verb(3, 'be')]
  assert.deepEqual(verbImageIds(verbs), [IMAGE])
  assert.deepEqual(verbImageIds([verb(2, 'do', null)]), [])
})

test('verbListBody answers the plain array when the media map is empty (JSON unchanged)', () => {
  const verbs = [verb(1, 'go'), verb(2, 'do', null)]
  const body = verbListBody(verbs, {})
  assert.equal(body, verbs)
  assert.equal(JSON.stringify(body), JSON.stringify(verbs))
})

test('verbListBody adds the media map next to the verbs when there is one', () => {
  const verbs = [verb(1, 'go', IMAGE)]
  const media = { [IMAGE]: { url: `https://media.test/media/2026/${IMAGE}.webp`, width: 400, height: 300 } }
  assert.deepEqual(verbListBody(verbs, media), { verbs, media })
})

const weak = (verb: IrregularVerb) => ({ verb, attempts: 4, correct: 1, accuracy: 0.25, lastWrongAt: null })

test('weakVerbBody answers the plain list when the media map is empty (JSON unchanged)', () => {
  const items = [weak(fromRow(7, null)), weak(fromRow(8, null))]
  const body = weakVerbBody(items, {})
  assert.equal(body, items)
  assert.equal(
    JSON.stringify(body),
    JSON.stringify([
      { verb: fromRow(7, null), attempts: 4, correct: 1, accuracy: 0.25, lastWrongAt: null },
      { verb: fromRow(8, null), attempts: 4, correct: 1, accuracy: 0.25, lastWrongAt: null },
    ]),
  )
  assert.equal(JSON.stringify(body).includes('imageMediaId'), false)
})

test('weakVerbBody wraps the list with the media map when a verb has an image', () => {
  const items = [weak(verb(1, 'go', IMAGE)), weak(verb(2, 'do', null))]
  const media = { [IMAGE]: { url: `https://media.test/media/2026/${IMAGE}.webp`, width: 400, height: 300 } }
  assert.deepEqual(weakVerbBody(items, media), { items, media })
})

test('weakVerbImageIds collects the image ids of the weak verbs only', () => {
  assert.deepEqual(weakVerbImageIds([weak(verb(1, 'go', IMAGE)), weak(verb(2, 'do', null))]), [IMAGE])
  assert.deepEqual(weakVerbImageIds([weak(verb(2, 'do', null))]), [])
})
