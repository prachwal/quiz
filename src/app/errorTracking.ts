import { isRejectedWithValue } from '@reduxjs/toolkit'
import type { Middleware } from '@reduxjs/toolkit'
import { Sentry, sentryEnabled } from './sentry'

/** Request id of the latest failed API call, attached to feedback reports. */
let lastRequestId: string | undefined
export const getLastRequestId = () => lastRequestId

interface QueryError {
  status?: number | string
  data?: { requestId?: string; eventId?: string; error?: string }
}

/**
 * Reports unexpected API failures (5xx and network errors) to Sentry. 4xx responses are normal
 * application flow (validation, 401/403, 404) and are not reported.
 */
export const apiErrorMiddleware: Middleware = () => (next) => (action) => {
  if (isRejectedWithValue(action)) {
    const error = action.payload as QueryError | undefined
    const status = error?.status
    const unexpected = typeof status === 'number' ? status >= 500 : status === 'FETCH_ERROR' || status === 'PARSING_ERROR'
    if (unexpected) {
      lastRequestId = error?.data?.requestId ?? lastRequestId
      if (sentryEnabled) {
        Sentry.withScope((scope) => {
          scope.setTag('api_status', String(status))
          if (error?.data?.requestId) scope.setTag('request_id', error.data.requestId)
          scope.setContext('api', { endpoint: (action.meta?.arg as { endpointName?: string } | undefined)?.endpointName, status })
          Sentry.captureException(new Error(`API error ${status}: ${error?.data?.error ?? 'no response'}`))
        })
      }
    }
  }
  return next(action)
}
