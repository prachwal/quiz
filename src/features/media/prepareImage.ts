/**
 * Preparing a picked image for upload (Media-Storage-Plan M6): type check, downscaling to a 1600 px longer side,
 * WebP re-encoding and the 2 MB limit. The browser parts (canvas, image decoding, file reading) are injected through
 * `ImageDeps`, so the decisions are tested without a canvas. Messages are Polish and user-facing.
 */
import { MEDIA_CONTENT_TYPES, MEDIA_MAX_BYTES_DEFAULT, type MediaContentType } from '../../shared/media/upload'

/** The longer side after downscaling (larger images are scaled down, smaller ones are kept). */
export const MAX_EDGE_PX = 1600
/** Quality of the WebP re-encoding. */
export const WEBP_QUALITY = 0.85
/** Refused before reading: a picture this big would be slow to decode in the browser. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024

export const UNSUPPORTED_TYPE_MESSAGE = 'Ten format nie jest obsługiwany. Wybierz plik PNG, JPEG albo WebP (GIF i SVG nie są dozwolone).'
export const TOO_LARGE_MESSAGE = 'Obrazek jest za duży nawet po zmniejszeniu (limit 2 MB). Wybierz mniejszy plik albo obrazek o mniejszej rozdzielczości.'

export interface Dimensions {
  width: number
  height: number
}

export interface PreparedImage {
  bytes: Uint8Array
  contentType: MediaContentType
  /** Pixel size of the bytes when known (the server reads it from the bytes anyway). */
  width: number | null
  height: number | null
  reencoded: boolean
}

/** The browser parts. `measure` and `encodeWebp` answer null when this browser cannot do the job. */
export interface ImageDeps {
  readBytes(file: Blob): Promise<Uint8Array>
  measure(file: Blob): Promise<Dimensions | null>
  encodeWebp(file: Blob, target: Dimensions, quality: number): Promise<Uint8Array | null>
}

/** Type and size check of a picked file. Returns the Polish reason, or null when the file may be prepared. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!(MEDIA_CONTENT_TYPES as readonly string[]).includes(file.type)) return UNSUPPORTED_TYPE_MESSAGE
  if (file.size === 0) return 'Plik jest pusty.'
  if (file.size > MAX_INPUT_BYTES) return `Plik jest za duży (maks. ${MAX_INPUT_BYTES / (1024 * 1024)} MB przed zmniejszeniem).`
  return null
}

/** The size after downscaling so that the longer side is at most `max`; smaller images keep their size. */
export function resizeTarget(width: number, height: number, max: number = MAX_EDGE_PX): Dimensions {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const longest = Math.max(w, h)
  if (longest <= max) return { width: w, height: h }
  const scale = max / longest
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/** SHA-256 of the bytes as 64 lowercase hex characters (the server compares the hash of the stored bytes). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('Ta przeglądarka nie udostępnia SHA-256 (wysyłanie obrazów wymaga HTTPS).')
  const digest = await subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * The bytes to upload. Decides the candidates and picks the first one that fits the limit, in this order: the WebP
 * re-encoding (when the picture is larger than MAX_EDGE_PX or is not WebP), then the original file. The original is
 * the fallback when the browser cannot decode or encode; the result is refused when nothing fits the limit.
 */
export async function prepareImage(file: Blob & { type: string; size: number }, deps: ImageDeps = browserImageDeps): Promise<PreparedImage> {
  const problem = validateImageFile(file)
  if (problem) throw new Error(problem)

  const original = await deps.readBytes(file)
  const originalType = file.type as MediaContentType
  const dims = await deps.measure(file)
  const candidates: PreparedImage[] = []

  if (dims === null) {
    candidates.push({ bytes: original, contentType: originalType, width: null, height: null, reencoded: false })
  } else {
    const target = resizeTarget(dims.width, dims.height)
    const needsEncode = target.width !== dims.width || target.height !== dims.height || originalType !== 'image/webp'
    if (needsEncode) {
      const encoded = await deps.encodeWebp(file, target, WEBP_QUALITY)
      if (encoded) candidates.push({ bytes: encoded, contentType: 'image/webp', width: target.width, height: target.height, reencoded: true })
    }
    candidates.push({ bytes: original, contentType: originalType, width: dims.width, height: dims.height, reencoded: false })
  }

  const fitting = candidates.find((candidate) => candidate.bytes.byteLength > 0 && candidate.bytes.byteLength <= MEDIA_MAX_BYTES_DEFAULT)
  if (!fitting) throw new Error(TOO_LARGE_MESSAGE)
  return fitting
}

/** Bytes of a blob. FileReader is the fallback for environments without Blob.arrayBuffer. */
export function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error ?? new Error('Nie udało się odczytać pliku.'))
    reader.readAsArrayBuffer(blob)
  })
}

/** The real browser: createImageBitmap for the size, a canvas for the WebP encoding. */
export const browserImageDeps: ImageDeps = {
  readBytes: readBlobBytes,
  async measure(file) {
    if (typeof createImageBitmap !== 'function') return null
    try {
      const bitmap = await createImageBitmap(file)
      const dims = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return dims
    } catch {
      return null
    }
  },
  async encodeWebp(file, target, quality) {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      return null
    }
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return null
    }
    context.drawImage(bitmap, 0, 0, target.width, target.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
    // some browsers silently return PNG when WebP is not supported; then the original file is used
    if (!blob || blob.type !== 'image/webp') return null
    return readBlobBytes(blob)
  },
}
