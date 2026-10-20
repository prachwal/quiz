import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MemoryStorageDriver } from '../server/media/memoryDriver.ts'

const data = new TextEncoder().encode('0123456789')

test('put then head returns the size and the stored content type', async () => {
  const driver = new MemoryStorageDriver()
  await driver.put('media/2026/a.png', data, { contentType: 'image/png' })
  assert.deepEqual(await driver.head('media/2026/a.png'), { size: 10, contentType: 'image/png' })
  assert.equal(await driver.head('media/2026/missing.png'), null)
})

test('getRange returns the inclusive byte range and clamps the end', async () => {
  const driver = new MemoryStorageDriver()
  await driver.put('k', data, { contentType: 'image/webp' })
  assert.equal(new TextDecoder().decode((await driver.getRange('k', 0, 3))!), '0123')
  assert.equal(new TextDecoder().decode((await driver.getRange('k', 7, 99))!), '789')
  assert.equal((await driver.getRange('k', 10, 12))!.byteLength, 0)
  assert.equal(await driver.getRange('nope', 0, 3), null)
  await assert.rejects(driver.getRange('k', 5, 2), RangeError)
})

test('put stores a copy, so later changes to the caller buffer do not reach the object', async () => {
  const driver = new MemoryStorageDriver()
  const buffer = new Uint8Array([1, 2, 3])
  await driver.put('k', buffer, { contentType: 'image/png' })
  buffer[0] = 99
  assert.deepEqual(Array.from((await driver.getRange('k', 0, 2))!), [1, 2, 3])
})

test('remove is idempotent and makes the key disappear', async () => {
  const driver = new MemoryStorageDriver()
  await driver.put('k', data, { contentType: 'image/png' })
  await driver.remove('k')
  await driver.remove('k')
  assert.equal(await driver.head('k'), null)
  assert.equal(await driver.getRange('k', 0, 1), null)
})

test('publicUrl uses MEDIA_PUBLIC_BASE_URL without a trailing slash, or the test default', () => {
  assert.equal(new MemoryStorageDriver().publicUrl('media/2026/x.png'), 'https://media.test/media/2026/x.png')
  assert.equal(new MemoryStorageDriver('https://cdn.example.com/bucket/').publicUrl('media/2026/x.png'), 'https://cdn.example.com/bucket/media/2026/x.png')
})

test('presignPut returns a memory URL and the headers the upload must send, and checks the expiry', async () => {
  const driver = new MemoryStorageDriver()
  const presigned = await driver.presignPut('media/2026/x.webp', { contentType: 'image/webp', expiresInSeconds: 300 })
  assert.equal(presigned.url, 'memory://put/media/2026/x.webp')
  assert.equal(presigned.headers['Content-Type'], 'image/webp')
  assert.equal(presigned.headers['Cache-Control'], 'public, max-age=31536000, immutable')
  await assert.rejects(driver.presignPut('k', { contentType: 'image/png', expiresInSeconds: 0 }), RangeError)
  await assert.rejects(driver.presignPut('k', { contentType: 'image/png', expiresInSeconds: 604801 }), RangeError)
})
