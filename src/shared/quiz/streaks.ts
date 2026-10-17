/** Pure helpers for daily activity and streaks (no I/O, shared by server and tests). */

/** Calendar day (YYYY-MM-DD) of an instant in the given IANA time zone. */
export function localDay(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  } catch {
    return false
  }
}

const DAY_MS = 86_400_000

const dayNumber = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

/** Day `n` days before/after `day` (calendar arithmetic, immune to DST). */
export function shiftDay(day: string, n: number): string {
  return new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10)
}

export interface StreakResult {
  current: number
  longest: number
  activeToday: boolean
}

/**
 * Streaks from the set of active days. The current streak is not broken until the day ends: if today
 * has no activity yet, it counts the run that ends yesterday.
 */
export function computeStreaks(activeDays: Iterable<string>, today: string): StreakResult {
  const days = [...new Set(activeDays)].map(dayNumber).sort((a, b) => a - b)
  const todayN = dayNumber(today)

  let longest = 0
  let run = 0
  let previous = Number.NaN
  for (const n of days) {
    run = n === previous + 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = n
  }

  const set = new Set(days)
  const activeToday = set.has(todayN)
  let cursor = activeToday ? todayN : todayN - 1
  let current = 0
  while (set.has(cursor)) {
    current++
    cursor--
  }
  return { current, longest, activeToday }
}

export interface DayActivity {
  day: string
  answered: number
  correct: number
  lessons: number
}

/** A day counts towards the streak after at least one answered question or a completed lesson. */
export const isActiveDay = (activity: Pick<DayActivity, 'answered' | 'lessons'>) =>
  activity.answered >= 1 || activity.lessons >= 1

/** The last 7 days ending today, oldest first, with zeros for days without activity. */
export function lastSevenDays(byDay: Map<string, DayActivity>, today: string): DayActivity[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6)
    return byDay.get(day) ?? { day, answered: 0, correct: 0, lessons: 0 }
  })
}
