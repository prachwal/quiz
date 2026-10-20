/**
 * Browser upload routes (Media-Storage-Plan M6, "Przepływy wysyłania" A). Mounted in server/app.ts behind the normal
 * authentication; every route needs `write:quizzes`.
 *
 *   POST /media/uploads          start: reuse the author's ready copy, or a pending row and the PUT target
 *   PUT  /media/:id/content      memory driver only (404 otherwise): the bytes, for dev and tests
 *   POST /media/:id/complete     check the stored object and mark it ready (or remove it when it does not match)
 *
 * Storage is touched only by these handlers, and only when they are called: a request without an image never
 * reaches it. The impure work lives in service.ts, the same code the MCP tools use.
 *
 * The memory-driver PUT route is for development and tests. Raw bodies through the Vercel serverless adapter are
 * not verified; production uses the presigned S3 URL, so this route is not part of the production surface.
 */
import express from 'express'
import type { Router, RequestHandler } from 'express'
import { mediaUploadStartInput, type MediaUploadCompleted, type MediaUploadStarted, MEDIA_CONTENT_TYPES } from '../../src/shared/media/upload'
import { writeAudit } from '../adminRepo'
import { hasPermission, MANAGE_USERS, requirePermission, WRITE_QUIZZES } from '../auth'
import { HttpError, idParam, userOf } from '../http'
import { isMemoryDriver, resolveMediaConfig } from './config'
import type { MediaRow } from './repo'
import { beginUpload, completeUpload, type Completion, MediaRequestError, mediaRuntime, type MediaRuntime, ownedMedia, urlOf } from './service'
import { validateAlt, uploadTargetUrl } from './uploads'

const writer = requirePermission(WRITE_QUIZZES)

/** Runs a media action; a refusal becomes an HttpError with the refusal's status and Polish message. */
async function refusing<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof MediaRequestError) throw new HttpError(error.status, error.message)
    throw error
  }
}

/** Audit details: the id, size, source and a short hash (never the bytes). */
function auditUpload(actor: string, row: MediaRow, outcome: 'ready' | 'rejected', reason?: string) {
  return writeAudit({
    actorId: actor,
    actorLabel: null,
    action: 'media.upload',
    targetId: row.id,
    targetLabel: 'obraz',
    details: {
      mediaId: row.id,
      size: row.sizeBytes,
      source: 'browser',
      sha256: row.sha256.slice(0, 12),
      outcome,
      ...(reason === undefined ? {} : { reason }),
    },
  })
}

const readyAnswer = (runtime: MediaRuntime, row: MediaRow, reused: boolean): MediaUploadStarted => ({
  mediaId: row.id,
  reused,
  status: 'ready',
  url: urlOf(runtime, row),
  width: row.width,
  height: row.height,
})

/** Only on the memory driver: the route does not exist (404) when storage is S3, so production surface does not grow. */
const memoryOnly: RequestHandler = (_req, _res, next) => {
  if (isMemoryDriver(process.env)) next()
  else next(new HttpError(404, 'Not found'))
}

/**
 * Raw image bytes for the memory-driver PUT: the content types of the upload contract, limit MEDIA_MAX_BYTES.
 * Body-parser errors (too large, bad encoding) become 400 with a Polish message; the global JSON parser ignores
 * these content types, so this parser is the only one that reads the body.
 */
const rawImage: RequestHandler = (req, res, next) => {
  const { maxBytes } = resolveMediaConfig(process.env)
  express.raw({ type: [...MEDIA_CONTENT_TYPES], limit: maxBytes })(req, res, (error?: unknown) => {
    if (!error) return next()
    const status = (error as { status?: number }).status
    if (typeof status === 'number' && status < 500) {
      return next(new HttpError(400, `Nie udało się odczytać bajtów pliku. Wyślij PNG, JPEG albo WebP, najwyżej ${maxBytes} B.`))
    }
    return next(error)
  })
}

export function registerMediaRoutes(router: Router) {
  router.post('/media/uploads', writer, async (req, res) => {
    const input = mediaUploadStartInput.parse(req.body ?? {})
    if (input.alt !== undefined) {
      const alt = validateAlt(input.alt)
      if (!alt.ok) throw new HttpError(400, alt.reason)
    }
    const answer = await refusing(async (): Promise<MediaUploadStarted> => {
      const runtime = mediaRuntime()
      const started = await beginUpload(runtime, {
        ownerId: userOf(req),
        contentType: input.contentType,
        size: input.size,
        sha256: input.sha256,
        source: 'browser',
      })
      if (started.kind === 'reused') return readyAnswer(runtime, started.row, true)
      return {
        mediaId: started.row.id,
        reused: false,
        status: 'pending',
        upload: {
          url: uploadTargetUrl(isMemoryDriver(process.env), started.row.id, started.uploadUrl),
          method: 'PUT',
          headers: started.headers,
        },
      }
    })
    res.json(answer)
  })

  router.put('/media/:id/content', memoryOnly, writer, rawImage, async (req, res) => {
    const id = idParam(req.params.id)
    const bytes = req.body
    await refusing(async () => {
      const runtime = mediaRuntime()
      const row = await ownedMedia(id, userOf(req), hasPermission(req, MANAGE_USERS))
      if (row.status !== 'pending') throw new MediaRequestError('Ten plik jest już wysłany.', 409)
      if (!Buffer.isBuffer(bytes) || bytes.byteLength === 0) {
        throw new MediaRequestError('Wyślij bajty obrazu z nagłówkiem Content-Type: image/png, image/jpeg albo image/webp.')
      }
      if (bytes.byteLength !== row.sizeBytes) {
        throw new MediaRequestError(`Rozmiar wysłanych bajtów (${bytes.byteLength} B) nie zgadza się z zadeklarowanym (${row.sizeBytes} B).`)
      }
      await runtime.storage.put(row.key, new Uint8Array(bytes), { contentType: row.contentType })
    })
    res.json({ ok: true })
  })

  router.post('/media/:id/complete', writer, async (req, res) => {
    const id = idParam(req.params.id)
    const actor = userOf(req)
    const isAdmin = hasPermission(req, MANAGE_USERS)
    // a file of another author is "not found" and is not audited (nothing about it was done)
    const before = await refusing(() => ownedMedia(id, actor, isAdmin))
    const runtime = await refusing(async () => mediaRuntime())
    let completion: Completion
    try {
      completion = await refusing(() => completeUpload(runtime, { id, userId: actor, isAdmin }))
    } catch (error) {
      if (error instanceof HttpError) await auditUpload(actor, before, 'rejected', error.message)
      throw error
    }
    if (completion.kind === 'rejected') {
      await auditUpload(actor, before, 'rejected', completion.reason)
      throw new HttpError(400, completion.reason)
    }
    await auditUpload(actor, completion.row, 'ready')
    const done: MediaUploadCompleted = {
      mediaId: completion.row.id,
      url: urlOf(runtime, completion.row),
      width: completion.row.width,
      height: completion.row.height,
      size: completion.row.sizeBytes,
    }
    res.json(done)
  })
}
