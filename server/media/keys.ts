/** Pure helpers for object keys. No imports: the key is built only from the content type and random ids. */
import { MEDIA_CONTENT_TYPES, type MediaContentType } from './constants'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** Segments start with a letter, digit, `_` or `-`, so `.` and `..` can never appear as a path segment. */
const PREFIX = /^([A-Za-z0-9_-][A-Za-z0-9_.-]*\/)+$/

const EXTENSIONS: Record<MediaContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** Extension for a stored content type. Throws for anything outside the allowlist. */
export function extensionFor(contentType: string): string {
  if (!(MEDIA_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new Error(`Unsupported media content type: ${contentType}`)
  }
  return EXTENSIONS[contentType as MediaContentType]
}

/**
 * Normalises `S3_KEY_PREFIX`: empty stays empty, otherwise the value must end with `/` (added when missing)
 * and contain only safe segments. Throws with a message naming the variable when the value is unsafe.
 */
export function normalizeKeyPrefix(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  const withSlash = trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  if (!PREFIX.test(withSlash)) {
    throw new Error('S3_KEY_PREFIX may contain only letters, digits, "_", "-", "." and "/" (no leading "/", no "..")')
  }
  return withSlash
}

/** `<prefix>media/<year>/<uuid>.<ext>`; the uuid must be a lowercase v4-style uuid chosen by the server. */
export function mediaKey(prefix: string, year: number, uuid: string, contentType: string): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error('mediaKey: year out of range')
  if (!UUID.test(uuid)) throw new Error('mediaKey: uuid must be a lowercase uuid')
  return `${normalizeKeyPrefix(prefix)}media/${year}/${uuid}.${extensionFor(contentType)}`
}
