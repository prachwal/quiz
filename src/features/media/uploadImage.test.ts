import { describe, expect, it, vi } from 'vitest'
import type { MediaUploadCompleted, MediaUploadStarted } from '../../shared/media/upload'
import type { PreparedImage } from './prepareImage'
import { imageMarkdown, uploadImage, validateAltText, type UploadDeps } from './uploadImage'
import { selectionOf } from './markdownInsert'

const prepared: PreparedImage = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/webp', width: 800, height: 450, reencoded: true }
const picked = new File([new Uint8Array(3)], 'kot.png', { type: 'image/png' })

function fakeDeps(started: MediaUploadStarted, completed?: MediaUploadCompleted) {
  const deps = {
    prepare: vi.fn(async () => prepared),
    sha256: vi.fn(async () => 'f'.repeat(64)),
    createUpload: vi.fn(async () => started),
    put: vi.fn(async () => undefined),
    complete: vi.fn(async () => completed ?? { mediaId: started.mediaId, url: 'https://media.test/x.webp', width: 800, height: 450, size: 3 }),
  }
  return { deps: deps as UploadDeps & typeof deps, ...deps }
}

describe('validateAltText', () => {
  it('trims and accepts 1-200 characters', () => {
    expect(validateAltText('  Kwadrat  ')).toEqual({ ok: true, value: 'Kwadrat' })
    expect(validateAltText('x'.repeat(200))).toMatchObject({ ok: true })
  })

  it('refuses an empty alt, one over 200 characters, a bracket and a line break', () => {
    expect(validateAltText('   ')).toMatchObject({ ok: false, reason: expect.stringContaining('jest wymagany') })
    expect(validateAltText('x'.repeat(201))).toMatchObject({ ok: false, reason: expect.stringContaining('200 znaków') })
    expect(validateAltText('a]b')).toMatchObject({ ok: false, reason: expect.stringContaining('"]"') })
    expect(validateAltText('a\nb')).toMatchObject({ ok: false, reason: expect.stringContaining('nowej linii') })
  })
})

describe('imageMarkdown', () => {
  it('is the image syntax of the server', () => {
    expect(imageMarkdown('Kwadrat', '0b6f1c2e-7d1a-4c55-9f3e-2a1b3c4d5e6f')).toBe('![Kwadrat](media:0b6f1c2e-7d1a-4c55-9f3e-2a1b3c4d5e6f)')
  })
})

describe('uploadImage', () => {
  const uploaded: MediaUploadStarted = {
    mediaId: 'id-1',
    reused: false,
    status: 'pending',
    upload: { url: '/api/media/id-1/content', method: 'PUT', headers: { 'Content-Type': 'image/webp' } },
  }

  it('prepares, hashes, starts, sends the bytes, completes and returns the markdown and preview data', async () => {
    const fake = fakeDeps(uploaded)
    const result = await uploadImage({ file: picked, alt: ' Kwadrat ' }, fake.deps)
    expect(fake.prepare).toHaveBeenCalledWith(picked)
    expect(fake.sha256).toHaveBeenCalledWith(prepared.bytes)
    expect(fake.createUpload).toHaveBeenCalledWith({ contentType: 'image/webp', size: 3, sha256: 'f'.repeat(64), alt: 'Kwadrat' })
    expect(fake.put).toHaveBeenCalledWith(uploaded.upload, prepared.bytes)
    expect(fake.complete).toHaveBeenCalledWith('id-1')
    expect(result).toEqual({
      markdown: '![Kwadrat](media:id-1)',
      mediaId: 'id-1',
      info: { url: 'https://media.test/x.webp', width: 800, height: 450 },
    })
  })

  it('uses an existing copy as it is: no PUT and no complete', async () => {
    const fake = fakeDeps({
      mediaId: 'id-2',
      reused: true,
      status: 'ready',
      url: 'https://media.test/old.png',
      width: 10,
      height: 20,
    })
    const result = await uploadImage({ file: picked, alt: 'Stary' }, fake.deps)
    expect(fake.put).not.toHaveBeenCalled()
    expect(fake.complete).not.toHaveBeenCalled()
    expect(result).toEqual({ markdown: '![Stary](media:id-2)', mediaId: 'id-2', info: { url: 'https://media.test/old.png', width: 10, height: 20 } })
  })

  it('refuses a blank alt before anything is sent', async () => {
    const fake = fakeDeps(uploaded)
    await expect(uploadImage({ file: picked, alt: '' }, fake.deps)).rejects.toThrow('jest wymagany')
    expect(fake.prepare).not.toHaveBeenCalled()
    expect(fake.createUpload).not.toHaveBeenCalled()
  })

  it('stops at the first failure: a refused start means no bytes are sent', async () => {
    const fake = fakeDeps(uploaded)
    fake.createUpload.mockRejectedValueOnce(new Error('Plik jest za duży'))
    await expect(uploadImage({ file: picked, alt: 'x' }, fake.deps)).rejects.toThrow('Plik jest za duży')
    expect(fake.put).not.toHaveBeenCalled()
  })

  it('does not complete when the bytes were not sent', async () => {
    const fake = fakeDeps(uploaded)
    fake.put.mockRejectedValueOnce(new Error('sieć'))
    await expect(uploadImage({ file: picked, alt: 'x' }, fake.deps)).rejects.toThrow('sieć')
    expect(fake.complete).not.toHaveBeenCalled()
  })

  it('reports a server that did not offer an upload target', async () => {
    const fake = fakeDeps({ mediaId: 'id-3', reused: false, status: 'pending' })
    await expect(uploadImage({ file: picked, alt: 'x' }, fake.deps)).rejects.toThrow('nie przygotował wysyłki')
  })
})

describe('selectionOf', () => {
  it('reads the selection of a text element and is null without one', () => {
    expect(selectionOf({ selectionStart: 2, selectionEnd: 5 })).toEqual({ start: 2, end: 5 })
    expect(selectionOf(null)).toBeNull()
    expect(selectionOf({ selectionStart: null, selectionEnd: null })).toBeNull()
  })
})
