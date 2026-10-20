import { E2E_OWNER, E2E_TITLE_PREFIX } from './guard'
import { mediaDeleteViaMcp } from './api'
import { withDb } from './db'

/**
 * Removes everything the suite created for its owner and for the [E2E] titles: verb illustrations first (their
 * media is RESTRICTed), then references, lessons, courses, quizzes, the owner's media (bucket objects too, through
 * the MCP tool) and finally the owner's attempts, reviews, profile and audit rows. Idempotent: a second run finds
 * nothing. Used by the global teardown, so a crashed run leaves nothing behind either.
 */
export async function sweepE2eData(): Promise<{ media: number; quizzes: number; courses: number }> {
  const likeTitle = `${E2E_TITLE_PREFIX}%`
  const summary = await withDb(async (db) => {
    const mediaIds = (await db.query<{ id: string }>('SELECT id::text AS id FROM media WHERE owner_id = $1', [E2E_OWNER])).rows.map((r) => r.id)
    const quizIds = (
      await db.query<{ id: string }>('SELECT id::text AS id FROM quizzes WHERE title LIKE $1 OR owner_id = $2', [likeTitle, E2E_OWNER])
    ).rows.map((r) => r.id)
    const courseIds = (await db.query<{ id: string }>('SELECT id::text AS id FROM courses WHERE title LIKE $1', [likeTitle])).rows.map((r) => r.id)
    const lessonIds = (
      await db.query<{ id: string }>('SELECT id::text AS id FROM lessons WHERE course_id::text = ANY($1::text[])', [courseIds])
    ).rows.map((r) => r.id)

    await db.query('UPDATE irregular_verbs SET image_media_id = NULL WHERE image_media_id = ANY($1::uuid[])', [mediaIds])
    await db.query(
      `DELETE FROM media_refs
        WHERE media_id = ANY($1::uuid[])
           OR (owner_kind = 'quiz' AND owner_id = ANY($2::text[]))
           OR (owner_kind = 'lesson' AND owner_id = ANY($3::text[]))`,
      [mediaIds, quizIds, lessonIds],
    )
    await db.query('DELETE FROM lesson_progress WHERE lesson_id::text = ANY($1::text[])', [lessonIds])
    await db.query('DELETE FROM lesson_verbs WHERE lesson_id::text = ANY($1::text[])', [lessonIds])
    await db.query('DELETE FROM lessons WHERE id::text = ANY($1::text[])', [lessonIds])
    await db.query('DELETE FROM courses WHERE id::text = ANY($1::text[])', [courseIds])
    await db.query('DELETE FROM quizzes WHERE id::text = ANY($1::text[])', [quizIds])
    return { mediaIds, quizIds, courseIds }
  })

  const failures = await mediaDeleteViaMcp(summary.mediaIds)
  if (failures.length > 0) throw new Error(`media_delete refused: ${failures.join('; ')}`)

  await withDb(async (db) => {
    await db.query('DELETE FROM quiz_attempts WHERE user_id = $1', [E2E_OWNER])
    await db.query('DELETE FROM daily_activity WHERE user_id = $1', [E2E_OWNER])
    await db.query('DELETE FROM verb_reviews WHERE user_id = $1', [E2E_OWNER])
    await db.query('DELETE FROM user_profiles WHERE user_id = $1', [E2E_OWNER])
    await db.query('DELETE FROM admin_audit_log WHERE actor_id = $1', [E2E_OWNER])
  })
  return { media: summary.mediaIds.length, quizzes: summary.quizIds.length, courses: summary.courseIds.length }
}
