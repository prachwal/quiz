import type { AssignmentStatus, ClassReport } from './types'

/** One quoted CSV cell; text starting with = + - @ is prefixed with an apostrophe (spreadsheet formula injection). */
export function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

/** Class report as CSV (one row per student, one column per assignment). */
export function reportToCsv(report: ClassReport): string {
  const cell = csvCell
  const statusLabel: Record<AssignmentStatus, string> = { todo: 'do zrobienia', in_progress: 'w toku', done: 'zrobione' }
  const header = [
    'Uczeń',
    'E-mail',
    'Ukończone lekcje',
    'Ostatnia aktywność',
    'Słabe czasowniki',
    ...report.assignments.map((a) => a.title),
  ]
  const lines = [header.map(cell).join(',')]
  for (const r of report.rows) {
    lines.push(
      [
        r.name ?? r.userId,
        r.email,
        r.lessonsCompleted,
        r.lastActiveDay,
        r.weakVerbs,
        ...report.assignments.map((a) => {
          const best = r.bestPercent[a.id]
          return `${statusLabel[r.statuses[a.id]]}${best === null || best === undefined ? '' : ` (${best}%)`}`
        }),
      ]
        .map(cell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}
