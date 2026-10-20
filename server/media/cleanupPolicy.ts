/**
 * Pure rules of the media cleanup (Media-Storage-Plan, S1 "Sprzątanie"): the age cut-offs, the order and the batch of
 * the rows to remove, and the time budget of one run. No database, no storage, no clock: the caller passes `now`.
 * Imports only constants, so the tests can load it without the database driver.
 */
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
