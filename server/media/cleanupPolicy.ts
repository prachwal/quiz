/**
 * Pure rules of the media cleanup (Media-Storage-Plan, S1 "Sprzątanie"): the age cut-offs, the order and the batch of
 * the rows to remove, the time budget of one run and the cron guard. No database, no storage, no clock: the caller
 * passes `now`. Imports only constants and node:crypto, so the tests can load it without the database driver.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { MEDIA_PENDING_MAX_AGE_MS, MEDIA_UNREFERENCED_MAX_AGE_MS } from './constants'

/** Rows removed per run and per kind (the daily run is the only place that removes unreferenced files). */
export const CLEANUP_BATCH_SIZE = 200

/** The daily run stops starting new work after this many milliseconds (the function may run 30 s). */
export const CLEANUP_TIME_BUDGET_MS = 20_000

/** Rows created before this instant are stale `pending` rows. */
export const pendingCutoff = (now: Date): Date => new Date(now.getTime() - MEDIA_PENDING_MAX_AGE_MS)

/** Rows created before this instant may be removed when nothing references them. */
export const unreferencedCutoff = (now: Date): Date => new Date(now.getTime() - MEDIA_UNREFERENCED_MAX_AGE_MS)

/** Oldest first; equal timestamps are ordered by id, so a run is deterministic. Returns a new array. */
export function orderOldestFirst<T extends { createdAt: string; id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt)
    if (byTime !== 0) return byTime
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/** The rows one run may touch: the `limit` oldest. */
export function takeBatch<T extends { createdAt: string; id: string }>(rows: readonly T[], limit: number = CLEANUP_BATCH_SIZE): T[] {
  return orderOldestFirst(rows).slice(0, Math.max(0, Math.trunc(limit)))
}

/** True while the run may still start work; `startedAt` and `now` are epoch milliseconds. */
export const withinBudget = (startedAt: number, now: number, budgetMs: number = CLEANUP_TIME_BUDGET_MS): boolean => now - startedAt < budgetMs

/**
 * The e2e-only owner filter of the daily run (`MEDIA_CLEANUP_OWNER_FILTER`, read by cronRoute.ts). Unset, empty or
 * whitespace-only means "no filter" (production: every author). Otherwise the trimmed text; it is compared as data
 * (a parameter of the SQL, never a LIKE pattern), so `%` or `_` in it are ordinary characters.
 */
export function ownerFilterFromEnv(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim() ?? ''
  return trimmed === '' ? undefined : trimmed
}

/**
 * Scope of the daily run's selections. `ownerContains` (only set by the e2e, through MEDIA_CLEANUP_OWNER_FILTER)
 * keeps the rows whose owner id contains that text; absent or empty means every author.
 */
export interface StaleScope {
  ownerContains?: string
}

/** The bind parameter of the owner scope: the text, or null (no filter). Never a LIKE pattern, never in the SQL text. */
export const ownerScopeParam = (scope: StaleScope): string | null => scope.ownerContains || null

/**
 * Guard of the cron endpoint (`GET /api/media/cleanup`). `disabled`: CRON_SECRET is unset or blank, so the endpoint
 * must look absent (404) and never run. `unauthorized`: the Authorization header is not exactly `Bearer <secret>`.
 * Both sides are hashed first, so the comparison takes the same time whatever the lengths are (timingSafeEqual).
 */
export function cronGuard(secret: string | undefined, authorization: string | undefined): 'disabled' | 'unauthorized' | 'ok' {
  if (secret === undefined || secret.trim() === '') return 'disabled'
  if (authorization === undefined) return 'unauthorized'
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`)) ? 'ok' : 'unauthorized'
}
