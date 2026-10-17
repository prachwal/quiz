import { computeStreaks, isActiveDay, isValidTimeZone, lastSevenDays, localDay } from '../src/shared/quiz/streaks'
import type { DayActivity } from '../src/shared/quiz/streaks'
import type { ProgressSummary } from '../src/shared/quiz/types'
import { pool } from './quizRepo'

interface ProfileRow {
  daily_goal: number
  timezone: string
}

async function getProfile(userId: string): Promise<ProfileRow> {
  const { rows } = await pool().query<ProfileRow>(
    'SELECT daily_goal, timezone FROM user_profiles WHERE user_id = $1',
    [userId],
  )
  return rows[0] ?? { daily_goal: 10, timezone: 'UTC' }
}

export async function updateProfile(userId: string, patch: { dailyGoal?: number; timezone?: string }) {
  const timezone = patch.timezone && isValidTimeZone(patch.timezone) ? patch.timezone : undefined
  await pool().query(
    `INSERT INTO user_profiles (user_id, daily_goal, timezone)
     VALUES ($1, COALESCE($2::int, 10), COALESCE($3::text, 'UTC'))
     ON CONFLICT (user_id) DO UPDATE SET
       daily_goal = COALESCE($2::int, user_profiles.daily_goal),
       timezone = COALESCE($3::text, user_profiles.timezone),
       updated_at = now()`,
    [userId, patch.dailyGoal ?? null, timezone ?? null],
  )
}

/** Adds to today's activity (day is counted in the user's time zone). */
export async function recordActivity(
  userId: string,
  delta: { answered?: number; correct?: number; lessons?: number },
) {
  const { timezone } = await getProfile(userId)
  const day = localDay(new Date(), timezone)
  await pool().query(
    `INSERT INTO daily_activity (user_id, day, answered, correct, lessons_completed)
     VALUES ($1, $2::date, $3, $4, $5)
     ON CONFLICT (user_id, day) DO UPDATE SET
       answered = daily_activity.answered + EXCLUDED.answered,
       correct = daily_activity.correct + EXCLUDED.correct,
       lessons_completed = daily_activity.lessons_completed + EXCLUDED.lessons_completed`,
    [userId, day, delta.answered ?? 0, delta.correct ?? 0, delta.lessons ?? 0],
  )
}

export async function getSummary(userId: string): Promise<ProgressSummary> {
  const profile = await getProfile(userId)
  const today = localDay(new Date(), profile.timezone)
  const { rows } = await pool().query<{ day: string; answered: number; correct: number; lessons_completed: number }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, answered, correct, lessons_completed
     FROM daily_activity WHERE user_id = $1 ORDER BY day`,
    [userId],
  )
  const byDay = new Map<string, DayActivity>(
    rows.map((r) => [r.day, { day: r.day, answered: r.answered, correct: r.correct, lessons: r.lessons_completed }]),
  )
  const streaks = computeStreaks(
    [...byDay.values()].filter(isActiveDay).map((a) => a.day),
    today,
  )
  const week = lastSevenDays(byDay, today)
  return {
    timezone: profile.timezone,
    dailyGoal: profile.daily_goal,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    today: week[6],
    last7: week,
  }
}
