/**
 * Generic quiz engine shared by the frontend (editor/player) and the backend (validation/grading).
 * A question type is one entry in `questionTypeDefs`; adding a type means adding an entry here
 * (plus a renderer in the frontend registry).
 *
 * Types either use the `options` table (single, multiple, truefalse, text) or carry their own
 * `config` payload (numeric, ordering, matching, cloze). Both shapes can coexist on different
 * questions of one quiz, so old quizzes keep working without a data migration.
 */

export const QUESTION_TYPES = ['single', 'multiple', 'truefalse', 'text', 'numeric', 'ordering', 'matching', 'cloze'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export interface DraftOption {
  text: string
  isCorrect: boolean
}

export interface DraftQuestion {
  type: QuestionType
  /** Present when the definition needs to cross-check the config (cloze markers). */
  prompt?: string
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
 * ordering: items in the correct order. Ids are random and stored with the question, so the
 * shuffled player view never reveals the order through sortable identifiers.
 */
export interface OrderingItem {
  id: string
  text: string
}

export interface OrderingConfig {
  items: OrderingItem[]
}

const ORDERING_MAX_ITEMS = 50

const orderingConfig = (config: unknown): OrderingConfig | null => {
  if (!config || typeof config !== 'object') return null
  const { items } = config as Partial<OrderingConfig>
  if (!Array.isArray(items) || items.length < 2 || items.length > ORDERING_MAX_ITEMS) return null
  const parsed: OrderingItem[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') return null
    const { id, text } = item as Partial<OrderingItem>
    if (typeof id !== 'string' || !id || typeof text !== 'string') return null
    parsed.push({ id, text })
  }
  return { items: parsed }
}

/** Items of an ordering question as they arrived (already shuffled on the server). */
export const orderingItems = (config: unknown): OrderingItem[] => orderingConfig(config)?.items ?? []

/**
 * matching: each pair has its own left and right id, so the player payload never links them.
 * Pairs may share the same right text ("być"/"istnieć" → "be"); the editor gives every pair a
 * distinct rightId, i.e. one tile per pair.
 */
export interface MatchingPair {
  id: string
  rightId: string
  left: string
  right: string
}

export interface MatchingConfig {
  pairs: MatchingPair[]
}

const MATCHING_MAX_PAIRS = 20

const matchingConfig = (config: unknown): MatchingConfig | null => {
  if (!config || typeof config !== 'object') return null
  const { pairs } = config as Partial<MatchingConfig>
  if (!Array.isArray(pairs) || pairs.length < 2 || pairs.length > MATCHING_MAX_PAIRS) return null
  const parsed: MatchingPair[] = []
  for (const pair of pairs) {
    if (!pair || typeof pair !== 'object') return null
    const { id, rightId, left, right } = pair as Partial<MatchingPair>
    if (typeof id !== 'string' || !id) return null
    if (typeof rightId !== 'string' || !rightId) return null
    if (typeof left !== 'string' || typeof right !== 'string') return null
    parsed.push({ id, rightId, left, right })
  }
  return { pairs: parsed }
}

/** Tiles of a matching question as the player received them (server-shuffled on the right). */
const readTiles = (config: unknown, key: 'lefts' | 'rights'): { id: string; text: string }[] => {
  const value = (config as Record<string, unknown> | undefined)?.[key]
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is { id: string; text: string } => Boolean(item) && typeof item === 'object')
    .map((item) => ({ id: String(item.id), text: String(item.text) }))
}

export const matchingLefts = (config: unknown) => readTiles(config, 'lefts')
export const matchingRights = (config: unknown) => readTiles(config, 'rights')

/**
 * cloze: the prompt carries `{{1}}…{{n}}` markers and every marker has a gap with the accepted
 * answers (variants are separate entries, e.g. learnt / learned).
 */
export interface ClozeGap {
  answers: string[]
}

export interface ClozeConfig {
  gaps: ClozeGap[]
}

const CLOZE_MAX_GAPS = 8

/** Marker numbers in the prompt, in the order they appear (duplicates kept). */
export const clozeMarkers = (prompt: string): number[] =>
  [...prompt.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]))

const clozeConfig = (config: unknown): ClozeConfig | null => {
  if (!config || typeof config !== 'object') return null
  const { gaps } = config as Partial<ClozeConfig>
  if (!Array.isArray(gaps) || gaps.length < 1 || gaps.length > CLOZE_MAX_GAPS) return null
  const parsed: ClozeGap[] = []
  for (const gap of gaps) {
    if (!gap || typeof gap !== 'object') return null
    const { answers } = gap as Partial<ClozeGap>
    if (!Array.isArray(answers) || answers.length < 1) return null
    if (answers.some((answer) => typeof answer !== 'string')) return null
    parsed.push({ answers })
  }
  return { gaps: parsed }
}

/** How many gaps the player has to fill in. */
export const clozeGapCount = (config: unknown): number => {
  const view = (config as { gaps?: unknown } | undefined)?.gaps
  if (typeof view === 'number') return view
  return clozeConfig(config)?.gaps.length ?? 0
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

/** Random, stable id for a config item (kept in `questions.config`, never derived from the position). */
export const newItemId = () => Math.random().toString(36).slice(2, 10)

/** In-place Fisher-Yates driven by the injected `rng` (deterministic in tests). */
const shuffleWith = <T>(items: T[], rng: () => number): T[] => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const swap = items[i]
    items[i] = items[j]
    items[j] = swap
  }
  return items
}

/**
 * Shuffles in place until the result is not the author order: a player who never touches the
 * list must not get the correct arrangement for free. Indistinguishable items make every
 * arrangement correct, so retrying is pointless; the rotation is a guaranteed fallback for a
 * degenerate `rng`.
 */
const shuffleAwayFrom = <T>(items: T[], isAuthorOrder: () => boolean, rng: () => number): T[] => {
  for (let attempt = 0; attempt < 8 && isAuthorOrder(); attempt += 1) shuffleWith(items, rng)
  if (items.length >= 2 && isAuthorOrder()) items.push(items.shift() as T)
  return items
}

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
  ordering: {
    label: 'Uporządkowanie elementów',
    usesOptions: false,
    defaultOptions: () => [],
    defaultConfig: (): OrderingConfig => ({
      items: [
        { id: newItemId(), text: '' },
        { id: newItemId(), text: '' },
      ],
    }),
    validate: (q) => {
      const config = orderingConfig(q.config)
      if (!config) return 'Dodaj co najmniej dwa elementy do uporządkowania'
      if (config.items.some((item) => !item.text.trim())) return 'Uzupełnij treść wszystkich elementów'
      if (new Set(config.items.map((item) => item.id)).size !== config.items.length) {
        return 'Elementy muszą mieć unikalne identyfikatory'
      }
      return null
    },
    // 0/1 compared by normalized text, so the answer must be a permutation of every item
    grade: (question, answer) => {
      const config = orderingConfig(question.config)
      const submitted = answer?.order
      if (!config || !submitted || submitted.length !== config.items.length) return 0
      if (new Set(submitted).size !== submitted.length) return 0
      const byId = new Map(config.items.map((item) => [item.id, item.text]))
      const texts = submitted.map((id) => byId.get(id))
      if (texts.some((text) => text === undefined)) return 0
      return texts.every((text, i) => normalizeText(text as string) === normalizeText(config.items[i].text)) ? 1 : 0
    },
    // the server shuffles: a client-side shuffle would hand the correct order to the player
    playerView: (question, rng, withAnswers) => {
      const config = orderingConfig(question.config)
      if (!config) return { options: [] }
      if (withAnswers) return { options: [], config }
      const items = [...config.items]
      const inAuthorOrder = () => items.every((item, i) => item.id === config.items[i].id)
      // indistinguishable items make every arrangement correct, so retrying is pointless
      const indistinguishable = items.every((item) => normalizeText(item.text) === normalizeText(items[0].text))
      if (!indistinguishable) shuffleAwayFrom(items, inAuthorOrder, rng)
      return { options: [], config: { items: items.map(({ id, text }) => ({ id, text })) } }
    },
    describe: (question, answer) => {
      const config = orderingConfig(question.config)
      if (!config) return { answerText: '', correctAnswers: [] }
      const byId = new Map(config.items.map((item) => [item.id, item.text]))
      const given = (answer?.order ?? []).map((id) => byId.get(id)).filter((text): text is string => Boolean(text))
      return {
        answerText: given.map((text, i) => `${i + 1}. ${text}`).join(', '),
        correctAnswers: [config.items.map((item) => item.text).join(' → ')],
      }
    },
  },
  matching: {
    label: 'Dopasowanie par',
    usesOptions: false,
    defaultOptions: () => [],
    defaultConfig: (): MatchingConfig => ({
      pairs: [
        { id: newItemId(), rightId: newItemId(), left: '', right: '' },
        { id: newItemId(), rightId: newItemId(), left: '', right: '' },
      ],
    }),
    validate: (q) => {
      const config = matchingConfig(q.config)
      if (!config) return 'Dodaj co najmniej dwie pary'
      if (config.pairs.some((pair) => !pair.left.trim() || !pair.right.trim())) {
        return 'Uzupełnij obie strony każdej pary'
      }
      if (new Set(config.pairs.map((pair) => pair.id)).size !== config.pairs.length) {
        return 'Pary muszą mieć unikalne identyfikatory'
      }
      if (new Set(config.pairs.map((pair) => pair.rightId)).size !== config.pairs.length) {
        return 'Każda para musi mieć własny kafelek po prawej stronie'
      }
      return null
    },
    // proportional: one point per pair, a right tile can be used by a single pair
    grade: (question, answer) => {
      const config = matchingConfig(question.config)
      const submitted = answer?.pairs
      if (!config || !submitted) return 0
      const textOfRight = new Map(config.pairs.map((pair) => [pair.rightId, normalizeText(pair.right)]))
      const used = new Set<string>()
      let correct = 0
      for (const pair of config.pairs) {
        const chosen = submitted[pair.id]
        if (!chosen || used.has(chosen)) continue
        const chosenText = textOfRight.get(chosen)
        if (chosenText === undefined) continue
        used.add(chosen)
        if (chosenText === normalizeText(pair.right)) correct += 1
      }
      return correct / config.pairs.length
    },
    // lefts keep the author order; rights are shuffled and nothing links them to their left
    playerView: (question, rng, withAnswers) => {
      const config = matchingConfig(question.config)
      if (!config) return { options: [] }
      if (withAnswers) return { options: [], config }
      const rights = config.pairs.map((pair) => ({ id: pair.rightId, text: pair.right }))
      const inAuthorOrder = () => rights.every((right, i) => right.id === config.pairs[i].rightId)
      const indistinguishable = rights.every((right) => normalizeText(right.text) === normalizeText(rights[0].text))
      if (!indistinguishable) shuffleAwayFrom(rights, inAuthorOrder, rng)
      return {
        options: [],
        config: { lefts: config.pairs.map((pair) => ({ id: pair.id, text: pair.left })), rights },
      }
    },
    // one correct answer per pair: the review lists cut/join the array (`slice(0, 3)`, `join(' / ')`)
    describe: (question, answer) => {
      const config = matchingConfig(question.config)
      if (!config) return { answerText: '', correctAnswers: [] }
      const textOfRight = new Map(config.pairs.map((pair) => [pair.rightId, pair.right]))
      const given = config.pairs
        .map((pair) => {
          const chosen = answer?.pairs?.[pair.id]
          const text = chosen ? textOfRight.get(chosen) : undefined
          return text === undefined ? null : `${pair.left} → ${text}`
        })
        .filter((entry): entry is string => entry !== null)
      return {
        answerText: given.join('; '),
        correctAnswers: config.pairs.map((pair) => `${pair.left} → ${pair.right}`),
      }
    },
  },
  cloze: {
    label: 'Uzupełnianie luk',
    usesOptions: false,
    defaultOptions: () => [],
    defaultConfig: (): ClozeConfig => ({ gaps: [{ answers: [] }] }),
    // the markers in the prompt and the gap list must describe the same thing
    validate: (q) => {
      const config = clozeConfig(q.config)
      if (!config) return 'Dodaj co najmniej jedną lukę'
      if (config.gaps.some((gap) => gap.answers.every((answer) => !answer.trim()))) {
        return 'Uzupełnij akceptowane odpowiedzi w każdej luce'
      }
      const markers = clozeMarkers(q.prompt ?? '')
      const expected = config.gaps.map((_, i) => i + 1)
      if (markers.length !== expected.length || markers.some((marker, i) => marker !== expected[i])) {
        return `Treść musi zawierać znaczniki ${expected.map((n) => `{{${n}}}`).join(', ')} - każdy dokładnie raz`
      }
      return null
    },
    // proportional: every gap is worth the same, any accepted variant counts
    grade: (question, answer) => {
      const config = clozeConfig(question.config)
      if (!config) return 0
      const given = answer?.gaps ?? {}
      let correct = 0
      config.gaps.forEach((gap, i) => {
        const value = normalizeText(given[String(i + 1)] ?? '')
        if (!value) return
        if (gap.answers.some((accepted) => normalizeText(accepted) === value)) correct += 1
      })
      return correct / config.gaps.length
    },
    // the accepted answers never reach the player: the view carries only how many gaps there are
    playerView: (question, _rng, withAnswers) => {
      const config = clozeConfig(question.config)
      if (!config) return { options: [] }
      return { options: [], config: withAnswers ? config : { gaps: config.gaps.length } }
    },
    // one correct answer per gap: the review lists cut/join the array
    describe: (question, answer) => {
      const config = clozeConfig(question.config)
      if (!config) return { answerText: '', correctAnswers: [] }
      const given = config.gaps
        .map((_, i) => ({ number: i + 1, text: (answer?.gaps?.[String(i + 1)] ?? '').trim() }))
        .filter((gap) => gap.text)
      return {
        answerText: given.map((gap) => `${gap.number}: ${gap.text}`).join('; '),
        correctAnswers: config.gaps.map((gap, i) => `${i + 1}: ${gap.answers.join(' / ')}`),
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
