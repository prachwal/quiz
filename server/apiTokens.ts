import { createHash, randomBytes } from 'node:crypto'
import type { ApiTokenSummary, CreatedApiToken } from '../src/shared/quiz/types'
import { pool } from './quizRepo'

export const TOKEN_PREFIX = 'qz_'
const MAX_ACTIVE_TOKENS = 20

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

interface TokenRow {
  id: string
  name: string
  prefix: string
  permissions: string[]
  created_at: Date
  expires_at: Date | null
  last_used_at: Date | null
}

const toSummary = (row: TokenRow): ApiTokenSummary => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  permissions: row.permissions,
  createdAt: row.created_at.toISOString(),
  expiresAt: row.expires_at?.toISOString() ?? null,
  lastUsedAt: row.last_used_at?.toISOString() ?? null,
})

const COLUMNS = 'id, name, prefix, permissions, created_at, expires_at, last_used_at'

export async function createApiToken(input: {
  userId: string
  name: string
  permissions: string[]
  expiresInDays: number | null
}): Promise<CreatedApiToken | 'limit'> {
  const active = await pool().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM api_tokens
     WHERE user_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [input.userId],
  )
  if (active.rows[0].count >= MAX_ACTIVE_TOKENS) return 'limit'

  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url')
  const { rows } = await pool().query<TokenRow>(
    `INSERT INTO api_tokens (user_id, name, token_hash, prefix, permissions, expires_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END)
     RETURNING ${COLUMNS}`,
    [input.userId, input.name, hashToken(token), token.slice(0, 10), input.permissions, input.expiresInDays],
  )
  return { ...toSummary(rows[0]), token }
}

export async function listApiTokens(userId: string): Promise<ApiTokenSummary[]> {
  const { rows } = await pool().query<TokenRow>(
    `SELECT ${COLUMNS} FROM api_tokens
     WHERE user_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC`,
    [userId],
  )
  return rows.map(toSummary)
}

export async function revokeApiToken(id: string, userId: string): Promise<boolean> {
  const result = await pool().query(
    'UPDATE api_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
    [id, userId],
  )
  return (result.rowCount ?? 0) > 0
}

export interface TokenIdentity {
  id: string
  userId: string
  permissions: string[]
}

/** Resolves a plain token to its owner; null when unknown, revoked or expired. */
export async function findActiveToken(token: string): Promise<TokenIdentity | null> {
  const { rows } = await pool().query<{ id: string; user_id: string; permissions: string[] }>(
    `SELECT id, user_id, permissions FROM api_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [hashToken(token)],
  )
  const row = rows[0]
  return row ? { id: row.id, userId: row.user_id, permissions: row.permissions } : null
}

/** Records usage at most once a minute per token. */
export async function touchToken(id: string): Promise<void> {
  await pool().query(
    `UPDATE api_tokens SET last_used_at = now()
     WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
    [id],
  )
}
