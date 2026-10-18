/**
 * Pure analysis of a whole class (used by the MCP tool `class_analyze`), built from the class report.
 * Import-free on purpose so that it can be tested with node:test.
 */

export type ReportStatus = 'todo' | 'in_progress' | 'done'

export interface AnalysisReport {
  assignments: { id: string; title: string; dueAt: string | null }[]
  rows: {
    userId: string
    name: string | null
    email: string | null
    lastActiveDay: string | null
    statuses: Record<string, ReportStatus>
    bestPercent: Record<string, number | null>
  }[]
}

export interface ClassAnalysis {
  students: number
  assignments: {
    title: string
    dueAt: string | null
    overdue: boolean
    done: number
    inProgress: number
    todo: number
    averageBestPercent: number | null
  }[]
  needsAttention: { userId: string; name: string | null; email: string | null; reasons: string[] }[]
  summary: { averageBestPercent: number | null; inactive7Days: number; withOverdueWork: number }
}

const DAY = 24 * 60 * 60 * 1000
const INACTIVE_DAYS = 7
const LOW_PERCENT = 50

export function analyzeClass(report: AnalysisReport, now: Date = new Date()): ClassAnalysis {
  const overdueOf = (dueAt: string | null) => dueAt !== null && new Date(dueAt).getTime() < now.getTime()

  const assignments = report.assignments.map((a) => {
    const statuses = report.rows.map((r) => r.statuses[a.id] ?? 'todo')
    const best = report.rows.flatMap((r) => (r.bestPercent[a.id] == null ? [] : [r.bestPercent[a.id] as number]))
    return {
      title: a.title,
      dueAt: a.dueAt,
      overdue: overdueOf(a.dueAt),
      done: statuses.filter((s) => s === 'done').length,
      inProgress: statuses.filter((s) => s === 'in_progress').length,
      todo: statuses.filter((s) => s === 'todo').length,
      averageBestPercent: best.length ? Math.round(best.reduce((x, y) => x + y, 0) / best.length) : null,
    }
  })

  let inactive7Days = 0
  let withOverdueWork = 0
  const allBest: number[] = []
  const needsAttention: ClassAnalysis['needsAttention'] = []

  for (const row of report.rows) {
    const reasons: string[] = []
    const days = row.lastActiveDay
      ? Math.max(0, Math.floor((now.getTime() - new Date(`${row.lastActiveDay}T00:00:00Z`).getTime()) / DAY))
      : null
    if (days === null) {
      reasons.push('brak jakiejkolwiek aktywności')
      inactive7Days += 1
    } else if (days >= INACTIVE_DAYS) {
      reasons.push(`brak aktywności od ${days} dni`)
      inactive7Days += 1
    }

    const overdue = report.assignments.filter((a) => overdueOf(a.dueAt) && (row.statuses[a.id] ?? 'todo') !== 'done')
    if (overdue.length) {
      reasons.push(`po terminie: ${overdue.map((a) => a.title).join(', ')}`)
      withOverdueWork += 1
    }

    const best = report.assignments.flatMap((a) => (row.bestPercent[a.id] == null ? [] : [row.bestPercent[a.id] as number]))
    allBest.push(...best)
    if (best.length && best.reduce((x, y) => x + y, 0) / best.length < LOW_PERCENT) reasons.push('niska średnia najlepszych wyników')

    if (reasons.length) needsAttention.push({ userId: row.userId, name: row.name, email: row.email, reasons })
  }

  return {
    students: report.rows.length,
    assignments,
    needsAttention,
    summary: {
      averageBestPercent: allBest.length ? Math.round(allBest.reduce((x, y) => x + y, 0) / allBest.length) : null,
      inactive7Days,
      withOverdueWork,
    },
  }
}
