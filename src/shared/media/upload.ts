/**
 * Browser upload contract (Media-Storage-Plan, "Przepływy wysyłania" A): the limits and content types shared by the
 * server routes (`server/media/routes.ts`) and the quiz editor (`src/features/media/`). Pure: zod and constants only.
 */
import { z } from 'zod'

/** D9: per-file limit in bytes; the server reads MEDIA_MAX_BYTES and falls back to this value. */
export const MEDIA_MAX_BYTES_DEFAULT = 2 * 1024 * 1024

/** The only content types the server stores (D8). GIF and SVG are refused. */
export const MEDIA_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type MediaContentType = (typeof MEDIA_CONTENT_TYPES)[number]

/** The alt text of the image syntax `![alt](media:<uuid>)` (1-200 characters). */
export const MEDIA_ALT_MAX_LENGTH = 200

/** `POST /api/media/uploads`. `size` is checked against the configured maximum by the server (400 when larger). */
export const mediaUploadStartInput = z.object({
  contentType: z.enum(MEDIA_CONTENT_TYPES),
  size: z.number().int().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex characters'),
  alt: z.string().max(MEDIA_ALT_MAX_LENGTH).optional(),
})
export type MediaUploadStartInput = z.infer<typeof mediaUploadStartInput>

/** Answer of `POST /api/media/uploads`: either the file already exists (`reused`) or the client must PUT the bytes. */
export interface MediaUploadStarted {
  mediaId: string
  reused: boolean
  status: 'pending' | 'ready'
  /** Present when the file is ready (reused). */
  url?: string
  width?: number | null
  height?: number | null
  /** Present when the bytes must be sent: a PUT with exactly these headers. */
  upload?: { url: string; method: 'PUT'; headers: Record<string, string> }
}

/** Answer of `POST /api/media/:id/complete`. The markdown is built by the client (the alt text is not stored). */
export interface MediaUploadCompleted {
  mediaId: string
  url: string
  width: number | null
  height: number | null
  size: number
}
