/**
 * `GET /api/media/cleanup` - the daily media cleanup for Vercel Cron (Media-Storage-Plan S1). It is NOT behind the user
 * authentication gate: server/app.ts mounts it before `authenticate`, like /health. Access is guarded by CRON_SECRET:
 *
 *   CRON_SECRET unset or blank  -> 404 `{error: 'Not found'}` (the endpoint looks absent and never runs)
 *   Authorization not `Bearer <CRON_SECRET>` -> 401 `{error: 'Unauthorized'}` (no WWW-Authenticate header)
 *   otherwise                    -> 200 with the run's counts (see cleanup.ts)
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron invocations when the variable is set for the project.
 */
import type { RequestHandler } from 'express'
import { runMediaCleanup } from './cleanup'
import { cronGuard, ownerFilterFromEnv } from './cleanupPolicy'

export const mediaCleanupRoute: RequestHandler = async (req, res, next) => {
  const decision = cronGuard(process.env.CRON_SECRET, req.get('authorization'))
  if (decision === 'disabled') {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (decision === 'unauthorized') {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    // MEDIA_CLEANUP_OWNER_FILTER: e2e only, read from the server environment here (never from the request)
    const ownerContains = ownerFilterFromEnv(process.env.MEDIA_CLEANUP_OWNER_FILTER)
    res.json(await runMediaCleanup(new Date(), ownerContains === undefined ? {} : { ownerContains }))
  } catch (error) {
    next(error)
  }
}
