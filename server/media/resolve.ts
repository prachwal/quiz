/** The `media` map of API responses with the real query (see mediaMap.ts for the logic and its tests). */
import type { MediaMap } from '../../src/shared/media/types'
import type { MediaEnv } from './config'
import { resolveMediaWith } from './mediaMap'
import { getReady } from './repo'

export { withMedia } from './mediaMap'

/** Addresses of the `ready` files among the ids (one query at most; none for no ids or without a base URL). */
export const resolveMedia = (ids: readonly string[], env: MediaEnv = process.env): Promise<MediaMap> =>
  resolveMediaWith(ids, env, (unique) => getReady(unique))
