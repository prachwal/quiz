import * as Sentry from '@sentry/node'

const dsn = process.env.SENTRY_DSN
let ready = false

/** Sentry is optional: without SENTRY_DSN nothing is reported (errors are still logged as JSON). */
export function initSentry() {
  if (!dsn || ready) return
  Sentry.init({
    dsn,
    environment: process.env.CONTEXT ?? 'development',
    release: process.env.COMMIT_REF,
    tracesSampleRate: 0,
  })
  ready = true
}

/** Reports a server error and waits for delivery (the function may freeze right after responding). */
export async function reportServerError(
  error: unknown,
  context: { requestId: string; userId: string | null; method: string; path: string },
): Promise<string | undefined> {
  if (!ready) return undefined
  const eventId = Sentry.withScope((scope) => {
    scope.setTag('request_id', context.requestId)
    scope.setUser(context.userId ? { id: context.userId } : null)
    scope.setContext('request', { method: context.method, path: context.path })
    return Sentry.captureException(error)
  })
  await Sentry.flush(2000).catch(() => undefined)
  return eventId
}
