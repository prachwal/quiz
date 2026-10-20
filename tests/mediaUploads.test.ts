import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRichText } from '../src/shared/media/richText.ts'
import { MEDIA_URL_FETCHES_PER_HOUR } from '../server/media/constants.ts'
import { MemoryStorageDriver } from '../server/media/memoryDriver.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  checkSize,
  decodeBase64Image,
  DAILY_LIMIT_REASON,
  mediaMarkdown,
  NOT_SUPPORTED_TYPE,
  sha256Of,
  sniffUpload,
  urlFetchAllowed,
  validateAlt,
  verifyCompletion,
} from '../server/media/uploads.ts'

const ID = '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b'
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0))

/** The first bytes of a PNG of the given size (enough for the sniffer; the rest is not needed). */
function png(width: number, height: number, padding = 0): Uint8Array {
  const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32be(13), ...ascii('IHDR'), ...u32be(width), ...u32be(height), 8, 2, 0, 0, 0]
  return new Uint8Array([...head, ...new Array<number>(padding).fill(0)])
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

test('validateAlt trims, requires 1-200 characters and refuses brackets and line breaks', () => {
  assert.deepEqual(validateAlt('  Kot na płocie  '), { ok: true, value: 'Kot na płocie' })
  assert.equal(validateAlt('').ok, false)
  assert.equal(validateAlt('   ').ok, false)
  assert.equal(validateAlt('a'.repeat(200)).ok, true)
  assert.equal(validateAlt('a'.repeat(201)).ok, false)
  assert.equal(validateAlt('a]b').ok, false)
  assert.equal(validateAlt('a\nb').ok, false)
  assert.equal(validateAlt('a\rb').ok, false)
})

test('the markdown returned by the upload tools is the image syntax the quiz parser reads', () => {
  const markdown = mediaMarkdown('Kot', ID)
  assert.equal(markdown, `![Kot](media:${ID})`)
  assert.deepEqual(parseRichText(`Co to? ${markdown}`), [
    { type: 'text', text: 'Co to? ' },
    { type: 'image', alt: 'Kot', mediaId: ID },
  ])
})

test('decodeBase64Image accepts plain base64, a data URL prefix and line breaks', () => {
  const bytes = png(3, 2)
  const plain = decodeBase64Image(toBase64(bytes), 1000)
  assert.ok(plain.ok)
  assert.deepEqual([...plain.value], [...bytes])
  const prefixed = decodeBase64Image(`data:image/png;base64,${toBase64(bytes)}`, 1000)
  assert.ok(prefixed.ok)
  assert.deepEqual([...prefixed.value], [...bytes])
  const wrapped = decodeBase64Image(toBase64(bytes).replace(/(.{8})/g, '$1\n'), 1000)
  assert.ok(wrapped.ok)
  assert.deepEqual([...wrapped.value], [...bytes])
})

test('decodeBase64Image refuses anything that is not base64, before decoding', () => {
  for (const bad of ['', '!!!!', 'QUJD=D', 'QUJDR', 'QUJ*']) {
    const result = decodeBase64Image(bad, 1000)
    assert.equal(result.ok, false, JSON.stringify(bad))
  }
})

test('decodeBase64Image counts the decoded size from the padding and refuses oversized input without decoding it', () => {
  // 12 characters decode to 9 bytes; 16 characters decode to 12 bytes
  assert.ok(decodeBase64Image('AAAAAAAAAAAA', 9).ok)
  const over = decodeBase64Image('AAAAAAAAAAAAAAAA', 11)
  assert.equal(over.ok, false)
  if (!over.ok) assert.match(over.reason, /za duży/)
  // "QQ==" is one byte
  assert.deepEqual([...(decodeBase64Image('QQ==', 1) as { ok: true; value: Uint8Array }).value], [0x41])
})

test('checkSize: at least one byte, at most the maximum', () => {
  assert.equal(checkSize(0, 10).ok, false)
  assert.equal(checkSize(1, 10).ok, true)
  assert.equal(checkSize(10, 10).ok, true)
  assert.equal(checkSize(11, 10).ok, false)
  assert.equal(checkSize(1.5, 10).ok, false)
})

test('sniffUpload takes the type from the bytes and refuses SVG, GIF, text and oversized files', () => {
  const ok = sniffUpload(png(640, 480), 1 << 20)
  assert.ok(ok.ok)
  if (ok.ok) assert.deepEqual(ok.value, { contentType: 'image/png', width: 640, height: 480 })

  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  assert.deepEqual(sniffUpload(svg, 1 << 20), { ok: false, reason: NOT_SUPPORTED_TYPE })
  const gif = new Uint8Array([...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.deepEqual(sniffUpload(gif, 1 << 20), { ok: false, reason: NOT_SUPPORTED_TYPE })
  // a declared type is not evidence: plain text stays text
  assert.equal(sniffUpload(new TextEncoder().encode('to nie jest obraz, tylko tekst'), 1 << 20).ok, false)

  const big = sniffUpload(png(1, 1, 100), 50)
  assert.equal(big.ok, false)
  if (!big.ok) assert.match(big.reason, /za duży/)
})

test('verifyCompletion accepts the bytes that match the declaration and reports the pixel size', () => {
  const bytes = png(5, 4)
  const result = verifyCompletion({ declaredSize: bytes.byteLength, declaredSha: sha256Of(bytes), declaredType: 'image/png', bytes })
  assert.deepEqual(result, { ok: true, value: { width: 5, height: 4 } })
})

test('verifyCompletion refuses a size, hash or type that differs from the declaration', () => {
  const bytes = png(5, 4)
  const sha = sha256Of(bytes)
  const size = verifyCompletion({ declaredSize: bytes.byteLength + 1, declaredSha: sha, declaredType: 'image/png', bytes })
  assert.equal(size.ok, false)
  if (!size.ok) assert.match(size.reason, /Rozmiar/)
  const hash = verifyCompletion({ declaredSize: bytes.byteLength, declaredSha: '0'.repeat(64), declaredType: 'image/png', bytes })
  assert.equal(hash.ok, false)
  if (!hash.ok) assert.match(hash.reason, /SHA-256/)
  const type = verifyCompletion({ declaredSize: bytes.byteLength, declaredSha: sha, declaredType: 'image/jpeg', bytes })
  assert.equal(type.ok, false)
  if (!type.ok) assert.match(type.reason, /image\/png/)
  const junk = new Uint8Array(20)
  const notImage = verifyCompletion({ declaredSize: 20, declaredSha: sha256Of(junk), declaredType: 'image/png', bytes: junk })
  assert.deepEqual(notImage, { ok: false, reason: NOT_SUPPORTED_TYPE })
})

test('sha256Of matches the standard vector for "abc"', () => {
  assert.equal(sha256Of(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('the hourly URL limit allows fetches below the limit only', () => {
  assert.equal(MEDIA_URL_FETCHES_PER_HOUR, 20)
  assert.equal(urlFetchAllowed(0), true)
  assert.equal(urlFetchAllowed(19), true)
  assert.equal(urlFetchAllowed(20), false)
  assert.match(DAILY_LIMIT_REASON, /100 plików/)
})

test('file-backed memory driver: objects written by one instance are read by another on the same directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'quiz-media-'))
  try {
    const writer = new MemoryStorageDriver('https://media.test', directory)
    const reader = new MemoryStorageDriver('https://media.test', directory)
    const key = `media/2026/${ID}.png`
    await writer.put(key, new Uint8Array([1, 2, 3, 4]), { contentType: 'image/png' })
    assert.deepEqual(await reader.head(key), { size: 4, contentType: 'image/png' })
    assert.deepEqual([...((await reader.getRange(key, 1, 2)) ?? [])], [2, 3])
    assert.equal(reader.publicUrl(key), `https://media.test/${key}`)
    await reader.remove(key)
    assert.equal(await writer.head(key), null)
    await assert.rejects(writer.put('media/../escape.png', new Uint8Array([1]), { contentType: 'image/png' }), /unsafe key/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
