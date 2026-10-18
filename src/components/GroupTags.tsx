import { Tag } from 'antd'
import { DIFFICULTY_LABELS, POPULARITY_LABELS, SUBJECT_LABELS } from '../shared/quiz/types'
import type { DifficultyCode, PopularityCode, SubjectCode } from '../shared/quiz/types'

const DIFFICULTY_COLORS: Record<DifficultyCode, string> = { easy: 'green', medium: 'gold', hard: 'red' }
const POPULARITY_COLORS: Record<PopularityCode, string> = { core: 'blue', common: 'geekblue', rare: 'default' }

export function DifficultyTag({ value }: { value: DifficultyCode | null | undefined }) {
  return value ? <Tag color={DIFFICULTY_COLORS[value]}>{DIFFICULTY_LABELS[value]}</Tag> : null
}

export function SubjectTag({ value }: { value: SubjectCode | null | undefined }) {
  return value ? <Tag color="purple">{SUBJECT_LABELS[value]}</Tag> : null
}

export function PopularityTag({ value }: { value: PopularityCode | null | undefined }) {
  return value ? <Tag color={POPULARITY_COLORS[value]}>{POPULARITY_LABELS[value]}</Tag> : null
}
