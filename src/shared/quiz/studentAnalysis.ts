/**
 * Pure analysis of one student's results in a class (used by the MCP tool `analyze_student`).
 * Import-free on purpose so that it can be tested with node:test.
 */

export interface AnalysisAttemptQuestion {
  questionId: string
  prompt: string | null
  correct: boolean
  correctAnswers: string[]
}

export interface AnalysisAttempt {
  assignmentId: string
  title: string
  percent: number
  createdAt: string
  questions: AnalysisAttemptQuestion[]
}

export interface AnalysisAssignment {
  assignmentId: string
  title: string
  dueAt: string | null
  status: 'todo' | 'in_progress' | 'done'
}

export interface AnalysisInput {
  lastActiveDay: string | null
  assignments: AnalysisAssignment[]
  /** In any order. */
  attempts: AnalysisAttempt[]
}

export type Trend = 'improving' | 'declining' | 'stable' | 'insufficient_data'

export interface StudentAnalysis {
  attempts: { count: number; averagePercent: number | null; bestPercent: number | null; latestPercent: number | null; trend: Trend }
  assignments: { total: number; done: number; inProgress: number; todo: number; overdue: string[] }
  daysSinceActive: number | null
  perAssignment: { title: string; attempts: number; bestPercent: number; latestPercent: number }[]
  hardestQuestions: { prompt: string; missed: number; seen: number; correctAnswers: string[] }[]
  flags: string[]
}

const DAY = 24 * 60 * 60 * 1000
const round = (n: number) => Math.round(n)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Last three attempts against everything before them; a change of 5+ points counts as a trend. */
export function trendOf(percentsOldestFirst: number[]): Trend {
  if (percentsOldestFirst.length < 4) return 'insufficient_data'
  const recent = percentsOldestFirst.slice(-3)
  const earlier = percentsOldestFirst.slice(0, -3)
  const delta = (mean(recent) ?? 0) - (mean(earlier) ?? 0)
  return delta >= 5 ? 'improving' : delta <= -5 ? 'declining' : 'stable'
}

export function analyzeStudent(input: AnalysisInput, now: Date = new Date()): StudentAnalysis {
  const attempts = [...input.attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const percents = attempts.map((a) => a.percent)

  const overdue = input.assignments
    .filter((a) => a.status !== 'done' && a.dueAt !== null && new Date(a.dueAt).getTime() < now.getTime())
    .map((a) => a.title)
  const count = (status: AnalysisAssignment['status']) => input.assignments.filter((a) => a.status === status).length

  // last activity: the recorded day, or the latest attempt when no daily activity was recorded
  const lastActive =
    input.lastActiveDay ?? (attempts.length ? attempts[attempts.length - 1].createdAt.slice(0, 10) : null)
  const daysSinceActive = lastActive
    ? Math.max(0, Math.floor((now.getTime() - new Date(`${lastActive}T00:00:00Z`).getTime()) / DAY))
    : null

  const byAssignment = new Map<string, AnalysisAttempt[]>()
  for (const a of attempts) byAssignment.set(a.title, [...(byAssignment.get(a.title) ?? []), a])
  const perAssignment = [...byAssignment.entries()].map(([title, list]) => ({
    title,
    attempts: list.length,
    bestPercent: Math.max(...list.map((a) => a.percent)),
    latestPercent: list[list.length - 1].percent,
  }))

  const questions = new Map<string, { prompt: string; missed: number; seen: number; correctAnswers: string[] }>()
  for (const attempt of attempts) {
    for (const q of attempt.questions) {
      const key = q.prompt ?? q.questionId
      const entry = questions.get(key) ?? { prompt: q.prompt ?? 'Pytanie usunięte z quizu', missed: 0, seen: 0, correctAnswers: [] }
      entry.seen += 1
      if (!q.correct) {
        entry.missed += 1
        entry.correctAnswers = q.correctAnswers.slice(0, 3)
      }
      questions.set(key, entry)
    }
  }
  const hardestQuestions = [...questions.values()]
    .filter((q) => q.missed > 0)
    .sort((a, b) => b.missed - a.missed || b.missed / b.seen - a.missed / a.seen)
    .slice(0, 5)

  const trend = trendOf(percents)
  const average = mean(percents)
  const flags: string[] = []
  if (overdue.length) flags.push(`Zadania po terminie: ${overdue.join(', ')}`)
  if (daysSinceActive === null) flags.push('Uczeń nie ma jeszcze żadnej aktywności')
  else if (daysSinceActive >= 7) flags.push(`Brak aktywności od ${daysSinceActive} dni`)
  if (trend === 'declining') flags.push('Wyniki w ostatnich podejściach spadają')
  if (average !== null && average < 50) flags.push(`Niska średnia (${round(average)}%)`)
  if (input.assignments.length > 0 && count('todo') === input.assignments.length) flags.push('Żadne zadanie nie zostało rozpoczęte')

  return {
    attempts: {
      count: attempts.length,
      averagePercent: average === null ? null : round(average),
      bestPercent: percents.length ? Math.max(...percents) : null,
      latestPercent: percents.length ? percents[percents.length - 1] : null,
      trend,
    },
    assignments: {
      total: input.assignments.length,
      done: count('done'),
      inProgress: count('in_progress'),
      todo: count('todo'),
      overdue,
    },
    daysSinceActive,
    perAssignment,
    hardestQuestions,
    flags,
  }
}
