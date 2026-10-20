import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mediaKey, normalizeKeyPrefix, extensionFor } from '../server/media/keys.ts'
import { withinDailyLimits } from '../server/media/limits.ts'
import { MEDIA_DAILY_BYTES, MEDIA_DAILY_FILES } from '../server/media/constants.ts'

const uuid = '3f2c1a9e-7b4d-4c8e-9a1f-0123456789ab'

test('mediaKey builds media/<year>/<uuid>.<ext> with the extension from the content type', () => {
  assert.equal(mediaKey('', 2026, uuid, 'image/png'), `media/2026/${uuid}.png`)
  assert.equal(mediaKey('', 2026, uuid, 'image/jpeg'), `media/2026/${uuid}.jpg`)
  assert.equal(mediaKey('', 2026, uuid, 'image/webp'), `media/2026/${uuid}.webp`)
})

test('mediaKey puts the environment prefix in front and adds a missing trailing slash', () => {
  assert.equal(mediaKey('dev/', 2026, uuid, 'image/webp'), `dev/media/2026/${uuid}.webp`)
  assert.equal(mediaKey('preview', 2026, uuid, 'image/webp'), `preview/media/2026/${uuid}.webp`)
})

test('mediaKey refuses types outside the allowlist, so no user-controlled extension can reach a key', () => {
  for (const type of ['image/gif', 'image/svg+xml', 'text/html', 'image/png; name=x.html', '']) {
    assert.throws(() => extensionFor(type), /Unsupported media content type/)
    assert.throws(() => mediaKey('', 2026, uuid, type))
  }
})

test('mediaKey refuses a malformed uuid and an out-of-range year', () => {
  assert.throws(() => mediaKey('', 2026, '../../etc/passwd', 'image/png'), /uuid/)
  assert.throws(() => mediaKey('', 2026, uuid.toUpperCase(), 'image/png'), /uuid/)
  assert.throws(() => mediaKey('', 1999, uuid, 'image/png'), /year/)
  assert.throws(() => mediaKey('', 2026.5, uuid, 'image/png'), /year/)
})

test('normalizeKeyPrefix accepts safe prefixes and rejects traversal and absolute paths', () => {
  assert.equal(normalizeKeyPrefix(''), '')
  assert.equal(normalizeKeyPrefix('  '), '')
  assert.equal(normalizeKeyPrefix('dev'), 'dev/')
  assert.equal(normalizeKeyPrefix('a/b_c-d.e/'), 'a/b_c-d.e/')
  assert.throws(() => normalizeKeyPrefix('../x'), /S3_KEY_PREFIX/)
  assert.throws(() => normalizeKeyPrefix('a/../b'), /S3_KEY_PREFIX/)
  assert.throws(() => normalizeKeyPrefix('/abs'), /S3_KEY_PREFIX/)
  assert.throws(() => normalizeKeyPrefix('a b'), /S3_KEY_PREFIX/)
  assert.throws(() => normalizeKeyPrefix('.hidden'), /S3_KEY_PREFIX/)
})

test('withinDailyLimits stops at the file count and the byte total', () => {
  assert.equal(withinDailyLimits({ files: 0, bytes: 0 }, 1000), true)
  assert.equal(withinDailyLimits({ files: MEDIA_DAILY_FILES - 1, bytes: 0 }, 1), true)
  assert.equal(withinDailyLimits({ files: MEDIA_DAILY_FILES, bytes: 0 }, 1), false)
  assert.equal(withinDailyLimits({ files: 1, bytes: MEDIA_DAILY_BYTES - 10 }, 10), true)
  assert.equal(withinDailyLimits({ files: 1, bytes: MEDIA_DAILY_BYTES - 10 }, 11), false)
})
