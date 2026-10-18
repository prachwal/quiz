import { SUBJECTS, SUBJECT_LABELS } from './types'
import type { SubjectCode } from './types'

export interface SubjectGroup<T> {
  /** Subject code, or `none` for quizzes without a subject. */
  key: SubjectCode | 'none'
  title: string
  items: T[]
}

/** Groups items by subject in the fixed subject order; unassigned ones go last. Empty groups are dropped. */
export function groupBySubject<T extends { subject: SubjectCode | null }>(items: T[]): SubjectGroup<T>[] {
  const groups: SubjectGroup<T>[] = SUBJECTS.map((key) => ({
    key,
    title: SUBJECT_LABELS[key],
    items: items.filter((item) => item.subject === key),
  }))
  groups.push({ key: 'none', title: 'Bez przedmiotu', items: items.filter((item) => !item.subject) })
  return groups.filter((group) => group.items.length > 0)
}
