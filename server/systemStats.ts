import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { MIN_ATTEMPTS, RECOVERED_BOX, WEAK_ACCURACY } from '../src/shared/quiz/weak'
import { pool } from './db'

/**
 * Counts for the admin's `system_stats` tool: one SQL round trip (scalar subqueries, no lists) plus the
 * migration folder when the runtime can see it.
 */

export interface SystemStats {
  users: number
  classes: number
  quizzes: number
  generatedQuizzes: number
  attempts: number
  attemptsLast7Days: number
  feedbackNew: number
  activeTokens: number
  /** Verb review rows that are weak (same rule as the weak-verb ranking). */
  weakVerbRows: number
  db: {
    migrationsApplied: number
    latestMigration: string | null
    /** true/false when the migration folder is readable, null when it is not (see `schemaNote`). */
    schemaCurrent: boolean | null
    schemaNote: string | null
  }
  appVersion: string | null
}

/** Names of the migration files on disk, oldest first; null when the folder is not in this runtime. */
export function migrationFiles(dir = join(process.cwd(), 'db', 'migrations')): string[] | null {
  try {
    return readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
  } catch {
    return null
  }
}

export async function systemStats(): Promise<SystemStats> {
  const { rows } = await pool().query<Record<string, number | string | null>>(
    `SELECT
       (SELECT COUNT(*)::int FROM user_profiles) AS users,
       (SELECT COUNT(*)::int FROM classes WHERE archived_at IS NULL) AS classes,
       (SELECT COUNT(*)::int FROM quizzes WHERE kind = 'manual') AS quizzes,
       (SELECT COUNT(*)::int FROM quizzes WHERE kind = 'generated') AS generated_quizzes,
       (SELECT COUNT(*)::int FROM quiz_attempts) AS attempts,
       (SELECT COUNT(*)::int FROM quiz_attempts WHERE created_at > now() - interval '7 days') AS attempts_last_7_days,
       (SELECT COUNT(*)::int FROM feedback WHERE status = 'new') AS feedback_new,
       (SELECT COUNT(*)::int FROM api_tokens WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) AS active_tokens,
       (SELECT COUNT(*)::int FROM verb_reviews
          WHERE attempts >= $1 AND correct::float / NULLIF(attempts, 0) < $2 AND box < $3) AS weak_verb_rows,
       (SELECT COUNT(*)::int FROM schema_migrations) AS migrations_applied,
       (SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1) AS latest_migration`,
    [MIN_ATTEMPTS, WEAK_ACCURACY, RECOVERED_BOX],
  )
  const r = rows[0]
  const files = migrationFiles()
  const latest = (r.latest_migration as string | null) ?? null
  const schemaCurrent = files === null || latest === null ? null : files.at(-1) === latest
  return {
    users: r.users as number,
    classes: r.classes as number,
    quizzes: r.quizzes as number,
    generatedQuizzes: r.generated_quizzes as number,
    attempts: r.attempts as number,
    attemptsLast7Days: r.attempts_last_7_days as number,
    feedbackNew: r.feedback_new as number,
    activeTokens: r.active_tokens as number,
    weakVerbRows: r.weak_verb_rows as number,
    db: {
      migrationsApplied: r.migrations_applied as number,
      latestMigration: latest,
      schemaCurrent,
      schemaNote:
        files === null
          ? 'Folder db/migrations nie jest dostępny w tym środowisku (serverless bundle), więc zgodności schematu nie sprawdzono.'
          : latest === null
            ? 'Brak zastosowanych migracji w schema_migrations.'
            : null,
    },
    appVersion: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  }
}
