/**
 * Generic quiz engine shared by the frontend (editor/player) and the backend (validation/grading).
 * A question type is one entry in `questionTypeDefs`; adding a type means adding an entry here
 * (plus a renderer in the frontend registry).
 *
 * Types either use the `options` table (single, multiple, truefalse, text) or carry their own
 * `config` payload (numeric, ordering, matching, cloze). Both shapes can coexist on different
 * questions of one quiz, so old quizzes keep working without a data migration.
 */

export const QUESTION_TYPES = ['single', 'multiple', 'truefalse', 'text', 'numeric'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export interface DraftOption {
  text: string
  isCorrect: boolean
}

export interface DraftQuestion {
  type: QuestionType
  options: DraftOption[]
  /** Per-type payload for types that do not use `options`. */
  config?: unknown
}

export interface GradableOption {
  id: string
  text: string
  isCorrect: boolean
}

export interface GradableQuestion {
  type: QuestionType
  options: GradableOption[]
  /** Per-type payload for types that do not use `options`. */
  config?: unknown
}

/** What a player submits for one question. */
export interface Answer {
  optionIds?: string[]
  /** Free text: `text` questions and the answer of `numeric`. */
  text?: string
  /** ordering: element ids in the order the player arranged them. */
  order?: string[]
  /** matching: pair id -> the chosen right-hand id. A missing entry = not matched. */
  pairs?: Record<string, string>
  /** cloze: gap number ("1", "2"…) -> the text the player typed. */
  gaps?: Record<string, string>
}

/** Options as the player sees them: no correctness flags at all. */
export interface PlayerOption {
  id: string
  text: string
}

export interface PlayerView {
  options: PlayerOption[]
  config?: unknown
}

export interface DescribeResult {
  /** The player's answer, human readable. */
  answerText: string
  /** Correct answers, one entry per option / pair / gap (used by the result views). */
  correctAnswers: string[]
}

export interface QuestionTypeDef<TConfig = unknown> {
  label: string
  /** true = the question stores its answers in the `options` table. */
  usesOptions: boolean
  /** Options used to pre-fill the editor when this type is selected. */
  defaultOptions: () => DraftOption[]
  /** Empty config for a new question of this type in the editor. */
  defaultConfig?: () => TConfig
  /** Rule check between fields (gap markers vs gaps, duplicates…). Returns an error or null. */
  validate: (question: DraftQuestion & { config?: TConfig }) => string | null
  /** Returns the earned fraction of the points, 0..1. */
  grade: (question: GradableQuestion & { config?: TConfig }, answer: Answer | undefined) => number
  /**
   * What the player may see: no correctness flags, explanations, accepted answers or correct order.
   * `rng` is injected so shuffling is deterministic in tests; `withAnswers` keeps the author's order
   * in the editor view.
   */
  playerView: (question: GradableQuestion & { config?: TConfig }, rng: () => number, withAnswers: boolean) => PlayerView
  /** Human-readable answer and correct answers for the attempt review. */
  describe: (question: GradableQuestion & { config?: TConfig }, answer: Answer | undefined) => DescribeResult
}

const countCorrect = (options: DraftOption[]) => options.filter((o) => o.isCorrect).length

/** numeric: the expected value and an optional tolerance (relative = fraction, 0.01 = 1%). */
export interface NumericConfig {
  answer: number
  tolerance?: { kind: 'absolute' | 'relative'; value: number }
}

/**
 * Parses a player answer: decimal comma or dot, fractions (1/2), exponent notation (1e3),
 * Unicode minus. Commas are always decimal separators, so "1,000" is 1. Units and percentages
 * are rejected (no finite value) - authors put the unit in the prompt.
 */
export const parseNumeric = (raw: string): number | null => {
  const compact = raw.trim().replace(/\u2212/g, '-').replace(/[\s\u00a0\u202f]/g, '')
  if (!compact) return null
  const fraction = /^(-?\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)$/.exec(compact)
  if (fraction) {
    const numerator = Number(fraction[1].replace(',', '.'))
    const denominator = Number(fraction[2].replace(',', '.'))
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null
    return numerator / denominator
  }
  const value = Number(compact.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

const numericConfig = (config: unknown): NumericConfig | null => {
  if (!config || typeof config !== 'object') return null
  const { answer, tolerance } = config as Partial<NumericConfig>
  if (typeof answer !== 'number' || !Number.isFinite(answer)) return null
  if (tolerance !== undefined) {
    if (!tolerance || typeof tolerance !== 'object') return null
    const { kind, value } = tolerance as { kind?: unknown; value?: unknown }
    if (kind !== 'absolute' && kind !== 'relative') return null
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  }
  return { answer, ...(tolerance === undefined ? {} : { tolerance: { kind: tolerance.kind, value: tolerance.value } }) }
}

/** Trim, collapse inner whitespace, case-fold; keeps diacritics (they matter in Polish). */
export const normalizeText = (value: string) =>
  value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()

const gradeChoice = (question: GradableQuestion, answer: Answer | undefined) => {
  const selected = new Set(answer?.optionIds ?? [])
  const correct = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id))
  if (selected.size !== correct.size) return 0
  for (const id of selected) if (!correct.has(id)) return 0
  return 1
}

/** Options as the player sees them: correct answers never leave the server. */
const publicOptions = (question: GradableQuestion): PlayerOption[] =>
  question.options.map((o) => ({ id: o.id, text: o.text }))

const choiceAnswerText = (question: GradableQuestion, answer: Answer | undefined) =>
  (answer?.optionIds ?? [])
    .map((id) => question.options.find((o) => o.id === id)?.text)
    .filter((text): text is string => Boolean(text))
    .join(', ')

const correctOptionTexts = (question: GradableQuestion) =>
  question.options.filter((o) => o.isCorrect).map((o) => o.text)

export const questionTypeDefs = {
  single: {
    label: 'Jednokrotny wybór',
    usesOptions: true,
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
    playerView: (question) => ({ options: publicOptions(question) }),
    describe: (question, answer) => ({
      answerText: choiceAnswerText(question, answer),
      correctAnswers: correctOptionTexts(question),
    }),
  },
  multiple: {
    label: 'Wielokrotny wybór',
    usesOptions: true,
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
    playerView: (question) => ({ options: publicOptions(question) }),
    describe: (question, answer) => ({
      answerText: choiceAnswerText(question, answer),
      correctAnswers: correctOptionTexts(question),
    }),
  },
  truefalse: {
    label: 'Prawda / Fałsz',
    usesOptions: true,
    defaultOptions: () => [
      { text: 'Prawda', isCorrect: true },
      { text: 'Fałsz', isCorrect: false },
    ],
    validate: (q) =>
      q.options.length !== 2 || countCorrect(q.options) !== 1
        ? 'Pytanie Prawda/Fałsz wymaga dwóch opcji i jednej poprawnej'
        : null,
    grade: gradeChoice,
    playerView: (question) => ({ options: publicOptions(question) }),
    describe: (question, answer) => ({
      answerText: choiceAnswerText(question, answer),
      correctAnswers: correctOptionTexts(question),
    }),
  },
  text: {
    label: 'Odpowiedź tekstowa',
    usesOptions: true,
    defaultOptions: () => [{ text: '', isCorrect: true }],
    validate: (q) =>
      q.options.length < 1 || q.options.some((o) => !o.isCorrect)
        ? 'Podaj co najmniej jedną akceptowaną odpowiedź'
        : null,
    grade: (question, answer) => {
      const given = normalizeText(answer?.text ?? '')
      if (!given) return 0
      return question.options.some((o) => o.isCorrect && normalizeText(o.text) === given) ? 1 : 0
    },
    // the accepted answers must not leak to the player, so the view carries no options
    playerView: () => ({ options: [] }),
    describe: (question, answer) => ({
      answerText: (answer?.text ?? '').trim(),
      correctAnswers: correctOptionTexts(question),
    }),
  },
  numeric: {
    label: 'Odpowiedź liczbowa',
    usesOptions: false,
    defaultOptions: () => [],
    defaultConfig: (): NumericConfig => ({ answer: 0 }),
    validate: (q) => {
      const config = numericConfig(q.config)
      if (!config) return 'Podaj poprawną odpowiedź liczbową'
      if (config.tolerance?.kind === 'relative' && config.answer === 0) {
        return 'Dla odpowiedzi 0 użyj tolerancji bezwzględnej'
      }
      return null
    },
    grade: (question, answer) => {
      const config = numericConfig(question.config)
      if (!config) return 0
      const value = parseNumeric(answer?.text ?? '')
      if (value === null) return 0
      const tolerance =
        config.tolerance === undefined
          ? 0
          : config.tolerance.kind === 'absolute'
            ? config.tolerance.value
            : Math.abs(config.answer) * config.tolerance.value
      // guard against floating point artefacts (0.1 + 0.2) when the tolerance is 0
      const epsilon = 1e-9 * Math.max(1, Math.abs(config.answer))
      return Math.abs(value - config.answer) <= tolerance + epsilon ? 1 : 0
    },
    // the expected value and the tolerance must never reach the player
    playerView: () => ({ options: [] }),
    describe: (question, answer) => {
      const config = numericConfig(question.config)
      return {
        answerText: (answer?.text ?? '').trim(),
        correctAnswers: config ? [String(config.answer)] : [],
      }
    },
  },
} satisfies { [T in QuestionType]: QuestionTypeDef<any> }

/** Backwards-compatible name used across the app (editor, schema, tests). */
export const questionTypes = questionTypeDefs

/**
 * A type definition with `config` typed as `unknown`. Config payloads are parsed once at the
 * boundary (save / load), so individual definitions can work with their own shapes internally.
 */
export const typeDef = (type: QuestionType): QuestionTypeDef<unknown> =>
  questionTypeDefs[type] as QuestionTypeDef<unknown>

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
  /** Human-readable player answer; absent in attempts saved before the field existed. */
  answerText?: string
}

export interface QuizResult {
  score: number
  maxScore: number
  percent: number
  results: QuestionResult[]
}

/** True when the player actually filled in something (used by the "answered" counters). */
export const isAnswered = (answer: Answer | undefined): boolean =>
  Boolean(
    answer?.optionIds?.length ||
      answer?.text?.trim() ||
      answer?.order?.length ||
      Object.keys(answer?.pairs ?? {}).length ||
      Object.values(answer?.gaps ?? {}).some((value) => value.trim()),
  )

/** Question prompt without cloze markers (for text-only views: attempt lists, analysis). */
export const promptText = (prompt: string): string => prompt.replace(/\{\{\d+\}\}/g, '___')

export function gradeQuiz(
  questions: GradableQuizQuestion[],
  answers: Record<string, Answer | undefined>,
): QuizResult {
  const results = questions.map((question): QuestionResult => {
    const def = typeDef(question.type)
    const fraction = def.grade(question, answers[question.id])
    const described = def.describe(question, answers[question.id])
    return {
      questionId: question.id,
      correct: fraction === 1,
      earned: Math.round(fraction * question.points * 100) / 100,
      points: question.points,
      correctOptionIds: question.options.filter((o) => o.isCorrect).map((o) => o.id),
      correctAnswers: described.correctAnswers,
      explanation: question.explanation,
      answerText: described.answerText,
    }
  })
  const score = results.reduce((sum, r) => sum + r.earned, 0)
  const maxScore = results.reduce((sum, r) => sum + r.points, 0)
  return { score, maxScore, percent: maxScore ? Math.round((score / maxScore) * 100) : 0, results }
}
