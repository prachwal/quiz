import { auth } from 'express-oauth2-jwt-bearer'
import type { Request, RequestHandler, Response } from 'express'
import { TOKEN_PREFIX, findActiveToken, touchToken } from './apiTokens'

const domain = process.env.AUTH0_DOMAIN
const audience = process.env.AUTH0_AUDIENCE

/** Who is calling: an Auth0 user (JWT) or a personal API token acting for its owner. */
export interface Identity {
  /** Auth0 user id (`sub`, e.g. "auth0|64f1...") */
  userId: string
  permissions: string[]
  via: 'jwt' | 'token'
}

const identities = new WeakMap<Request, Identity>()

export const identityOf = (req: Request): Identity | null => identities.get(req) ?? null
export const currentUserId = (req: Request): string | null => identityOf(req)?.userId ?? null

/** Validates Auth0 access tokens; the library lets invalid ones through as anonymous (authRequired: false). */
const jwtAuth: RequestHandler | null =
  domain && audience ? auth({ issuerBaseURL: `https://${domain}/`, audience, authRequired: false }) : null

const bearerOf = (req: Request) => /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1]

/**
 * Resolves the caller from `Authorization: Bearer <credential>`, where the credential is either
 * an Auth0 JWT or a personal API token (`qz_...`). It only sets the identity - `requireAuthenticated`
 * rejects anonymous requests. Without AUTH0_DOMAIN / AUTH0_AUDIENCE only personal tokens work.
 */
export const authenticate: RequestHandler = async (req, res, next) => {
  const credential = bearerOf(req)
  if (!credential) return next()

  if (credential.startsWith(TOKEN_PREFIX)) {
    try {
      const found = await findActiveToken(credential)
      if (found) {
        identities.set(req, { userId: found.userId, permissions: found.permissions, via: 'token' })
        void touchToken(found.id).catch(() => undefined)
      }
      next()
    } catch (error) {
      next(error)
    }
    return
  }

  if (!jwtAuth) return next()
  jwtAuth(req, res, (error?: unknown) => {
    if (error) return next(error)
    const payload = req.auth?.payload
    if (payload?.sub) {
      const permissions = Array.isArray(payload.permissions) ? (payload.permissions as string[]) : []
      identities.set(req, { userId: payload.sub, permissions, via: 'jwt' })
    }
    next()
  })
}

const unauthorized = (req: Request, res: Response) => {
  const challenge = bearerOf(req)
    ? 'Bearer realm="quiz-api", error="invalid_token", error_description="Token is invalid, expired or revoked"'
    : 'Bearer realm="quiz-api"'
  res
    .status(401)
    .set('WWW-Authenticate', challenge)
    .json({ error: bearerOf(req) ? 'Nieprawidłowy, wygasły lub unieważniony token' : 'Wymagane uwierzytelnienie' })
}

/** The whole API is private: every request needs a valid JWT or personal token. */
export const requireAuthenticated: RequestHandler = (req, res, next) => {
  if (identityOf(req)) next()
  else unauthorized(req, res)
}

/** Only a signed-in session (JWT) - personal tokens cannot mint or manage other tokens. */
export const requireJwt: RequestHandler = (req, res, next) => {
  if (identityOf(req)?.via === 'jwt') next()
  else res.status(403).json({ error: 'Tokenami API nie można zarządzać innymi tokenami - użyj logowania' })
}

/** Role-based permissions: from the JWT's `permissions` claim, or the snapshot stored on the token. */
export const WRITE_QUIZZES = 'write:quizzes'

export const hasPermission = (req: Request, permission: string): boolean =>
  identityOf(req)?.permissions.includes(permission) ?? false

/** 403 when the caller lacks the permission (granted to the `admin` role). */
export const requirePermission =
  (permission: string): RequestHandler =>
  (req, res, next) => {
    if (hasPermission(req, permission)) next()
    else res.status(403).json({ error: 'Ta operacja wymaga roli admin' })
  }
