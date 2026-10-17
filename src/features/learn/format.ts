import type { PatternCode } from '../../shared/quiz/types'

export const formsText = (forms: string[]) => forms.join(' / ')

export const PATTERN_HINTS: Record<PatternCode, string> = {
  AAA: 'Trzy takie same formy',
  ABA: 'Past participle jak bezokolicznik',
  ABB: 'Past simple = past participle',
  ABC: 'Trzy różne formy',
}
