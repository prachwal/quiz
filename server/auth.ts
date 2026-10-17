import type { Request } from 'express'

/**
 * Placeholder for the Auth0 integration.
 *
 * Returns the Auth0 user id (the `sub` claim of the verified access token, e.g. "auth0|64f1...")
 * or null for anonymous requests. It is stored in `quiz_attempts.user_id` (TEXT).
 *
 * TODO(auth0): validate the Bearer token (e.g. `express-oauth2-jwt-bearer` with the tenant
 * issuer + audience) in an Express middleware and return `req.auth.payload.sub` here.
 * Never trust a user id sent by the client.
 */
export const currentUserId = (_req: Request): string | null => null
