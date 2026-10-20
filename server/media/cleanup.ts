/**
 * The daily media cleanup run (Media-Storage-Plan S1, "Sprzątanie"), called by `GET /api/media/cleanup` from Vercel
 * Cron. Every author's `pending` rows older than an hour and `ready` rows older than a day that nothing references
 * are removed, oldest first, at most CLEANUP_BATCH_SIZE rows of each kind per run and within a time budget.
 *
 * Order per batch of rows (the locks make the reference check hold until the rows are gone):
 *   1. one transaction: lock the rows, re-check their references;
 *   2. for each unreferenced row: remove the object (best effort; a failure keeps the row, counted as failed, so the
 *      next run retries it);
 *   3. delete the rows whose objects are gone, then commit. ON DELETE RESTRICT is still the safety net.
 *
 * Storage not configured: nothing is read or deleted; the result says so. Impure: the database and the storage.
 * The rules are in cleanupPolicy.ts.
 */
import { pool } from '../db'
import type { PoolClient } from '../db'
import { CLEANUP_BATCH_SIZE, CLEANUP_TIME_BUDGET_MS, pendingCutoff, type StaleScope, unreferencedCutoff, withinBudget } from './cleanupPolicy'
import * as repo from './repo'
import type { MediaRow } from './repo'
import { mediaRuntime, type MediaRuntime, warnStorageFailure } from './service'

/** Rows per transaction: the locks are held for the storage calls of one chunk only. */
const CHUNK_SIZE = 50

export interface CleanupResult {
  pendingRemoved: number
  unreferencedRemoved: number
  /** rows that could not be removed this run (storage failure, or a reference appeared): kept for the next run */
  failed: number
  /** rows of the same kinds still eligible when the run ended (not yet reached, failed, or beyond the batch) */
  remaining: number
  durationMs: number
}

export type CleanupOutcome = CleanupResult | (CleanupResult & { skipped: 'storage-not-configured' })

interface Counts {
  removed: number
  failed: number
}

/**
 * Removes one batch of rows: objects first, then the rows, one transaction per chunk. Once the time budget is spent,
 * the rest of the batch is left alone (it stays eligible, so `remaining` counts it).
 */
async function removeBatch(runtime: MediaRuntime, rows: readonly MediaRow[], startedAt: number, origin: string): Promise<Counts> {
  const counts: Counts = { removed: 0, failed: 0 }
  for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
    if (!withinBudget(startedAt, Date.now(), CLEANUP_TIME_BUDGET_MS)) break
    const chunk = rows.slice(offset, offset + CHUNK_SIZE)
    const client: PoolClient = await pool().connect()
    try {
      await client.query('BEGIN')
      const locked = await repo.lockForRemoval(
        client,
        chunk.map((row) => row.id),
      )
      // rows that vanished meanwhile are not failures; rows that got a reference are
      counts.failed += locked.filter((row) => row.referenced).length
      const removable: string[] = []
      for (const row of locked) {
        if (row.referenced) continue
        if (!withinBudget(startedAt, Date.now(), CLEANUP_TIME_BUDGET_MS)) break
        try {
          await runtime.storage.remove(row.key)
          removable.push(row.id)
        } catch (error) {
          counts.failed += 1
          warnStorageFailure(origin, row.id, error)
        }
      }
      const deleted = await repo.deleteRows(client, removable)
      await client.query('COMMIT')
      counts.removed += deleted
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      counts.failed += chunk.length
      console.error(
        JSON.stringify({ level: 'error', event: 'media.cleanup.chunk_failed', origin, message: error instanceof Error ? error.message : String(error) }),
      )
    } finally {
      client.release()
    }
  }
  return counts
}

/** Options of one daily run. `ownerContains` is the e2e-only scope (see cleanupPolicy.ownerFilterFromEnv). */
export interface CleanupOptions {
  ownerContains?: string
}

/**
 * One daily run. `now` is injected for the cut-offs; the time budget is measured from the real clock. With
 * `ownerContains` only the owners whose id contains that text are considered (the e2e); without it every author is.
 */
export async function runMediaCleanup(now: Date = new Date(), options: CleanupOptions = {}): Promise<CleanupOutcome> {
  const startedAt = Date.now()
  let runtime: MediaRuntime
  try {
    runtime = mediaRuntime()
  } catch {
    // the reason (missing variables) is in the environment, not in the response; nothing is read or deleted
    return { skipped: 'storage-not-configured', pendingRemoved: 0, unreferencedRemoved: 0, failed: 0, remaining: 0, durationMs: Date.now() - startedAt }
  }

  const scope: StaleScope = options.ownerContains ? { ownerContains: options.ownerContains } : {}
  if (scope.ownerContains) {
    // a test setting; in production it must never be set (docs/vercel.md)
    console.warn(JSON.stringify({ level: 'warn', event: 'media.cleanup.owner_filter', ownerContains: scope.ownerContains }))
  }
  const pendingBefore = pendingCutoff(now)
  const unreferencedBefore = unreferencedCutoff(now)
  const pending = await repo.stalePendingOf(null, pendingBefore, CLEANUP_BATCH_SIZE, pool(), scope)
  const pendingCounts = await removeBatch(runtime, pending, startedAt, 'pending')
  const unreferenced = await repo.unreferencedReadyBefore(unreferencedBefore, CLEANUP_BATCH_SIZE, pool(), scope)
  const readyCounts = await removeBatch(runtime, unreferenced, startedAt, 'unreferenced')

  const remaining = await repo.countStale(pendingBefore, unreferencedBefore, pool(), scope)
  const result: CleanupResult = {
    pendingRemoved: pendingCounts.removed,
    unreferencedRemoved: readyCounts.removed,
    failed: pendingCounts.failed + readyCounts.failed,
    remaining,
    durationMs: Date.now() - startedAt,
  }
  console.log(JSON.stringify({ level: 'info', event: 'media.cleanup', ...result }))
  return result
}
