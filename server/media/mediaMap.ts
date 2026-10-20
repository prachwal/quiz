/**
 * The `media` map of API responses (Media-Storage-Plan D6). Pure: the database read is injected, so the tests
 * can load this module without the `pg` driver (server/media/resolve.ts binds the real query).
 */
import type { MediaMap } from '../../src/shared/media/types'
import { type MediaEnv, mediaUrlFor, publicBaseUrlOf } from './config'

/** The fields of a stored file that the map needs. */
export interface MediaAddressRow {
  id: string
  key: string
  width: number | null
  height: number | null
}

/** Map of the given rows (already filtered to `ready`) with addresses under `baseUrl`. */
export function buildMediaMap(rows: readonly MediaAddressRow[], baseUrl: string): MediaMap {
  const map: MediaMap = {}
  for (const row of rows) {
    map[row.id] = { url: mediaUrlFor(baseUrl, row.key), width: row.width, height: row.height }
  }
  return map
}

/** Adds `media` to a response body, or returns the body itself when there is nothing to add (JSON unchanged). */
export function withMedia<T extends object>(body: T, media: MediaMap): T & { media?: MediaMap } {
  return Object.keys(media).length === 0 ? body : { ...body, media }
}

let warnedMissingBaseUrl = false

/**
 * The map for the given image ids. No ids: `{}` without a query. Without a public base URL the references get
 * no address (the client shows a placeholder) and one structured warning is logged per process - the request
 * never fails because of it. Otherwise one query (`load`) for the `ready` rows.
 */
export async function resolveMediaWith(
  ids: readonly string[],
  env: MediaEnv,
  load: (ids: string[]) => Promise<MediaAddressRow[]>,
): Promise<MediaMap> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return {}
  const baseUrl = publicBaseUrlOf(env)
  if (baseUrl === null) {
    if (!warnedMissingBaseUrl) {
      warnedMissingBaseUrl = true
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'media.publicBaseUrlMissing',
          message: 'MEDIA_PUBLIC_BASE_URL is not set or invalid; image references are returned without an address',
        }),
      )
    }
    return {}
  }
  return buildMediaMap(await load(unique), baseUrl)
}
