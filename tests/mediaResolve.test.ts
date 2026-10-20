import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildMediaMap, resolveMediaWith, withMedia } from '../server/media/mediaMap.ts'

const ID = '6f1c2a4e-9b3d-4e8f-8a7b-1c2d3e4f5a6b'
const ID2 = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

test('buildMediaMap maps each ready row to its address and size', () => {
  const map = buildMediaMap(
    [
      { id: ID, key: 'dev/media/2026/a.png', width: 800, height: 450 },
      { id: ID2, key: 'media/2026/b.webp', width: null, height: null },
    ],
    'https://media.test',
  )
  assert.deepEqual(map, {
    [ID]: { url: 'https://media.test/dev/media/2026/a.png', width: 800, height: 450 },
    [ID2]: { url: 'https://media.test/media/2026/b.webp', width: null, height: null },
  })
  assert.deepEqual(buildMediaMap([], 'https://media.test'), {})
})

test('withMedia leaves a body without images byte for byte unchanged', () => {
  const body = { id: 'q', questions: [{ prompt: 'Ile?', options: [{ id: 'o', text: '4' }] }] }
  assert.equal(withMedia(body, {}), body)
  assert.equal(JSON.stringify(withMedia(body, {})), JSON.stringify(body))
  assert.equal('media' in withMedia(body, {}), false)
})

test('withMedia adds the map only when it has entries', () => {
  const info = { url: 'https://media.test/media/2026/a.png', width: 1, height: 2 }
  assert.deepEqual(withMedia({ id: 'q' }, { [ID]: info }), { id: 'q', media: { [ID]: info } })
})

test('resolveMediaWith answers {} for no ids, whatever the configuration (the reader is never called)', async () => {
  const reader = () => Promise.reject(new Error('no query expected'))
  assert.deepEqual(await resolveMediaWith([], {}, reader), {})
  assert.deepEqual(await resolveMediaWith([], { MEDIA_PUBLIC_BASE_URL: 'https://media.test' }, reader), {})
})

test('resolveMediaWith without a public base URL gives no entries and does not query', async () => {
  const reader = () => Promise.reject(new Error('no query expected without a base URL'))
  assert.deepEqual(await resolveMediaWith([ID, ID2], {}, reader), {})
  assert.deepEqual(await resolveMediaWith([ID], { MEDIA_PUBLIC_BASE_URL: 'http://plain.example' }, reader), {})
})

test('resolveMediaWith queries once with the unique ids and maps the rows it gets', async () => {
  const calls: string[][] = []
  const reader = async (ids: string[]) => {
    calls.push(ids)
    return [{ id: ID, key: 'media/2026/a.png', width: 800, height: 450 }]
  }
  const map = await resolveMediaWith([ID, ID, ID2], { MEDIA_PUBLIC_BASE_URL: 'https://media.test/' }, reader)
  assert.deepEqual(calls, [[ID, ID2]])
  assert.deepEqual(map, { [ID]: { url: 'https://media.test/media/2026/a.png', width: 800, height: 450 } })
})
