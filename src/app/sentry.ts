import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

export const sentryEnabled = Boolean(dsn)

/** Sentry is optional: without VITE_SENTRY_DSN nothing leaves the browser. */
export function initSentry() {
  if (!dsn) return
  Sentry.init({
    dsn,
    release: __APP_VERSION__,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    // browser noise that is not actionable
    ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications.'],
    // never send tokens or query strings
    beforeSend(event) {
      if (event.request?.url) event.request.url = event.request.url.split('?')[0]
      return event
    },
  })
}

export { Sentry }
