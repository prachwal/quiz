/**
 * Local-only authentication bypass for development (curl, MCP clients, scripts, tests) without Auth0.
 *
 * Set `DEV_AUTH_TOKEN` (min. 16 characters) in `.env` and send `Authorization: Bearer <that value>`; the
 * request then acts as `DEV_AUTH_USER_ID` (default `dev|local`) with the permissions of `DEV_AUTH_ROLES`
 * (comma separated, default `admin,teacher`).
 *
 * It can never switch on in a deployment: it needs `NETLIFY_DEV=true` (set only by `netlify dev`), a
 * non-production `NODE_ENV` and no deploy `CONTEXT` other than `dev`. Import-free so that it can be tested.
 */

export interface DevAuthEnv {
  NETLIFY_DEV?: string
  NODE_ENV?: string
  CONTEXT?: string
  DEV_AUTH_TOKEN?: string
  DEV_AUTH_ROLES?: string
  DEV_AUTH_USER_ID?: string
}

export interface DevIdentity {
  userId: string
  permissions: string[]
  roles: string[]
  name: string
  email: string
}

export const MIN_DEV_TOKEN_LENGTH = 16

/** Roles -> API permissions, the same mapping the Auth0 RBAC setup produces. */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['write:quizzes', 'manage:users'],
  teacher: ['manage:classes'],
  student: [],
}

export const devAuthEnabled = (env: DevAuthEnv): boolean =>
  env.NETLIFY_DEV === 'true' &&
  env.NODE_ENV !== 'production' &&
  (env.CONTEXT === undefined || env.CONTEXT === '' || env.CONTEXT === 'dev') &&
  (env.DEV_AUTH_TOKEN?.length ?? 0) >= MIN_DEV_TOKEN_LENGTH

export const parseDevRoles = (value: string | undefined): string[] => {
  const roles = (value ?? 'admin,teacher')
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r in ROLE_PERMISSIONS)
  return [...new Set(roles)]
}

/** Constant-time comparison (no early exit on the first differing character). */
const sameSecret = (a: string, b: string) => {
  let diff = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** The development identity when the credential is the configured dev token (and the bypass is allowed). */
export function devIdentity(env: DevAuthEnv, credential: string | undefined): DevIdentity | null {
  if (!credential || !devAuthEnabled(env) || !sameSecret(credential, env.DEV_AUTH_TOKEN as string)) return null
  const roles = parseDevRoles(env.DEV_AUTH_ROLES)
  return {
    userId: env.DEV_AUTH_USER_ID?.trim() || 'dev|local',
    roles,
    permissions: [...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]))],
    name: 'Dev User',
    email: 'dev@localhost',
  }
}
