import type { AuditEntry, FeedbackContext, FeedbackItem, FeedbackKind, FeedbackStatus } from '../src/shared/quiz/types'
import { pool } from './db'

export async function writeAudit(entry: {
  actorId: string
  actorLabel: string | null
  action: AuditEntry['action']
  targetId?: string | null
  targetLabel?: string | null
  details?: Record<string, unknown>
}) {
  await pool().query(
    `INSERT INTO admin_audit_log (actor_id, actor_label, action, target_id, target_label, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.actorId,
      entry.actorLabel,
      entry.action,
      entry.targetId ?? null,
      entry.targetLabel ?? null,
      JSON.stringify(entry.details ?? {}),
    ],
  )
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  const { rows } = await pool().query(
    `SELECT id, actor_id, actor_label, action, target_id, target_label, details, created_at
     FROM admin_audit_log ORDER BY created_at DESC LIMIT $1`,
    [limit],
  )
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorLabel: r.actor_label,
    action: r.action,
    targetId: r.target_id,
    targetLabel: r.target_label,
    details: r.details,
    createdAt: r.created_at.toISOString(),
  }))
}

const toFeedback = (r: Record<string, any>): FeedbackItem => ({
  id: r.id,
  userId: r.user_id,
  userLabel: r.user_label,
  kind: r.kind,
  message: r.message,
  status: r.status,
  context: r.context,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
})

export async function createFeedback(input: {
  userId: string
  userLabel?: string
  kind: FeedbackKind
  message: string
  context: FeedbackContext
}): Promise<string> {
  const { rows } = await pool().query<{ id: string }>(
    `INSERT INTO feedback (user_id, user_label, kind, message, context)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.userId, input.userLabel ?? null, input.kind, input.message, JSON.stringify(input.context)],
  )
  return rows[0].id
}

export async function listFeedback(status?: FeedbackStatus, limit = 200): Promise<FeedbackItem[]> {
  const { rows } = await pool().query(
    `SELECT * FROM feedback WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC LIMIT $2`,
    [status ?? null, limit],
  )
  return rows.map(toFeedback)
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem | null> {
  const { rows } = await pool().query(
    'UPDATE feedback SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [id, status],
  )
  return rows[0] ? toFeedback(rows[0]) : null
}
