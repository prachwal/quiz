import { auth } from 'express-oauth2-jwt-bearer'
import type { Request, RequestHandler, Response } from 'express'
import { TOKEN_PREFIX, findActiveToken, touchToken } from './apiTokens'
import { devAuthEnabled, devIdentity } from './devAuth'
import { metadataUrl, publicOrigin } from './protectedResource'

const domain = process.env.AUTH0_DOMAIN
const audience = process.env.AUTH0_AUDIENCE

/** Who is calling: an Auth0 user (JWT) or a personal API token acting for its owner. */
export interface Identity {
  /** Auth0 user id (`sub`, e.g. "auth0|64f1...") */
  userId: string
  permissions: string[]
  via: 'jwt' | 'token'
  /** From the verified token (custom claims added by the Auth0 Action); JWT sessions only. */
  name?: string
  email?: string
}

const identities = new WeakMap<Request, Identity>()

export const identityOf = (req: Request): Identity | null => identities.get(req) ?? null
export const currentUserId = (req: Request): string | null => identityOf(req)?.userId ?? null

/** Validates Auth0 access tokens; the library lets invalid ones through as anonymous (authRequired: false). */
const jwtAuth: RequestHandler | null =
  domain && audience ? auth({ issuerBaseURL: `https://${domain}/`, audience, authRequired: false }) : null

if (process.env.DEV_AUTH_TOKEN) {
  console.warn(
    devAuthEnabled(process.env)
      ? '[auth] DEV_AUTH_TOKEN bypass is ACTIVE (netlify dev only)'
      : '[auth] DEV_AUTH_TOKEN is set but ignored: the bypass only works under `netlify dev`',
  )
}

const bearerOf = (req: Request) => /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1]

/**
 * Resolves the caller from `Authorization: Bearer <credential>`, where the credential is either
 * an Auth0 JWT or a personal API token (`qz_...`). It only sets the identity - `requireAuthenticated`
 * rejects anonymous requests. Without AUTH0_DOMAIN / AUTH0_AUDIENCE only personal tokens work.
 */
export const authenticate: RequestHandler = async (req, res, next) => {
  const credential = bearerOf(req)
  if (!credential) return next()

  // local development only (netlify dev + DEV_AUTH_TOKEN), see server/devAuth.ts
  const local = devIdentity(process.env, credential)
  if (local) {
    identities.set(req, { userId: local.userId, permissions: local.permissions, via: 'jwt', name: local.name, email: local.email })
    return next()
  }

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
      identities.set(req, {
        userId: payload.sub,
        permissions,
        via: 'jwt',
        name: typeof payload['https://quiz.local/name'] === 'string' ? (payload['https://quiz.local/name'] as string) : undefined,
        email: typeof payload['https://quiz.local/email'] === 'string' ? (payload['https://quiz.local/email'] as string) : undefined,
      })
    }
    next()
  })
}

const unauthorized = (req: Request, res: Response) => {
  // RFC 9728: point OAuth-capable clients (MCP connectors) at the protected resource metadata
  const origin = domain ? publicOrigin(req.headers) : null
  const metadata = origin ? `, resource_metadata="${metadataUrl(origin)}"` : ''
  const challenge = bearerOf(req)
    ? `Bearer realm="quiz-api", error="invalid_token", error_description="Token is invalid, expired or revoked"${metadata}`
    : `Bearer realm="quiz-api"${metadata}`
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
/** Classes, assignments and class reports (role `teacher`). */
export const MANAGE_CLASSES = 'manage:classes'
/** User management, feedback triage and the audit log (admin panel in Settings) - JWT sessions only. */
export const MANAGE_USERS = 'manage:users'

export const hasPermission = (req: Request, permission: string): boolean =>
  identityOf(req)?.permissions.includes(permission) ?? false

/** 403 when the caller lacks the permission (granted to the `admin` role). */
export const requirePermission =
  (permission: string): RequestHandler =>
  (req, res, next) => {
    if (hasPermission(req, permission)) next()
    else res.status(403).json({ error: 'Ta operacja wymaga roli admin' })
  }
