/**
 * Media table access. Every SQL statement of the media module lives in this file, so it can be reviewed in one
 * place. Imports only `pool` from server/db: it never imports quizzes, learning, progress or classes.
 * Not wired into quizzes or lessons yet (step M2).
 */
import type { PoolClient } from '../db'
import { pool } from '../db'
import { type MediaContentType, type MediaOwnerKind, MEDIA_OWNER_KINDS, type MediaSource } from './constants'

export type MediaStatus = 'pending' | 'ready'

export interface MediaRow {
  id: string
  key: string
  contentType: MediaContentType
  sizeBytes: number
  width: number | null
  height: number | null
  sha256: string
  status: MediaStatus
  source: MediaSource
  ownerId: string
  createdAt: string
  readyAt: string | null
}

interface RawMediaRow {
  id: string
  key: string
  contentType: MediaContentType
  sizeBytes: number
  width: number | null
  height: number | null
  sha256: string
  status: MediaStatus
  source: MediaSource
  ownerId: string
  createdAt: Date
  readyAt: Date | null
}

export interface MediaRef {
  ownerKind: MediaOwnerKind
  ownerId: string
}

export interface ProblemList {
  /** ids that are not uuids (never sent to the database) */
  malformed: string[]
  /** ids with no row */
  missing: string[]
  /** ids whose row is still 'pending' */
  notReady: string[]
}

/** A reference list was refused. The message is Polish and user-facing; the lists say which ids failed. */
export class MediaRefError extends Error {
  readonly code = 'MEDIA_REF'
  readonly problems: ProblemList

  constructor(problems: ProblemList) {
    const parts: string[] = []
    if (problems.malformed.length) parts.push(`nieprawidłowe identyfikatory: ${problems.malformed.join(', ')}`)
    if (problems.missing.length) parts.push(`nieistniejące pliki: ${problems.missing.join(', ')}`)
    if (problems.notReady.length) parts.push(`pliki jeszcze niewysłane: ${problems.notReady.join(', ')}`)
    super(`Obrazy nie mogą być użyte: ${parts.join('; ')}.`)
    this.name = 'MediaRefError'
    this.problems = problems
  }
}

type Db = Pick<PoolClient, 'query'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const MEDIA_COLUMNS = `
  id::text AS id, key, content_type AS "contentType", size_bytes AS "sizeBytes", width, height,
  sha256, status, source, owner_id AS "ownerId", created_at AS "createdAt", ready_at AS "readyAt"`

function toRow(raw: RawMediaRow): MediaRow {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt).toISOString(),
    readyAt: raw.readyAt ? new Date(raw.readyAt).toISOString() : null,
  }
}

export function isMediaId(value: string): boolean {
  return UUID.test(value)
}

export interface NewPendingMedia {
  id: string
  key: string
  contentType: MediaContentType
  sizeBytes: number
  sha256: string
  source: MediaSource
  ownerId: string
}

/** Inserts a `pending` row. The caller chose the id (it is part of the key). */
export async function createPending(input: NewPendingMedia, db: Db = pool()): Promise<MediaRow> {
  const { rows } = await db.query<RawMediaRow>(
    `INSERT INTO media (id, key, content_type, size_bytes, sha256, status, source, owner_id)
     VALUES ($1::uuid, $2, $3, $4, $5, 'pending', $6, $7)
     RETURNING ${MEDIA_COLUMNS}`,
    [input.id, input.key, input.contentType, input.sizeBytes, input.sha256, input.source, input.ownerId],
  )
  return toRow(rows[0])
}

/** `pending` -> `ready` with the size read from the bytes. Null when the row is missing or already ready. */
export async function markReady(
  id: string,
  size: { width: number; height: number },
  db: Db = pool(),
): Promise<MediaRow | null> {
  if (!isMediaId(id)) return null
  const { rows } = await db.query<RawMediaRow>(
    `UPDATE media
        SET status = 'ready', width = $2, height = $3, ready_at = now()
      WHERE id = $1::uuid AND status = 'pending'
      RETURNING ${MEDIA_COLUMNS}`,
    [id, size.width, size.height],
  )
  return rows[0] ? toRow(rows[0]) : null
}

/** `ready` rows for the given ids in one query; pending and unknown ids are simply absent. */
export async function getReady(ids: readonly string[], db: Db = pool()): Promise<MediaRow[]> {
  const valid = [...new Set(ids.filter(isMediaId))]
  if (valid.length === 0) return []
  const { rows } = await db.query<RawMediaRow>(
    `SELECT ${MEDIA_COLUMNS} FROM media WHERE id = ANY($1::uuid[]) AND status = 'ready'`,
    [valid],
  )
  return rows.map(toRow)
}

/** An existing file of this author with the same sha256; a `ready` one is preferred over a `pending` one. */
export async function findBySha(ownerId: string, sha256: string, db: Db = pool()): Promise<MediaRow | null> {
  const { rows } = await db.query<RawMediaRow>(
    `SELECT ${MEDIA_COLUMNS}
       FROM media
      WHERE owner_id = $1 AND sha256 = $2
      ORDER BY (status = 'ready') DESC, created_at DESC
      LIMIT 1`,
    [ownerId, sha256],
  )
  return rows[0] ? toRow(rows[0]) : null
}

/** Rows for the given ids (malformed ids are dropped without a query). Order is not guaranteed. */
export async function getMany(ids: readonly string[], db: Db = pool()): Promise<MediaRow[]> {
  const valid = [...new Set(ids.filter(isMediaId))]
  if (valid.length === 0) return []
  const { rows } = await db.query<RawMediaRow>(
    `SELECT ${MEDIA_COLUMNS} FROM media WHERE id = ANY($1::uuid[])`,
    [valid],
  )
  return rows.map(toRow)
}

export async function get(id: string, db: Db = pool()): Promise<MediaRow | null> {
  const rows = await getMany([id], db)
  return rows[0] ?? null
}

export interface ListOptions {
  /** null lists every author's files (admins); a string lists one author's files. */
  ownerId: string | null
  /** true keeps only files without any reference. */
  unreferenced?: boolean
  limit: number
  offset?: number
}

/** A page of files, newest first, with the total count for the same filter. */
export async function listByOwner(
  options: ListOptions,
  db: Db = pool(),
): Promise<{ items: MediaRow[]; total: number }> {
  const limit = Math.min(Math.max(Math.trunc(options.limit), 1), 100)
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0)
  const unreferenced = options.unreferenced === true
  const [items, count] = await Promise.all([
    db.query<RawMediaRow>(
      `SELECT ${MEDIA_COLUMNS}
         FROM media AS m
        WHERE ($1::text IS NULL OR m.owner_id = $1)
          AND (NOT $2::boolean OR NOT EXISTS (SELECT 1 FROM media_refs AS r WHERE r.media_id = m.id))
        ORDER BY m.created_at DESC, m.id
        LIMIT $3 OFFSET $4`,
      [options.ownerId, unreferenced, limit, offset],
    ),
    db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
         FROM media AS m
        WHERE ($1::text IS NULL OR m.owner_id = $1)
          AND (NOT $2::boolean OR NOT EXISTS (SELECT 1 FROM media_refs AS r WHERE r.media_id = m.id))`,
      [options.ownerId, unreferenced],
    ),
  ])
  return { items: items.rows.map(toRow), total: count.rows[0]?.total ?? 0 }
}

export type RemoveResult =
  | { status: 'removed'; key: string }
  | { status: 'in-use'; references: MediaRef[] }
  | { status: 'missing' }

/** Who references a file (empty when nothing does). Used by the refusal messages and by media_get. */
export async function referencesOf(id: string, db: Db = pool()): Promise<MediaRef[]> {
  const { rows } = await db.query<{ ownerKind: MediaOwnerKind; ownerId: string }>(
    `SELECT owner_kind AS "ownerKind", owner_id AS "ownerId"
       FROM media_refs
      WHERE media_id = $1::uuid
      ORDER BY owner_kind, owner_id`,
    [id],
  )
  return rows
}

/**
 * Deletes the row of an unused file and returns its key, so the caller can remove the object from the bucket.
 * Refuses (`in-use`, with the referencing owners) when any reference exists.
 */
export async function remove(id: string, db: Db = pool()): Promise<RemoveResult> {
  if (!isMediaId(id)) return { status: 'missing' }
  const references = await referencesOf(id, db)
  if (references.length > 0) return { status: 'in-use', references }
  try {
    const { rows } = await db.query<{ key: string }>(`DELETE FROM media WHERE id = $1::uuid RETURNING key`, [id])
    return rows[0] ? { status: 'removed', key: rows[0].key } : { status: 'missing' }
  } catch (error) {
    // a reference added between the check and the delete: ON DELETE RESTRICT (SQLSTATE 23503) keeps the file
    if ((error as { code?: string }).code === '23503') {
      return { status: 'in-use', references: await referencesOf(id, db) }
    }
    throw error
  }
}

/**
 * `pending` rows created before `olderThan`, oldest first, at most `limit`. `ownerId` null selects every author
 * (the daily run); a string selects one author (the upload start). A pending row has no references (syncRefs only
 * accepts `ready` files), so the result is safe to remove.
 */
export async function stalePendingOf(
  ownerId: string | null,
  olderThan: Date,
  limit = 200,
  db: Db = pool(),
): Promise<MediaRow[]> {
  const { rows } = await db.query<RawMediaRow>(
    `SELECT ${MEDIA_COLUMNS}
       FROM media
      WHERE status = 'pending'
        AND created_at < $2
        AND ($1::text IS NULL OR owner_id = $1)
      ORDER BY created_at, id
      LIMIT $3`,
    [ownerId, olderThan.toISOString(), Math.min(Math.max(Math.trunc(limit), 1), 1000)],
  )
  return rows.map(toRow)
}

/** Files and bytes this author created today (UTC day, pending rows included). */
export async function countsToday(ownerId: string, db: Db = pool()): Promise<{ files: number; bytes: number }> {
  const { rows } = await db.query<{ files: number; bytes: string }>(
    `SELECT COUNT(*)::int AS files, COALESCE(SUM(size_bytes), 0)::bigint AS bytes
       FROM media
      WHERE owner_id = $1
        AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
    [ownerId],
  )
  return { files: rows[0]?.files ?? 0, bytes: Number(rows[0]?.bytes ?? 0) }
}

/** Files of one source created by this author since the given instant (the hourly URL-fetch limit counts these). */
export async function countBySourceSince(ownerId: string, source: MediaSource, since: Date, db: Db = pool()): Promise<number> {
  const { rows } = await db.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM media WHERE owner_id = $1 AND source = $2 AND created_at >= $3`,
    [ownerId, source, since.toISOString()],
  )
  return rows[0]?.total ?? 0
}

/**
 * Replaces the references of one owner with `mediaIds`. Runs in the caller's transaction when `client` is given
 * (call it inside BEGIN/COMMIT with the owner's own writes); otherwise opens its own transaction.
 * Throws MediaRefError when an id is malformed, missing or still pending. Nothing is written in that case.
 */
export async function syncRefs(
  ownerKind: MediaOwnerKind,
  ownerId: string,
  mediaIds: readonly string[],
  client?: PoolClient,
): Promise<void> {
  if (!(MEDIA_OWNER_KINDS as readonly string[]).includes(ownerKind)) throw new Error(`syncRefs: unknown owner kind ${ownerKind}`)
  if (ownerId === '') throw new Error('syncRefs: ownerId is required')
  const ids = [...new Set(mediaIds)]
  const malformed = ids.filter((id) => !isMediaId(id))
  const checkable = ids.filter(isMediaId)

  const run = async (db: Db): Promise<void> => {
    const { rows } = checkable.length
      ? await db.query<{ id: string; status: MediaStatus }>(
          `SELECT id::text AS id, status FROM media WHERE id = ANY($1::uuid[]) FOR SHARE`,
          [checkable],
        )
      : { rows: [] as { id: string; status: MediaStatus }[] }
    const found = new Map(rows.map((row) => [row.id, row.status]))
    const missing = checkable.filter((id) => !found.has(id))
    const notReady = checkable.filter((id) => found.get(id) === 'pending')
    if (malformed.length || missing.length || notReady.length) {
      throw new MediaRefError({ malformed, missing, notReady })
    }
    await db.query(`DELETE FROM media_refs WHERE owner_kind = $1::text AND owner_id = $2::text`, [ownerKind, ownerId])
    if (checkable.length) {
      await db.query(
        `INSERT INTO media_refs (media_id, owner_kind, owner_id)
         SELECT u.id, $1::text, $2::text FROM unnest($3::uuid[]) AS u(id)`,
        [ownerKind, ownerId, checkable],
      )
    }
  }

  if (client) {
    await run(client)
    return
  }
  const own = await pool().connect()
  try {
    await own.query('BEGIN')
    await run(own)
    await own.query('COMMIT')
  } catch (error) {
    await own.query('ROLLBACK')
    throw error
  } finally {
    own.release()
  }
}
