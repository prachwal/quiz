/**
 * Pure checks of the upload tools (Media-Storage-Plan, "Przepływy wysyłania" B-D and "Limity nadużyć"): input
 * decoding, the alt text, the size and type rules, the completion check and the hourly URL limit. No database,
 * no storage, no network; the impure steps live in service.ts. Polish messages are user-facing.
 */
import { createHash } from 'node:crypto'
import { MEDIA_URL_FETCHES_PER_HOUR } from './constants'
import { sniffImage, type SniffedImage } from './sniff'

export type Checked<T> = { ok: true; value: T } | { ok: false; reason: string }

/** The alt text limit is the one of the image syntax (`![alt](media:…)`, 1–200 characters). */
export const ALT_MAX_LENGTH = 200

export const NOT_SUPPORTED_TYPE = 'Nieobsługiwany format pliku. Przyjmujemy tylko PNG, JPEG i WebP (GIF i SVG nie są dozwolone).'
export const DAILY_LIMIT_REASON = 'Dzienny limit wysyłania obrazów został wykorzystany (100 plików albo 50 MB na dobę). Spróbuj jutro.'

/** The alt text: trimmed, 1–200 characters, and without `]` or line breaks (they would break the image syntax). */
export function validateAlt(raw: string): Checked<string> {
  const alt = raw.trim()
  if (alt === '') return { ok: false, reason: 'Opis obrazka (alt) jest wymagany - krótko opisz, co widać.' }
  if (alt.length > ALT_MAX_LENGTH) return { ok: false, reason: `Opis obrazka (alt) może mieć najwyżej ${ALT_MAX_LENGTH} znaków.` }
  if (/[\]\r\n]/.test(alt)) return { ok: false, reason: 'Opis obrazka (alt) nie może zawierać znaku "]" ani znaku nowej linii.' }
  return { ok: true, value: alt }
}

/** The text to paste into a question, option or explanation (Media-Storage-Plan D2). */
export const mediaMarkdown = (alt: string, mediaId: string): string => `![${alt}](media:${mediaId})`

const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * Decodes the base64 argument of `media_upload`. Whitespace is ignored and a `data:…;base64,` prefix is removed.
 * The decoded size is computed before decoding, so an oversized argument is refused without allocating it.
 */
export function decodeBase64Image(data: string, maxBytes: number): Checked<Uint8Array> {
  const stripped = data.replace(/^data:[^;,]*;base64,/i, '').replace(/\s+/g, '')
  if (stripped === '' || stripped.length % 4 !== 0 || !BASE64_BODY.test(stripped)) {
    return { ok: false, reason: 'Dane nie są poprawnym base64 (sam ciąg znaków, bez nagłówka danych ani podziału na części).' }
  }
  const padding = stripped.endsWith('==') ? 2 : stripped.endsWith('=') ? 1 : 0
  const decodedLength = (stripped.length / 4) * 3 - padding
  if (decodedLength > maxBytes) {
    return { ok: false, reason: `Obraz jest za duży (maks. ${maxBytes} bajtów po zdekodowaniu). Większe pliki wyślij przez media_upload_from_url albo media_create_upload.` }
  }
  return { ok: true, value: new Uint8Array(Buffer.from(stripped, 'base64')) }
}

/** Size rule for bytes in hand: at least one byte and at most the configured maximum. */
export function checkSize(size: number, maxBytes: number): Checked<number> {
  if (!Number.isInteger(size) || size < 1) return { ok: false, reason: 'Rozmiar pliku musi być dodatnią liczbą bajtów.' }
  if (size > maxBytes) return { ok: false, reason: `Plik jest za duży (${size} bajtów, maks. ${maxBytes}).` }
  return { ok: true, value: size }
}

/** Size and type from the bytes. The declared type never decides: only the first bytes do. */
export function sniffUpload(bytes: Uint8Array, maxBytes: number): Checked<SniffedImage> {
  const size = checkSize(bytes.byteLength, maxBytes)
  if (!size.ok) return size
  const image = sniffImage(bytes)
  if (!image) return { ok: false, reason: NOT_SUPPORTED_TYPE }
  return { ok: true, value: image }
}

export const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/**
 * The check of `media_complete`: the bytes read back from storage must have the declared size and hash, and their
 * type must be the declared one. Returns the pixel size on success.
 */
export function verifyCompletion(input: {
  declaredSize: number
  declaredSha: string
  declaredType: string
  bytes: Uint8Array
}): Checked<{ width: number; height: number }> {
  if (input.bytes.byteLength !== input.declaredSize) {
    return { ok: false, reason: `Rozmiar pliku w magazynie (${input.bytes.byteLength} B) nie zgadza się z zadeklarowanym (${input.declaredSize} B).` }
  }
  if (sha256Of(input.bytes) !== input.declaredSha) {
    return { ok: false, reason: 'Skrót SHA-256 pliku w magazynie nie zgadza się z zadeklarowanym.' }
  }
  const image = sniffImage(input.bytes)
  if (!image) return { ok: false, reason: NOT_SUPPORTED_TYPE }
  if (image.contentType !== input.declaredType) {
    return { ok: false, reason: `Plik jest typu ${image.contentType}, a zadeklarowano ${input.declaredType}.` }
  }
  return { ok: true, value: { width: image.width, height: image.height } }
}

/** `media_upload_from_url`: fewer than the hourly number of successful fetches so far. */
export const urlFetchAllowed = (fetchesLastHour: number): boolean => fetchesLastHour < MEDIA_URL_FETCHES_PER_HOUR

export const URL_FETCH_LIMIT_REASON = `Limit pobrań z adresu URL wykorzystany (${MEDIA_URL_FETCHES_PER_HOUR} na godzinę). Spróbuj później albo wyślij obraz inaczej.`

/** The gate of `media_upload_from_url` (MEDIA_URL_FETCH). */
export const URL_FETCH_DISABLED_REASON =
  'Pobieranie obrazów z adresu URL jest wyłączone na tym serwerze (MEDIA_URL_FETCH). Wyślij obraz przez media_upload (małe pliki, base64) albo media_create_upload (PUT na podany adres).'

/**
 * Same-origin PUT target of the memory driver (dev and tests): the browser cannot PUT to `memory://`, so the upload
 * goes to the API itself (`PUT /api/media/<id>/content`, see routes.ts). Production (s3) gets the presigned URL.
 */
export const memoryContentPath = (mediaId: string): string => `/api/media/${mediaId}/content`

export const uploadTargetUrl = (memory: boolean, mediaId: string, presignedUrl: string): string =>
  memory ? memoryContentPath(mediaId) : presignedUrl
