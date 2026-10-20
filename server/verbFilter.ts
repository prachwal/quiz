import type { DifficultyCode, PatternCode, PopularityCode } from '../src/shared/quiz/types'

export interface VerbFilter {
  level?: string
  difficulty?: DifficultyCode
  popularity?: PopularityCode
  pattern?: PatternCode
  ids?: number[]
}

export const DEFAULT_VERB_LEVEL = 'B2'

/**
 * WHERE conditions of listVerbs (pure, no database). The CEFR level applies by default (B2) except when the caller
 * lists verb ids and names no level: lessons can hold verbs of any level, so they must not be dropped silently.
 */
export function verbConditions(filter: VerbFilter): { conditions: string[]; values: unknown[] } {
  const conditions: string[] = []
  const values: unknown[] = []
  const add = (sql: string, value: unknown) => {
    values.push(value)
    conditions.push(sql.replace('?', `$${values.length}`))
  }
  if (filter.level !== undefined || !filter.ids) add('v.cefr_level = ?', filter.level ?? DEFAULT_VERB_LEVEL)
  if (filter.difficulty) add('d.code = ?', filter.difficulty)
  if (filter.popularity) add('p.code = ?', filter.popularity)
  if (filter.pattern) add('pt.code = ?', filter.pattern)
  if (filter.ids) add('v.id = ANY(?::int[])', filter.ids)
  return { conditions, values }
}
