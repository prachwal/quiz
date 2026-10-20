/**
 * The impure steps of the upload and management paths (Media-Storage-Plan, "Przepływy wysyłania"): the storage
 * driver, the `media` table and the daily limits, in the order the plan gives. The MCP tools call this module;
 * the browser routes (M6) will too. It never imports quizzes, lessons, progress or classes.
 *
 * Refusals are `MediaRequestError` with a Polish message; anything else is a bug or an outage and propagates.
 */
import { randomUUID } from 'node:crypto'
import { type MediaConfig, resolveMediaConfig } from './config'
import { MEDIA_PRESIGN_SECONDS, type MediaContentType, type MediaSource } from './constants'
import { getStorage, type StorageDriver } from './driver'
import { mediaKey } from './keys'
import { withinDailyLimits } from './limits'
import * as repo from './repo'
import type { MediaRef, MediaRow } from './repo'
import { checkSize, DAILY_LIMIT_REASON, sha256Of, sniffUpload, verifyCompletion } from './uploads'

/** A refusal the caller shows to the user (not a server error). `status` is used by the browser routes (MCP ignores it). */
export class MediaRequestError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'MediaRequestError'
    this.status = status
  }
}

export interface MediaRuntime {
  config: MediaConfig
  storage: StorageDriver
  now: () => Date
}

/** Configuration and storage of this process. Throws MediaRequestError when the storage is not configured. */
export function mediaRuntime(): MediaRuntime {
  try {
    const config = resolveMediaConfig(process.env)
    return { config, storage: getStorage(), now: () => new Date() }
  } catch (error) {
    throw new MediaRequestError(`Magazyn mediów nie jest skonfigurowany: ${(error as Error).message}`, 503)
  }
}

export interface StoredMedia {
  row: MediaRow
  /** true when this author already had the same bytes: nothing was written. */
  reused: boolean
}

async function enforceDailyLimits(ownerId: string, size: number): Promise<void> {
  const today = await repo.countsToday(ownerId)
  if (!withinDailyLimits(today, size)) throw new MediaRequestError(DAILY_LIMIT_REASON)
}

/** Address of a stored file: the public base plus its key (the same rule as the API's `media` map). */
export const urlOf = (runtime: MediaRuntime, row: MediaRow): string => runtime.storage.publicUrl(row.key)

/**
 * Bytes in hand (`media_upload`, `media_upload_from_url`): sniff, hash, reuse the author's ready copy when there
 * is one, otherwise limits, key, write, then the row (pending -> ready in the same request).
 */
export async function storeBytes(
  runtime: MediaRuntime,
  input: { ownerId: string; bytes: Uint8Array; source: MediaSource },
): Promise<StoredMedia> {
  const sniffed = sniffUpload(input.bytes, runtime.config.maxBytes)
  if (!sniffed.ok) throw new MediaRequestError(sniffed.reason)
  const sha256 = sha256Of(input.bytes)

  const existing = await repo.findBySha(input.ownerId, sha256)
  if (existing?.status === 'ready') return { row: existing, reused: true }

  await enforceDailyLimits(input.ownerId, input.bytes.byteLength)
  const { contentType, width, height } = sniffed.value
  const id = randomUUID()
  const key = mediaKey(runtime.config.keyPrefix, runtime.now().getUTCFullYear(), id, contentType)
  await runtime.storage.put(key, input.bytes, { contentType })
  const pending = await repo.createPending({
    id,
    key,
    contentType,
    sizeBytes: input.bytes.byteLength,
    sha256,
    source: input.source,
    ownerId: input.ownerId,
  })
  const ready = await repo.markReady(id, { width, height })
  return { row: ready ?? pending, reused: false }
}

export type UploadStart =
  | { kind: 'reused'; row: MediaRow }
  | {
      kind: 'upload'
      row: MediaRow
      /** false when a pending row was offered again (nothing new was written, so nothing to audit). */
      created: boolean
      uploadUrl: string
      headers: Record<string, string>
      expiresInSeconds: number
    }

/**
 * `media_create_upload`: the declared size, type and hash are checked against the limits and the author's copy.
 * A ready copy is reused (no upload needed); a pending row with the same type and size is offered again;
 * otherwise a new pending row and a presigned PUT (the signature covers the exact size).
 */
export async function beginUpload(
  runtime: MediaRuntime,
  input: { ownerId: string; contentType: MediaContentType; size: number; sha256: string; source: MediaSource },
): Promise<UploadStart> {
  const size = checkSize(input.size, runtime.config.maxBytes)
  if (!size.ok) throw new MediaRequestError(size.reason)

  const existing = await repo.findBySha(input.ownerId, input.sha256)
  if (existing?.status === 'ready') return { kind: 'reused', row: existing }
  if (existing && existing.contentType === input.contentType && existing.sizeBytes === input.size) {
    return { kind: 'upload', row: existing, created: false, ...(await presign(runtime, existing)) }
  }

  await enforceDailyLimits(input.ownerId, input.size)
  const id = randomUUID()
  const key = mediaKey(runtime.config.keyPrefix, runtime.now().getUTCFullYear(), id, input.contentType)
  const row = await repo.createPending({
    id,
    key,
    contentType: input.contentType,
    sizeBytes: input.size,
    sha256: input.sha256,
    source: input.source,
    ownerId: input.ownerId,
  })
  return { kind: 'upload', row, created: true, ...(await presign(runtime, row)) }
}

async function presign(runtime: MediaRuntime, row: MediaRow) {
  const signed = await runtime.storage.presignPut(row.key, {
    contentType: row.contentType,
    contentLength: row.sizeBytes,
    expiresInSeconds: MEDIA_PRESIGN_SECONDS,
  })
  return { uploadUrl: signed.url, headers: signed.headers, expiresInSeconds: MEDIA_PRESIGN_SECONDS }
}

/** Only the owner or an admin may act on a file; anyone else gets the same answer as for a missing file. */
export async function ownedMedia(id: string, userId: string, isAdmin: boolean): Promise<MediaRow> {
  const row = await repo.get(id)
  if (!row || (!isAdmin && row.ownerId !== userId)) throw new MediaRequestError('Nie znaleziono pliku.', 404)
  return row
}

export type Completion = { kind: 'ready'; row: MediaRow } | { kind: 'rejected'; reason: string }

/**
 * `media_complete`: the object must exist, have the declared size and hash, and be of the declared type. On success
 * the row becomes ready. On a mismatch the object and the row are removed (the client has to start again).
 */
export async function completeUpload(
  runtime: MediaRuntime,
  input: { id: string; userId: string; isAdmin: boolean },
): Promise<Completion> {
  const row = await ownedMedia(input.id, input.userId, input.isAdmin)
  if (row.status === 'ready') throw new MediaRequestError('Plik jest już gotowy - nie trzeba go wysyłać ponownie.')

  const head = await runtime.storage.head(row.key)
  if (!head) throw new MediaRequestError('Plik nie został jeszcze wysłany do magazynu. Wyślij bajty na uploadUrl (PUT) i wywołaj media_complete ponownie.')

  const reject = async (reason: string): Promise<Completion> => {
    await runtime.storage.remove(row.key)
    await repo.remove(row.id)
    return { kind: 'rejected', reason }
  }
  if (head.size !== row.sizeBytes) {
    return reject(`Rozmiar pliku w magazynie (${head.size} B) nie zgadza się z zadeklarowanym (${row.sizeBytes} B). Plik usunięto - zacznij od media_create_upload.`)
  }
  const bytes = await runtime.storage.getRange(row.key, 0, row.sizeBytes - 1)
  if (!bytes) throw new MediaRequestError('Plik nie został jeszcze wysłany do magazynu. Wyślij bajty na uploadUrl (PUT) i wywołaj media_complete ponownie.')
  const verified = verifyCompletion({ declaredSize: row.sizeBytes, declaredSha: row.sha256, declaredType: row.contentType, bytes })
  if (!verified.ok) return reject(`${verified.reason} Plik usunięto - zacznij od media_create_upload.`)

  const ready = await repo.markReady(row.id, verified.value)
  if (!ready) throw new MediaRequestError('Plik został już zmieniony przez inne wywołanie. Sprawdź media_get.')
  return { kind: 'ready', row: ready }
}

export type DeleteResult =
  | { kind: 'removed'; row: MediaRow }
  | { kind: 'in-use'; row: MediaRow; references: MediaRef[] }

/** Removes an unused file (object and row). A referenced file is returned with its references, untouched. */
export async function deleteMedia(runtime: MediaRuntime, input: { id: string; userId: string; isAdmin: boolean }): Promise<DeleteResult> {
  const row = await ownedMedia(input.id, input.userId, input.isAdmin)
  const result = await repo.remove(row.id)
  if (result.status === 'missing') throw new MediaRequestError('Nie znaleziono pliku.')
  if (result.status === 'in-use') return { kind: 'in-use', row, references: result.references }
  await runtime.storage.remove(result.key)
  return { kind: 'removed', row }
}

/** `media_get`: the file with its references (owner or admin only). */
export async function mediaDetails(input: { id: string; userId: string; isAdmin: boolean }): Promise<{ row: MediaRow; references: MediaRef[] }> {
  const row = await ownedMedia(input.id, input.userId, input.isAdmin)
  return { row, references: await repo.referencesOf(row.id) }
}

/** Successful URL fetches of this author in the last hour (the rows the fetch created). */
export const urlFetchesLastHour = (ownerId: string, now: Date): Promise<number> =>
  repo.countBySourceSince(ownerId, 'mcp-url', new Date(now.getTime() - 60 * 60 * 1000))
