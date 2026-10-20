import { deflateSync } from 'node:zlib'

/**
 * A valid 640x400 PNG built in memory: a gradient with a rectangle on it. `seed` changes the colour of the rectangle,
 * so every upload has its own sha256 (the server answers `reused` for a byte-identical file of the same owner).
 */
export function makeTestPng(seed: number): Buffer {
  const width = 640
  const height = 400
  const raw = Buffer.alloc((width * 3 + 1) * height)
  const rect = { x0: 200, x1: 440, y0: 120, y1: 280 }
  const tint = seed % 256
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    raw[row] = 0 // filter type: none
    for (let x = 0; x < width; x++) {
      const inRect = x >= rect.x0 && x < rect.x1 && y >= rect.y0 && y < rect.y1
      const offset = row + 1 + x * 3
      raw[offset] = inRect ? tint : Math.round((x * 255) / (width - 1))
      raw[offset + 1] = inRect ? 60 : Math.round((y * 255) / (height - 1))
      raw[offset + 2] = inRect ? 200 : 128
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0, 0)
  return Buffer.concat([length, body, crc])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
