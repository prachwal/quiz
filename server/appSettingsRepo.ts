import type { AppSettings } from '../src/shared/quiz/types'
import { normalizeThresholds } from '../src/shared/quiz/scoreBands'
import { pool } from './db'

/** Global settings with defaults for anything never saved (or saved in an invalid shape). */
export async function getAppSettings(): Promise<AppSettings> {
  const { rows } = await pool().query<{ key: string; value: unknown }>('SELECT key, value FROM app_settings')
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  return { scoreThresholds: normalizeThresholds(byKey.get('score_thresholds')) }
}

export async function saveAppSettings(settings: AppSettings, userId: string) {
  await pool().query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('score_thresholds', $1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [JSON.stringify(settings.scoreThresholds), userId],
  )
}
