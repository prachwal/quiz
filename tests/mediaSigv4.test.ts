import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  amzDates,
  canonicalQuery,
  canonicalRequest,
  presignUrl,
  signature,
  signingKey,
  signRequest,
  stringToSign,
  uriEncode,
  EMPTY_PAYLOAD_SHA256,
} from '../server/media/sigv4.ts'

// Example credentials from the AWS documentation (not secrets).
const EXAMPLE = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' }

test('the empty payload hash is the SHA-256 of nothing', () => {
  assert.equal(EMPTY_PAYLOAD_SHA256, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})

test('signing key derivation matches the AWS documentation example (IAM, 2012-02-15)', () => {
  const key = signingKey('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20120215', { region: 'us-east-1', service: 'iam' })
  assert.equal(Buffer.from(key).toString('hex'), 'f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d')
})

test('get-vanilla: canonical request, string to sign and signature match the AWS SigV4 test suite', () => {
  // get-vanilla case of the AWS SigV4 test suite (aws-sig-v4-test-suite), values as published
  const creds = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }
  const canonical = canonicalRequest({
    method: 'GET',
    path: '/',
    query: [],
    headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
    payloadHash: EMPTY_PAYLOAD_SHA256,
  })
  assert.equal(canonical.signedHeaders, 'host;x-amz-date')
  const toSign = stringToSign('20150830T123600Z', '20150830', { region: 'us-east-1', service: 'service' }, canonical.text)
  const sig = signature(signingKey(creds.secretAccessKey, '20150830', { region: 'us-east-1', service: 'service' }), toSign)
  assert.equal(sig, '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31')
})

test('S3 GET with a Range header: the header-signing example from the S3 documentation', () => {
  const headers = signRequest({
    method: 'GET',
    path: '/test.txt',
    headers: { host: 'examplebucket.s3.amazonaws.com', range: 'bytes=0-9' },
    payloadHash: EMPTY_PAYLOAD_SHA256,
    credentials: EXAMPLE,
    scope: { region: 'us-east-1', service: 's3' },
    now: new Date('2013-05-24T00:00:00Z'),
  })
  assert.equal(headers['x-amz-date'], '20130524T000000Z')
  assert.ok(headers.Authorization.includes('SignedHeaders=host;range;x-amz-content-sha256;x-amz-date'))
  assert.ok(headers.Authorization.endsWith('Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'))
  assert.equal(headers.host, undefined, 'host is not sent by the caller')
})

test('presigned GET: the query-string example from the S3 documentation', () => {
  const url = presignUrl({
    method: 'GET',
    endpoint: new URL('https://examplebucket.s3.amazonaws.com'),
    path: '/test.txt',
    credentials: EXAMPLE,
    scope: { region: 'us-east-1', service: 's3' },
    now: new Date('2013-05-24T00:00:00Z'),
    expiresInSeconds: 86400,
  })
  assert.equal(
    url,
    'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
      '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
      '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
      '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
  )
})

test('presigned PUT signs the listed headers and keeps the path-style path', () => {
  const url = presignUrl({
    method: 'PUT',
    endpoint: new URL('https://s3.us-east-1.amazonaws.com'),
    path: '/quiz-media/dev/media/2026/a.webp',
    headers: { 'content-type': 'image/webp' },
    credentials: EXAMPLE,
    scope: { region: 'us-east-1', service: 's3' },
    now: new Date('2026-10-20T12:00:00Z'),
    expiresInSeconds: 300,
  })
  assert.ok(url.startsWith('https://s3.us-east-1.amazonaws.com/quiz-media/dev/media/2026/a.webp?X-Amz-Algorithm='))
  assert.ok(url.includes('X-Amz-SignedHeaders=content-type%3Bhost'))
  assert.ok(url.includes('X-Amz-Expires=300'))
  assert.match(url, /X-Amz-Signature=[0-9a-f]{64}$/)
})

test('uriEncode and canonicalQuery follow the SigV4 rules', () => {
  assert.equal(uriEncode('a b/c~_.-'), 'a%20b%2Fc~_.-')
  assert.equal(uriEncode('a/b', false), 'a/b')
  assert.equal(uriEncode('é'), '%C3%A9')
  assert.equal(canonicalQuery([['b', '2'], ['a', 'z'], ['a', 'y']]), 'a=y&a=z&b=2')
})

test('amzDates formats the timestamp for x-amz-date and the credential scope', () => {
  assert.deepEqual(amzDates(new Date('2015-08-30T12:36:00Z')), { amzDate: '20150830T123600Z', dateStamp: '20150830' })
})

test('a different secret yields a different signature (sanity check on the key chain)', () => {
  const a = signRequest({ method: 'DELETE', path: '/b/k', headers: { host: 'h' }, payloadHash: EMPTY_PAYLOAD_SHA256, credentials: EXAMPLE, scope: { region: 'us-east-1', service: 's3' }, now: new Date(0) })
  const b = signRequest({ method: 'DELETE', path: '/b/k', headers: { host: 'h' }, payloadHash: EMPTY_PAYLOAD_SHA256, credentials: { ...EXAMPLE, secretAccessKey: 'other' }, scope: { region: 'us-east-1', service: 's3' }, now: new Date(0) })
  assert.notEqual(a.Authorization, b.Authorization)
})
