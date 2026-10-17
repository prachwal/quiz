/**
 * Generic quiz engine shared by the frontend (editor/player) and the backend (validation/grading).
 * A question type is one entry in `questionTypes`; adding a type means adding an entry here
 * (plus a renderer in the frontend registry).
 */

export const QUESTION_TYPES = ['single', 'multiple', 'truefalse', 'text'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export interface DraftOption {
  text: string
  isCorrect: boolean
}

export interface DraftQuestion {
  type: QuestionType
  options: DraftOption[]
}

export interface GradableQuestion {
  type: QuestionType
  options: { id: string; text: string; isCorrect: boolean }[]
}

/** What a player submits for one question. */
export interface Answer {
  optionIds?: string[]
  text?: string
}

export interface QuestionTypeDef {
  label: string
  /** Options used to pre-fill the editor when this type is selected. */
  defaultOptions: () => DraftOption[]
  /** Returns an error message, or null when the question is well-formed. */
  validate: (question: DraftQuestion) => string | null
  /** Returns the earned fraction of the points, 0..1. */
  grade: (question: GradableQuestion, answer: Answer | undefined) => number
}

const countCorrect = (options: DraftOption[]) => options.filter((o) => o.isCorrect).length

const normalize = (value: string) => value.trim().toLocaleLowerCase()

const gradeChoice = (question: GradableQuestion, answer: Answer | undefined) => {
  const selected = new Set(answer?.optionIds ?? [])
  const correct = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id))
  if (selected.size !== correct.size) return 0
  for (const id of selected) if (!correct.has(id)) return 0
  return 1
}

export const questionTypes: Record<QuestionType, QuestionTypeDef> = {
  single: {
    label: 'Jednokrotny wybór',
    defaultOptions: () => [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
    ],
    validate: (q) =>
      q.options.length < 2
        ? 'Dodaj co najmniej dwie opcje'
        : countCorrect(q.options) !== 1
          ? 'Zaznacz dokładnie jedną poprawną odpowiedź'
          : null,
    grade: gradeChoice,
  },
  multiple: {
    label: 'Wielokrotny wybór',
    defaultOptions: () => [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
    ],
    validate: (q) =>
      q.options.length < 2
        ? 'Dodaj co najmniej dwie opcje'
        : countCorrect(q.options) < 1
          ? 'Zaznacz co najmniej jedną poprawną odpowiedź'
          : null,
    grade: gradeChoice,
  },
  truefalse: {
    label: 'Prawda / Fałsz',
    defaultOptions: () => [
      { text: 'Prawda', isCorrect: true },
      { text: 'Fałsz', isCorrect: false },
    ],
    validate: (q) =>
      q.options.length !== 2 || countCorrect(q.options) !== 1
        ? 'Pytanie Prawda/Fałsz wymaga dwóch opcji i jednej poprawnej'
        : null,
    grade: gradeChoice,
  },
  text: {
    label: 'Odpowiedź tekstowa',
    defaultOptions: () => [{ text: '', isCorrect: true }],
    validate: (q) =>
      q.options.length < 1 || q.options.some((o) => !o.isCorrect)
        ? 'Podaj co najmniej jedną akceptowaną odpowiedź'
        : null,
    grade: (question, answer) => {
      const given = normalize(answer?.text ?? '')
      if (!given) return 0
      return question.options.some((o) => o.isCorrect && normalize(o.text) === given) ? 1 : 0
    },
  },
}

export interface GradableQuizQuestion extends GradableQuestion {
  id: string
  points: number
  explanation: string
}

export interface QuestionResult {
  questionId: string
  correct: boolean
  earned: number
  points: number
  correctOptionIds: string[]
  correctAnswers: string[]
  explanation: string
}

export interface QuizResult {
  score: number
  maxScore: number
  percent: number
  results: QuestionResult[]
}

export function gradeQuiz(
  questions: GradableQuizQuestion[],
  answers: Record<string, Answer | undefined>,
): QuizResult {
  const results = questions.map((question): QuestionResult => {
    const fraction = questionTypes[question.type].grade(question, answers[question.id])
    const correctOptions = question.options.filter((o) => o.isCorrect)
    return {
      questionId: question.id,
      correct: fraction === 1,
      earned: Math.round(fraction * question.points * 100) / 100,
      points: question.points,
      correctOptionIds: correctOptions.map((o) => o.id),
      correctAnswers: correctOptions.map((o) => o.text),
      explanation: question.explanation,
    }
  })
  const score = results.reduce((sum, r) => sum + r.earned, 0)
  const maxScore = results.reduce((sum, r) => sum + r.points, 0)
  return { score, maxScore, percent: maxScore ? Math.round((score / maxScore) * 100) : 0, results }
}
