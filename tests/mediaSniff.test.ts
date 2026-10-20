import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sniffImage } from '../server/media/sniff.ts'

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0))
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const u16le = (n: number) => [n & 0xff, (n >>> 8) & 0xff]
const u24le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff]
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat())

function png(width: number, height: number): Uint8Array {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    u32be(13),
    ascii('IHDR'),
    u32be(width),
    u32be(height),
    [8, 6, 0, 0, 0],
    u32be(0),
  )
}

function jpeg(width: number, height: number): Uint8Array {
  return bytes(
    [0xff, 0xd8],
    // APP0 segment, length 4 (two payload bytes)
    [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00],
    // SOF0: length 11, precision 8, height, width, one component
    [0xff, 0xc0, 0x00, 0x0b, 0x08],
    [(height >> 8) & 0xff, height & 0xff],
    [(width >> 8) & 0xff, width & 0xff],
    [0x01, 0x01, 0x11, 0x00],
    [0xff, 0xd9],
  )
}

function webpLossy(width: number, height: number): Uint8Array {
  return bytes(ascii('RIFF'), u32be(22), ascii('WEBP'), ascii('VP8 '), u32be(10), [0, 0, 0], [0x9d, 0x01, 0x2a], u16le(width), u16le(height))
}

function webpLossless(width: number, height: number): Uint8Array {
  const bits = ((width - 1) | ((height - 1) << 14)) >>> 0
  return bytes(ascii('RIFF'), u32be(22), ascii('WEBP'), ascii('VP8L'), u32be(5), [0x2f], [bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff])
}

function webpExtended(width: number, height: number, flags = 0): Uint8Array {
  return bytes(ascii('RIFF'), u32be(22), ascii('WEBP'), ascii('VP8X'), u32be(10), [flags, 0, 0, 0], u24le(width - 1), u24le(height - 1))
}

test('recognises PNG and reads IHDR width and height', () => {
  assert.deepEqual(sniffImage(png(800, 450)), { contentType: 'image/png', width: 800, height: 450 })
})

test('recognises JPEG and reads the SOF size, skipping earlier segments', () => {
  assert.deepEqual(sniffImage(jpeg(512, 256)), { contentType: 'image/jpeg', width: 512, height: 256 })
})

test('recognises WebP in its lossy, lossless and extended forms', () => {
  assert.deepEqual(sniffImage(webpLossy(640, 480)), { contentType: 'image/webp', width: 640, height: 480 })
  assert.deepEqual(sniffImage(webpLossless(640, 480)), { contentType: 'image/webp', width: 640, height: 480 })
  assert.deepEqual(sniffImage(webpExtended(800, 600)), { contentType: 'image/webp', width: 800, height: 600 })
})

test('refuses animated WebP (extended flag bit 0x02)', () => {
  assert.equal(sniffImage(webpExtended(800, 600, 0x02)), null)
})

test('refuses SVG, GIF, plain text and other data', () => {
  assert.equal(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')), null)
  assert.equal(sniffImage(bytes(ascii('GIF89a'), [0x10, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00])), null)
  assert.equal(sniffImage(new TextEncoder().encode('This is a text file that says PNG and JPEG')), null)
  assert.equal(sniffImage(new Uint8Array(0)), null)
})

test('refuses truncated headers', () => {
  const full = png(10, 10)
  assert.equal(sniffImage(full.slice(0, 19)), null)
  assert.equal(sniffImage(full.slice(0, 23)), null)
  assert.equal(sniffImage(jpeg(10, 10).slice(0, 12)), null)
  assert.equal(sniffImage(webpLossy(10, 10).slice(0, 29)), null)
  assert.equal(sniffImage(webpLossless(10, 10).slice(0, 24)), null)
  assert.equal(sniffImage(webpExtended(10, 10).slice(0, 29)), null)
})

test('refuses a PNG signature with a wrong IHDR and zero dimensions', () => {
  const wrongChunk = png(10, 10)
  wrongChunk[12] = 0x58 // "XHDR"
  assert.equal(sniffImage(wrongChunk), null)
  assert.equal(sniffImage(png(0, 10)), null)
})

test('sniffs bytes only: a PNG payload is PNG whatever the caller declares, and text that imitates a header is refused', () => {
  // the function has no declared type parameter; the caller compares its result with the declared type
  assert.equal(sniffImage(png(4, 4))?.contentType, 'image/png')
  // a file that starts with the PNG signature but whose "IHDR" is text is not an image
  const fake = new TextEncoder().encode('\x89PNG\r\n\x1a\nnot really a header at all, sorry')
  assert.equal(sniffImage(fake), null)
})
