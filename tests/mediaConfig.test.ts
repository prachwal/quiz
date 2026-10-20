import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mediaUrlFor, publicBaseUrlOf, resolveMediaConfig } from '../server/media/config.ts'
import { getStorage } from '../server/media/driver.ts'

const s3Env = {
  S3_BUCKET: 'quiz-media',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'AKIDTEST',
  S3_SECRET_ACCESS_KEY: 'secret-test',
  MEDIA_PUBLIC_BASE_URL: 'https://media.example.com/',
}

test('the s3 driver is the default and names every missing variable in Polish', () => {
  assert.throws(() => resolveMediaConfig({}), (error: Error) => {
    assert.match(error.message, /MEDIA_DRIVER=s3\) nie jest skonfigurowany/)
    for (const name of ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'MEDIA_PUBLIC_BASE_URL']) {
      assert.match(error.message, new RegExp(name))
    }
    return true
  })
})

test('only the variables that are actually missing are listed', () => {
  assert.throws(() => resolveMediaConfig({ ...s3Env, S3_BUCKET: '  ', S3_SECRET_ACCESS_KEY: undefined }), (error: Error) => {
    assert.match(error.message, /S3_BUCKET, S3_SECRET_ACCESS_KEY/)
    assert.doesNotMatch(error.message, /S3_REGION/)
    return true
  })
})

test('a complete s3 configuration derives the default endpoint and the defaults', () => {
  const config = resolveMediaConfig(s3Env)
  assert.equal(config.driver, 's3')
  assert.equal(config.maxBytes, 2097152)
  assert.equal(config.keyPrefix, '')
  assert.equal(config.publicBaseUrl, 'https://media.example.com')
  assert.deepEqual(config.s3, {
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    region: 'us-east-1',
    bucket: 'quiz-media',
    accessKeyId: 'AKIDTEST',
    secretAccessKey: 'secret-test',
  })
})

test('S3_ENDPOINT, S3_KEY_PREFIX and MEDIA_MAX_BYTES are read and checked', () => {
  const config = resolveMediaConfig({
    ...s3Env,
    S3_ENDPOINT: 'https://example-endpoint.test/',
    S3_KEY_PREFIX: 'dev',
    MEDIA_MAX_BYTES: '4096',
    S3_FORCE_PATH_STYLE: 'true',
  })
  assert.equal(config.s3?.endpoint, 'https://example-endpoint.test')
  assert.equal(config.keyPrefix, 'dev/')
  assert.equal(config.maxBytes, 4096)
  assert.throws(() => resolveMediaConfig({ ...s3Env, MEDIA_MAX_BYTES: '0' }), /MEDIA_MAX_BYTES/)
  assert.throws(() => resolveMediaConfig({ ...s3Env, MEDIA_MAX_BYTES: '2MB' }), /MEDIA_MAX_BYTES/)
  assert.throws(() => resolveMediaConfig({ ...s3Env, S3_FORCE_PATH_STYLE: 'false' }), /path-style/)
  assert.throws(() => resolveMediaConfig({ ...s3Env, S3_KEY_PREFIX: '../x' }), /S3_KEY_PREFIX/)
})

test('MEDIA_PUBLIC_BASE_URL must be an https URL', () => {
  assert.throws(() => resolveMediaConfig({ ...s3Env, MEDIA_PUBLIC_BASE_URL: 'http://media.example.com' }), /https/)
  assert.throws(() => resolveMediaConfig({ ...s3Env, MEDIA_PUBLIC_BASE_URL: 'media.example.com' }), /absolute/)
})

test('an unknown MEDIA_DRIVER is refused', () => {
  assert.throws(() => resolveMediaConfig({ MEDIA_DRIVER: 'gcs' }), /MEDIA_DRIVER ma nieznaną wartość "gcs"/)
})

test('the memory driver needs no configuration and falls back to media.test', () => {
  const config = resolveMediaConfig({ MEDIA_DRIVER: 'memory' })
  assert.equal(config.driver, 'memory')
  assert.equal(config.s3, null)
  assert.equal(config.publicBaseUrl, 'https://media.test')
})

test('getStorage fails clearly for an unconfigured s3 driver and works for the memory driver', async () => {
  assert.throws(() => getStorage({}), /brakuje zmiennych: S3_BUCKET/)
  const driver = getStorage({ MEDIA_DRIVER: 'memory' })
  await driver.put('media/2026/a.png', new Uint8Array([1, 2]), { contentType: 'image/png' })
  assert.equal(driver.publicUrl('media/2026/a.png'), 'https://media.test/media/2026/a.png')
  assert.deepEqual(await driver.head('media/2026/a.png'), { size: 2, contentType: 'image/png' })
})

test('publicBaseUrlOf needs only MEDIA_PUBLIC_BASE_URL and never throws', () => {
  assert.equal(publicBaseUrlOf({}), null)
  assert.equal(publicBaseUrlOf({ MEDIA_PUBLIC_BASE_URL: '   ' }), null)
  assert.equal(publicBaseUrlOf({ MEDIA_PUBLIC_BASE_URL: 'https://media.example.com/' }), 'https://media.example.com')
  assert.equal(publicBaseUrlOf({ MEDIA_PUBLIC_BASE_URL: 'http://media.example.com' }), null)
  assert.equal(publicBaseUrlOf({ MEDIA_PUBLIC_BASE_URL: 'not a url' }), null)
  // no S3 settings are needed to build an address
  assert.equal(publicBaseUrlOf({ S3_KEY_PREFIX: 'dev/' }), null)
})

test('mediaUrlFor joins the base and the stored key without doubling slashes', () => {
  assert.equal(mediaUrlFor('https://media.test', 'dev/media/2026/a.png'), 'https://media.test/dev/media/2026/a.png')
  assert.equal(mediaUrlFor('https://media.test/', 'media/2026/a.webp'), 'https://media.test/media/2026/a.webp')
})
