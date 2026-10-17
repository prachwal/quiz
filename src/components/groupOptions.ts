import { DIFFICULTY_LABELS, POPULARITY_LABELS } from '../shared/quiz/types'
import type { DifficultyCode, PopularityCode } from '../shared/quiz/types'

export const difficultyOptions = (Object.keys(DIFFICULTY_LABELS) as DifficultyCode[]).map((value) => ({
  value,
  label: DIFFICULTY_LABELS[value],
}))

export const popularityOptions = (Object.keys(POPULARITY_LABELS) as PopularityCode[]).map((value) => ({
  value,
  label: POPULARITY_LABELS[value],
}))
