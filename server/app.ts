import express from 'express'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'
import { authenticate, currentUserId, requireAuthenticated } from './auth'
import * as auth0 from './auth0Management'
import { HttpError } from './http'
import { mcpHandler, mcpNotAllowed } from './mcp'
import { MCP_PATH, METADATA_PATH, protectedResourceMetadata, publicOrigin } from './protectedResource'
import { registerAdminRoutes } from './routes/admin'
import { registerClassRoutes } from './routes/classes'
import { registerLearningRoutes } from './routes/learning'
import { registerProgressRoutes } from './routes/progress'
import { registerQuizRoutes } from './routes/quizzes'
import { registerTokenRoutes } from './routes/tokens'
import { initSentry, reportServerError } from './sentry'

/**
 * The HTTP app. Route handlers live in `server/routes/` (mounted below in this order); shared request
 * helpers and `HttpError` are in `server/http.ts`.
 *
 * Note: handlers answer `{ ok: true }` instead of `204 No Content` - the Netlify function response
 * adapter rejects status codes that must not carry a body (204/304) when the body is an empty string.
 */
export function createApp() {
  initSentry()
  const app = express()
  app.disable('x-powered-by')
  // correlate logs, Sentry events, the error screen and feedback reports
  app.use((req, res, next) => {
    const requestId = String(req.headers['x-nf-request-id'] ?? randomUUID())
    res.locals.requestId = requestId
    res.set('X-Request-Id', requestId)
    next()
  })
  // Responses are private and per user: no ETag / conditional GET (a 304 breaks the Netlify
  // function response adapter) and nothing should be cached by browsers or proxies.
  app.set('etag', false)
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '1mb' }))

  // Netlify rewrites /api/* to the function, so strip either prefix before routing.
  app.use(((req, _res, next) => {
    req.url = req.url.replace(/^\/(?:\.netlify\/functions\/api|api)(?=\/|\?|$)/, '') || '/'
    next()
  }) satisfies RequestHandler)

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  // public: tells MCP clients which authorization server (Auth0) issues tokens for /api/mcp
  app.get([METADATA_PATH, `${METADATA_PATH}${MCP_PATH}`], (req, res) => {
    const origin = publicOrigin(req.headers)
    const domain = process.env.AUTH0_DOMAIN
    if (!origin || !domain) {
      res.status(404).json({ error: 'OAuth nie jest skonfigurowany' })
      return
    }
    res.set('Access-Control-Allow-Origin', '*').json(protectedResourceMetadata(origin, domain))
  })

  // everything below is private: Bearer JWT (Auth0) or personal API token
  app.use(authenticate, requireAuthenticated)

  // Model Context Protocol server for AI clients (Claude, OpenAI, Grok...) - same auth as the REST API
  app.post('/mcp', mcpHandler)
  app.all('/mcp', mcpNotAllowed)

  const router = express.Router()
  registerQuizRoutes(router)
  registerTokenRoutes(router)
  registerClassRoutes(router)
  registerProgressRoutes(router)
  registerLearningRoutes(router)
  registerAdminRoutes(router)
  app.use(router)

  app.use(((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  }) satisfies RequestHandler)

  app.use((async (error, req, res, _next) => {
    const requestId = String(res.locals.requestId ?? '')
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    } else if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message })
    } else if (error instanceof auth0.ManagementError) {
      res.status(error.status).json({ error: error.message, requestId })
    } else if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'Invalid JSON body' })
    } else {
      // unexpected: structured log + Sentry; the client gets the request id to quote in a report
      console.error(
        JSON.stringify({
          level: 'error',
          requestId,
          method: req.method,
          path: req.path,
          userId: currentUserId(req),
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      )
      const eventId = await reportServerError(error, {
        requestId,
        userId: currentUserId(req),
        method: req.method,
        path: req.path,
      })
      res.status(500).json({ error: 'Internal server error', requestId, eventId })
    }
  }) satisfies ErrorRequestHandler)

  return app
}
