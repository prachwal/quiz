import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mediaUploadStartInput, MEDIA_MAX_BYTES_DEFAULT } from '../src/shared/media/upload.ts'
import { isMemoryDriver } from '../server/media/config.ts'
import { memoryContentPath, uploadTargetUrl } from '../server/media/uploads.ts'

const sha = 'a'.repeat(64)
const valid = { contentType: 'image/png', size: 1234, sha256: sha }

test('upload start accepts the three image types and an optional alt', () => {
  for (const contentType of ['image/png', 'image/jpeg', 'image/webp']) {
    assert.equal(mediaUploadStartInput.safeParse({ ...valid, contentType }).success, true, contentType)
  }
  assert.equal(mediaUploadStartInput.safeParse({ ...valid, alt: 'Opis' }).success, true)
})

test('upload start refuses GIF, SVG and other types', () => {
  for (const contentType of ['image/gif', 'image/svg+xml', 'text/plain', 'application/octet-stream']) {
    assert.equal(mediaUploadStartInput.safeParse({ ...valid, contentType }).success, false, contentType)
  }
})

test('upload start refuses a non-positive or fractional size', () => {
  assert.equal(mediaUploadStartInput.safeParse({ ...valid, size: 0 }).success, false)
  assert.equal(mediaUploadStartInput.safeParse({ ...valid, size: 1.5 }).success, false)
  assert.equal(mediaUploadStartInput.safeParse({ ...valid, size: -3 }).success, false)
})

test('upload start leaves the size ceiling to the configured limit (MEDIA_MAX_BYTES)', () => {
  assert.equal(mediaUploadStartInput.safeParse({ ...valid, size: MEDIA_MAX_BYTES_DEFAULT + 1 }).success, true)
})

test('upload start requires a lowercase 64-character sha256', () => {
  assert.equal(mediaUploadStartInput.safeParse({ ...valid, sha256: 'A'.repeat(64) }).success, false)
  assert.equal(mediaUploadStartInput.safeParse({ ...valid, sha256: 'a'.repeat(63) }).success, false)
  assert.equal(mediaUploadStartInput.safeParse({ ...valid, sha256: 'g'.repeat(64) }).success, false)
})

test('upload start refuses an alt over 200 characters', () => {
  assert.equal(mediaUploadStartInput.safeParse({ ...valid, alt: 'x'.repeat(200) }).success, true)
  assert.equal(mediaUploadStartInput.safeParse({ ...valid, alt: 'x'.repeat(201) }).success, false)
})

test('memory driver: the PUT target is the same-origin content route, not memory://', () => {
  const id = '0b6f1c2e-7d1a-4c55-9f3e-2a1b3c4d5e6f'
  assert.equal(memoryContentPath(id), `/api/media/${id}/content`)
  assert.equal(uploadTargetUrl(true, id, `memory://put/media/2026/${id}.png`), `/api/media/${id}/content`)
})

test('s3 driver: the presigned URL is passed through unchanged', () => {
  const id = '0b6f1c2e-7d1a-4c55-9f3e-2a1b3c4d5e6f'
  const signed = `https://bucket.example/media/2026/${id}.png?X-Amz-Signature=abc`
  assert.equal(uploadTargetUrl(false, id, signed), signed)
})

test('isMemoryDriver is true only for MEDIA_DRIVER=memory (unset means s3)', () => {
  assert.equal(isMemoryDriver({ MEDIA_DRIVER: 'memory' }), true)
  assert.equal(isMemoryDriver({ MEDIA_DRIVER: ' memory ' }), true)
  assert.equal(isMemoryDriver({ MEDIA_DRIVER: 's3' }), false)
  assert.equal(isMemoryDriver({}), false)
})
