/** Constants of the media module. Content types and the default size limit come from the shared upload contract. */
import { MEDIA_MAX_BYTES_DEFAULT } from '../../src/shared/media/upload'

export { MEDIA_CONTENT_TYPES, type MediaContentType } from '../../src/shared/media/upload'

/** Who created the file; mirrored by the CHECK constraint in the media migration. */
export const MEDIA_SOURCES = ['browser', 'mcp-base64', 'mcp-url', 'mcp-presigned', 'script'] as const
export type MediaSource = (typeof MEDIA_SOURCES)[number]

/** Owner kinds that may reference a media file (mirrored by the CHECK constraint in media_refs). */
export const MEDIA_OWNER_KINDS = ['quiz', 'lesson', 'verb'] as const
export type MediaOwnerKind = (typeof MEDIA_OWNER_KINDS)[number]

/** Per-author daily limits (Media-Storage-Plan, "Limity nadużyć"). Constants, not secrets. */
export const MEDIA_DAILY_FILES = 100
export const MEDIA_DAILY_BYTES = 50 * 1024 * 1024

/** D9: default per-file limit, overridable with MEDIA_MAX_BYTES. */
export const MEDIA_DEFAULT_MAX_BYTES = MEDIA_MAX_BYTES_DEFAULT

/** Presigned URLs: S3 accepts at most seven days. */
export const MEDIA_PRESIGN_MAX_SECONDS = 7 * 24 * 60 * 60

/** Object keys are immutable (a new upload is a new key), so browsers and CDNs may cache them forever. */
export const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/** Public base used by the memory driver when MEDIA_PUBLIC_BASE_URL is not set. */
export const MEDIA_MEMORY_DEFAULT_BASE_URL = 'https://media.test'

/** `media_upload_from_url`: successful fetches per author in the last hour (Media-Storage-Plan, "Limity nadużyć"). */
export const MEDIA_URL_FETCHES_PER_HOUR = 20

/** Presigned PUT lifetime for `media_create_upload` (the client should upload right away). */
export const MEDIA_PRESIGN_SECONDS = 15 * 60
