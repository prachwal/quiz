/**
 * The upload flow of the editor (Media-Storage-Plan, "Przepływy wysyłania" A): prepare -> hash -> start -> PUT ->
 * complete -> the markdown to insert. Pure orchestration: every network and browser step is injected, so the flow is
 * tested with fakes. The alt text is sent with the start (the server checks it) and is never stored.
 */
import type { MediaInfo } from '../../shared/media/types'
import { MEDIA_ALT_MAX_LENGTH, type MediaUploadCompleted, type MediaUploadStarted, type MediaUploadStartInput } from '../../shared/media/upload'
import type { MediaUploadTarget } from './api'
import type { PreparedImage } from './prepareImage'

export type AltCheck = { ok: true; value: string } | { ok: false; reason: string }

/** The alt text rules of the image syntax, the same as the server's (`validateAlt`): 1-200 characters, no `]` or line breaks. */
export function validateAltText(raw: string): AltCheck {
  const alt = raw.trim()
  if (alt === '') return { ok: false, reason: 'Opis obrazka (alt) jest wymagany - krótko opisz, co widać.' }
  if (alt.length > MEDIA_ALT_MAX_LENGTH) return { ok: false, reason: `Opis obrazka (alt) może mieć najwyżej ${MEDIA_ALT_MAX_LENGTH} znaków.` }
  if (/[\]\r\n]/.test(alt)) return { ok: false, reason: 'Opis obrazka (alt) nie może zawierać znaku "]" ani znaku nowej linii.' }
  return { ok: true, value: alt }
}

/** The text that goes into a question, option or explanation (Media-Storage-Plan D2). */
export const imageMarkdown = (alt: string, mediaId: string): string => `![${alt}](media:${mediaId})`

export interface InsertedImage {
  /** `![alt](media:<uuid>)`, ready to be inserted. */
  markdown: string
  mediaId: string
  /** The address and size, so the editor can preview the image at once. */
  info: MediaInfo
}

export interface UploadDeps {
  prepare: (file: File) => Promise<PreparedImage>
  sha256: (bytes: Uint8Array) => Promise<string>
  createUpload: (input: MediaUploadStartInput) => Promise<MediaUploadStarted>
  put: (target: MediaUploadTarget, bytes: Uint8Array) => Promise<void>
  complete: (mediaId: string) => Promise<MediaUploadCompleted>
}

/**
 * Uploads one picked file and returns what to insert. An author's copy that already exists (`reused`) is used as it
 * is: no PUT and no complete. Errors propagate with their message (the dialog shows them).
 */
export async function uploadImage(input: { file: File; alt: string }, deps: UploadDeps): Promise<InsertedImage> {
  const alt = validateAltText(input.alt)
  if (!alt.ok) throw new Error(alt.reason)

  const prepared = await deps.prepare(input.file)
  const sha256 = await deps.sha256(prepared.bytes)
  const started = await deps.createUpload({
    contentType: prepared.contentType,
    size: prepared.bytes.byteLength,
    sha256,
    alt: alt.value,
  })

  let ready: { mediaId: string; url: string; width: number | null; height: number | null }
  if (started.reused) {
    if (!started.url) throw new Error('Serwer nie podał adresu istniejącego obrazka.')
    ready = { mediaId: started.mediaId, url: started.url, width: started.width ?? null, height: started.height ?? null }
  } else {
    if (!started.upload) throw new Error('Serwer nie przygotował wysyłki obrazka.')
    await deps.put(started.upload, prepared.bytes)
    const done = await deps.complete(started.mediaId)
    ready = { mediaId: done.mediaId, url: done.url, width: done.width, height: done.height }
  }

  return {
    markdown: imageMarkdown(alt.value, ready.mediaId),
    mediaId: ready.mediaId,
    info: { url: ready.url, width: ready.width, height: ready.height },
  }
}
