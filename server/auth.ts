import { auth } from 'express-oauth2-jwt-bearer'
import type { Request, RequestHandler } from 'express'

const domain = process.env.AUTH0_DOMAIN
const audience = process.env.AUTH0_AUDIENCE

/**
 * Validates an Auth0 access token when one is sent (`Authorization: Bearer ...`).
 * Requests without a token - or with an invalid/expired one - continue as anonymous (the library
 * swallows token errors when `authRequired` is false); use `requireUser` to protect a route.
 * Without AUTH0_DOMAIN / AUTH0_AUDIENCE auth is disabled and every request is anonymous.
 */
export const authenticate: RequestHandler =
  domain && audience
    ? auth({ issuerBaseURL: `https://${domain}/`, audience, authRequired: false })
    : (_req, _res, next) => next()

/** Auth0 user id (the verified token's `sub`, e.g. "auth0|64f1...") or null when anonymous. */
export const currentUserId = (req: Request): string | null => req.auth?.payload.sub ?? null

export const requireUser: RequestHandler = (req, res, next) => {
  if (currentUserId(req)) next()
  else res.status(401).json({ error: 'Zaloguj się, aby wykonać tę operację' })
}

/** Role-based permissions granted in the access token (Auth0 RBAC: role -> API permissions). */
export const WRITE_QUIZZES = 'write:quizzes'

export const hasPermission = (req: Request, permission: string): boolean => {
  const permissions = req.auth?.payload.permissions
  return Array.isArray(permissions) && permissions.includes(permission)
}

/** 401 when anonymous, 403 when signed in without the permission (granted to the `admin` role). */
export const requirePermission =
  (permission: string): RequestHandler =>
  (req, res, next) => {
    if (!currentUserId(req)) res.status(401).json({ error: 'Zaloguj się, aby wykonać tę operację' })
    else if (!hasPermission(req, permission)) res.status(403).json({ error: 'Ta operacja wymaga roli admin' })
    else next()
  }
