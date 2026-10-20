/**
 * Recognises PNG, JPEG and WebP from the first bytes and reads the pixel size (Media-Storage-Plan D8).
 * The declared content type is never consulted. Everything else (SVG, GIF, text, animated WebP, truncated
 * headers) returns null. Pure: no imports.
 */
import type { MediaContentType } from './constants'

export interface SniffedImage {
  contentType: MediaContentType
  width: number
  height: number
}

function u16be(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 8) | bytes[at + 1]
}

function u32be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
}

function u24le(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)
}

function ascii(bytes: Uint8Array, at: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (bytes[at + i] !== text.charCodeAt(i)) return false
  }
  return true
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function sniffPng(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 24) return null
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return null
  // the first chunk must be IHDR with its fixed length of 13
  if (u32be(bytes, 8) !== 13 || !ascii(bytes, 12, 'IHDR')) return null
  const width = u32be(bytes, 16)
  const height = u32be(bytes, 20)
  return width > 0 && height > 0 ? { contentType: 'image/png', width, height } : null
}

/** Start-of-frame markers that carry the size (excludes DHT C4, JPG C8, DAC CC). */
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function sniffJpeg(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null
  let pos = 2
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) return null
    // skip fill bytes (0xFF repeated before a marker)
    while (pos < bytes.length && bytes[pos] === 0xff) pos++
    if (pos >= bytes.length) return null
    const marker = bytes[pos]
    pos++
    // standalone markers without a length: TEM, RSTn
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    // EOI or SOS before any frame header: no size in this file
    if (marker === 0xd9 || marker === 0xda) return null
    if (pos + 2 > bytes.length) return null
    const length = u16be(bytes, pos)
    if (length < 2) return null
    if (SOF_MARKERS.has(marker)) {
      // length(2), precision(1), height(2), width(2)
      if (pos + 7 > bytes.length) return null
      const height = u16be(bytes, pos + 3)
      const width = u16be(bytes, pos + 5)
      return width > 0 && height > 0 ? { contentType: 'image/jpeg', width, height } : null
    }
    pos += length
  }
  return null
}

function sniffWebp(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 25 || !ascii(bytes, 0, 'RIFF') || !ascii(bytes, 8, 'WEBP')) return null
  const chunk = ascii(bytes, 12, 'VP8 ') ? 'VP8' : ascii(bytes, 12, 'VP8L') ? 'VP8L' : ascii(bytes, 12, 'VP8X') ? 'VP8X' : null
  if (chunk === null) return null
  // lossy and extended headers reach byte 29; the lossless header ends at byte 24
  if (chunk !== 'VP8L' && bytes.length < 30) return null
  if (chunk === 'VP8') {
    // frame tag (3 bytes), start code 9d 01 2a, then 14-bit width and height (little endian)
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff
    return width > 0 && height > 0 ? { contentType: 'image/webp', width, height } : null
  }
  if (chunk === 'VP8L') {
    // signature byte 0x2f, then width-1 and height-1 as 14-bit fields packed little endian
    if (bytes[20] !== 0x2f) return null
    const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0
    const width = (bits & 0x3fff) + 1
    const height = ((bits >>> 14) & 0x3fff) + 1
    return { contentType: 'image/webp', width, height }
  }
  // VP8X: flags byte, then canvas width-1 and height-1 as 24-bit little endian. Animation (bit 0x02) is refused.
  if ((bytes[20] & 0x02) !== 0) return null
  return { contentType: 'image/webp', width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 }
}

/** The image type and size, or null when the bytes are not a PNG, JPEG or WebP image we accept. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  return sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes)
}
