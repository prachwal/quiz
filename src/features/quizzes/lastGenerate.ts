/**
 * Remembers what the user asked the generator for, so "Losuj nowy quiz" repeats the same choices
 * (count, difficulty, popularity, variant) instead of only the size of the finished quiz.
 * Kept per generated quiz id in sessionStorage; every access is guarded (storage may be unavailable).
 */
export interface GenerateChoices {
  count: number
  difficulty?: 'easy' | 'medium' | 'hard'
  popularity?: 'core' | 'common' | 'rare'
  variant?: 'mixed' | 'typing' | 'choice' | 'translation'
}

const key = (quizId: string) => `quiz:generate:${quizId}`

export const rememberGenerate = (quizId: string, choices: GenerateChoices) => {
  try {
    sessionStorage.setItem(key(quizId), JSON.stringify(choices))
  } catch {
    // storage unavailable - the next quiz falls back to the finished quiz's size
  }
}

export const recallGenerate = (quizId: string): GenerateChoices | null => {
  try {
    const raw = sessionStorage.getItem(key(quizId))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' && typeof (parsed as GenerateChoices).count === 'number'
      ? (parsed as GenerateChoices)
      : null
  } catch {
    return null
  }
}
