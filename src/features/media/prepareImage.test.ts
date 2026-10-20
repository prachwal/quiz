import { describe, expect, it, vi } from 'vitest'
import { MEDIA_MAX_BYTES_DEFAULT } from '../../shared/media/upload'
import {
  MAX_INPUT_BYTES,
  TOO_LARGE_MESSAGE,
  UNSUPPORTED_TYPE_MESSAGE,
  WEBP_QUALITY,
  prepareImage,
  resizeTarget,
  sha256Hex,
  validateImageFile,
  type ImageDeps,
} from './prepareImage'

const file = (type: string, size: number) => new File([new Uint8Array(size)], 'picture.bin', { type })

/** Fake browser parts: `bytes` are what the file reads as, `dims` what it measures, `encoded` what the encoder returns. */
function fakeDeps(options: { dims?: { width: number; height: number } | null; encoded?: Uint8Array | null; bytes?: Uint8Array } = {}) {
  const encodeWebp = vi.fn(async () => options.encoded ?? null)
  const deps: ImageDeps = {
    readBytes: async () => options.bytes ?? new Uint8Array([1, 2, 3]),
    measure: async () => (options.dims === undefined ? { width: 800, height: 600 } : options.dims),
    encodeWebp,
  }
  return { deps, encodeWebp }
}

describe('validateImageFile', () => {
  it('accepts PNG, JPEG and WebP', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(validateImageFile({ type, size: 10 })).toBeNull()
  })

  it('refuses GIF and SVG with the Polish message', () => {
    expect(validateImageFile({ type: 'image/gif', size: 10 })).toBe(UNSUPPORTED_TYPE_MESSAGE)
    expect(validateImageFile({ type: 'image/svg+xml', size: 10 })).toBe(UNSUPPORTED_TYPE_MESSAGE)
    expect(UNSUPPORTED_TYPE_MESSAGE).toContain('GIF i SVG')
  })

  it('refuses an empty file and one above the input limit', () => {
    expect(validateImageFile({ type: 'image/png', size: 0 })).toBe('Plik jest pusty.')
    expect(validateImageFile({ type: 'image/png', size: MAX_INPUT_BYTES + 1 })).toContain('za duży')
  })
})

describe('resizeTarget', () => {
  it('keeps an image whose longer side is within the limit', () => {
    expect(resizeTarget(800, 600)).toEqual({ width: 800, height: 600 })
    expect(resizeTarget(1600, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('scales the longer side down to 1600 and keeps the aspect ratio', () => {
    expect(resizeTarget(3200, 1600)).toEqual({ width: 1600, height: 800 })
    expect(resizeTarget(1000, 4000)).toEqual({ width: 400, height: 1600 })
  })

  it('never returns a zero size', () => {
    expect(resizeTarget(1, 1)).toEqual({ width: 1, height: 1 })
    expect(resizeTarget(10000, 1, 100)).toEqual({ width: 100, height: 1 })
  })
})

describe('sha256Hex', () => {
  it('is the SHA-256 of the bytes as 64 lowercase hex characters', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('prepareImage', () => {
  it('keeps a small WebP as it is (no encoding)', async () => {
    const { deps, encodeWebp } = fakeDeps({ dims: { width: 800, height: 600 }, bytes: new Uint8Array([9, 9]) })
    const prepared = await prepareImage(file('image/webp', 2), deps)
    expect(prepared).toEqual({ bytes: new Uint8Array([9, 9]), contentType: 'image/webp', width: 800, height: 600, reencoded: false })
    expect(encodeWebp).not.toHaveBeenCalled()
  })

  it('re-encodes a PNG to WebP at its size, with quality 0.85', async () => {
    const { deps, encodeWebp } = fakeDeps({ dims: { width: 800, height: 600 }, encoded: new Uint8Array([7, 7, 7]) })
    const prepared = await prepareImage(file('image/png', 5), deps)
    expect(encodeWebp).toHaveBeenCalledWith(expect.any(File), { width: 800, height: 600 }, WEBP_QUALITY)
    expect(prepared).toMatchObject({ contentType: 'image/webp', width: 800, height: 600, reencoded: true })
    expect(prepared.bytes).toEqual(new Uint8Array([7, 7, 7]))
  })

  it('downscales a large WebP to a 1600 px longer side when encoding', async () => {
    const { deps, encodeWebp } = fakeDeps({ dims: { width: 3200, height: 1600 }, encoded: new Uint8Array([1]) })
    const prepared = await prepareImage(file('image/webp', 5), deps)
    expect(encodeWebp).toHaveBeenCalledWith(expect.any(File), { width: 1600, height: 800 }, WEBP_QUALITY)
    expect(prepared).toMatchObject({ width: 1600, height: 800, reencoded: true })
  })

  it('falls back to the original bytes when the browser cannot encode', async () => {
    const { deps } = fakeDeps({ dims: { width: 800, height: 600 }, encoded: null, bytes: new Uint8Array([4, 4]) })
    const prepared = await prepareImage(file('image/png', 2), deps)
    expect(prepared).toEqual({ bytes: new Uint8Array([4, 4]), contentType: 'image/png', width: 800, height: 600, reencoded: false })
  })

  it('falls back to the original bytes when the browser cannot measure the picture', async () => {
    const { deps, encodeWebp } = fakeDeps({ dims: null, bytes: new Uint8Array([5]) })
    const prepared = await prepareImage(file('image/jpeg', 1), deps)
    expect(prepared).toEqual({ bytes: new Uint8Array([5]), contentType: 'image/jpeg', width: null, height: null, reencoded: false })
    expect(encodeWebp).not.toHaveBeenCalled()
  })

  it('uses the original when the WebP result is above 2 MB but the original fits', async () => {
    const big = new Uint8Array(MEDIA_MAX_BYTES_DEFAULT + 1)
    const { deps } = fakeDeps({ dims: { width: 800, height: 600 }, encoded: big, bytes: new Uint8Array([8]) })
    const prepared = await prepareImage(file('image/png', 2), deps)
    expect(prepared).toMatchObject({ contentType: 'image/png', reencoded: false })
  })

  it('refuses when neither the WebP nor the original fits the 2 MB limit', async () => {
    const original = new Uint8Array(MEDIA_MAX_BYTES_DEFAULT + 1)
    const { deps } = fakeDeps({ dims: { width: 800, height: 600 }, encoded: new Uint8Array(MEDIA_MAX_BYTES_DEFAULT + 1), bytes: original })
    await expect(prepareImage(file('image/png', 2), deps)).rejects.toThrow(TOO_LARGE_MESSAGE)
  })

  it('refuses an unsupported file before reading it', async () => {
    const { deps } = fakeDeps()
    const readBytes = vi.spyOn(deps, 'readBytes')
    await expect(prepareImage(file('image/gif', 2), deps)).rejects.toThrow(UNSUPPORTED_TYPE_MESSAGE)
    expect(readBytes).not.toHaveBeenCalled()
  })
})
