/**
 * Colour bands for a score in percent: below `low` red, below `high` orange, otherwise green.
 * Thresholds are a global setting (admin, Settings → Aplikacja); these are the defaults. Import-free.
 */
export interface ScoreThresholds {
  low: number
  high: number
}

export const DEFAULT_SCORE_THRESHOLDS: ScoreThresholds = { low: 50, high: 80 }

export type ScoreBand = 'low' | 'mid' | 'high'

export const scoreBand = (percent: number, t: ScoreThresholds = DEFAULT_SCORE_THRESHOLDS): ScoreBand =>
  percent < t.low ? 'low' : percent < t.high ? 'mid' : 'high'

/** Accepts only sane values (1-100, low < high); anything else falls back to the defaults. */
export function normalizeThresholds(value: unknown): ScoreThresholds {
  const v = value as Partial<ScoreThresholds> | null
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 100
  return v && ok(v.low) && ok(v.high) && v.low < v.high ? { low: v.low, high: v.high } : { ...DEFAULT_SCORE_THRESHOLDS }
}
