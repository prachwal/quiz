import { getDatabase } from '@netlify/database'
import type { z } from 'zod'
import type { DraftOption } from '../src/shared/quiz/engine'
import type { generateInput, quizInput } from '../src/shared/quiz/schema'
import type { DifficultyCode, IrregularVerb, PopularityCode, PatternCode } from '../src/shared/quiz/types'

type ParsedQuiz = z.output<typeof quizInput>
type Question = ParsedQuiz['questions'][number]
export type GenerateOptions = z.output<typeof generateInput>

interface VerbRow {
  id: number
  base: string
  cefr_level: string
  difficulty: DifficultyCode
  popularity: PopularityCode
  pattern: PatternCode
  past_simple: string[]
  past_participle: string[]
  meanings: string[]
  example_en: string
  example_pl: string
}

const VERB_SELECT = `
  SELECT v.id, v.base, v.cefr_level, d.code AS difficulty, p.code AS popularity, pt.code AS pattern,
         v.example_en, v.example_pl,
         ARRAY(SELECT f.form FROM verb_forms f WHERE f.verb_id = v.id AND f.form_type = 'past_simple'
               ORDER BY f.position) AS past_simple,
         ARRAY(SELECT f.form FROM verb_forms f WHERE f.verb_id = v.id AND f.form_type = 'past_participle'
               ORDER BY f.position) AS past_participle,
         ARRAY(SELECT m.translation_pl FROM verb_meanings m WHERE m.verb_id = v.id
               ORDER BY m.position) AS meanings
  FROM irregular_verbs v
  JOIN difficulty_levels d ON d.id = v.difficulty_id
  JOIN popularity_tiers p ON p.id = v.popularity_id
  JOIN verb_patterns pt ON pt.id = v.pattern_id`

const toVerb = (row: VerbRow): IrregularVerb => ({
  id: row.id,
  base: row.base,
  cefrLevel: row.cefr_level,
  difficulty: row.difficulty,
  popularity: row.popularity,
  pattern: row.pattern,
  pastSimple: row.past_simple,
  pastParticiple: row.past_participle,
  meanings: row.meanings,
  exampleEn: row.example_en,
  examplePl: row.example_pl,
})

const query = async (text: string, values: unknown[] = []) =>
  (await getDatabase().pool.query(text, values)) as { rows: VerbRow[] }

export interface VerbFilter {
  level?: string
  difficulty?: DifficultyCode
  popularity?: PopularityCode
  pattern?: PatternCode
  ids?: number[]
}

export async function listVerbs(filter: VerbFilter = {}): Promise<IrregularVerb[]> {
  const conditions = ['v.cefr_level = $1']
  const values: unknown[] = [filter.level ?? 'B2']
  const add = (sql: string, value: unknown) => {
    values.push(value)
    conditions.push(sql.replace('?', `$${values.length}`))
  }
  if (filter.difficulty) add('d.code = ?', filter.difficulty)
  if (filter.popularity) add('p.code = ?', filter.popularity)
  if (filter.pattern) add('pt.code = ?', filter.pattern)
  if (filter.ids) add('v.id = ANY(?::int[])', filter.ids)

  const { rows } = await query(`${VERB_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY v.base`, values)
  return rows.map(toVerb)
}

const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)]

function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** The typical learner mistake: treating the verb as regular ("goed", "striked", "studied"). */
const regularForm = (base: string) =>
  base.endsWith('e') ? `${base}d` : /[^aeiou]y$/.test(base) ? `${base.slice(0, -1)}ied` : `${base}ed`

type Form = 'pastSimple' | 'pastParticiple'
const FORM_LABEL: Record<Form, string> = { pastSimple: 'past simple', pastParticiple: 'past participle' }

const summary = (verb: IrregularVerb) =>
  `${verb.base} – ${verb.pastSimple.join('/')} – ${verb.pastParticiple.join('/')} (${verb.meanings.join(', ')})`

const meaning = (verb: IrregularVerb) => verb.meanings.join(', ')

function formTyping(verb: IrregularVerb, form: Form): Question {
  return {
    type: 'text',
    prompt: `Podaj ${FORM_LABEL[form]} czasownika „${verb.base}” (${meaning(verb)})`,
    explanation: summary(verb),
    points: 1,
    options: verb[form].map((text) => ({ text, isCorrect: true })),
  }
}

function buildChoice(
  prompt: string,
  verb: IrregularVerb,
  correct: string,
  forbidden: string[],
  candidates: string[],
  extraDistractor?: string,
): Question {
  const taken = new Set(forbidden)
  const distractors: string[] = []
  const add = (candidate: string) => {
    if (!taken.has(candidate) && !distractors.includes(candidate)) distractors.push(candidate)
  }
  if (extraDistractor) add(extraDistractor)
  for (const candidate of shuffled(candidates)) {
    if (distractors.length >= 3) break
    add(candidate)
  }
  const options: DraftOption[] = shuffled([
    { text: correct, isCorrect: true },
    ...distractors.slice(0, 3).map((text) => ({ text, isCorrect: false })),
  ])
  return { type: 'single', prompt, explanation: summary(verb), points: 1, options }
}

function formChoice(verb: IrregularVerb, form: Form, pool: IrregularVerb[]): Question {
  const other: Form = form === 'pastSimple' ? 'pastParticiple' : 'pastSimple'
  const candidates = pool.flatMap((v) => v[pick<Form>(['pastSimple', 'pastParticiple'])])
  return buildChoice(
    `Wybierz poprawny ${FORM_LABEL[form]} czasownika „${verb.base}” (${meaning(verb)})`,
    verb,
    pick(verb[form]),
    [...verb[form], ...verb[other], verb.base],
    candidates,
    regularForm(verb.base),
  )
}

/** Verbs sharing a Polish meaning with `verb` are interchangeable answers (e.g. robić = do / make). */
const synonyms = (verb: IrregularVerb, pool: IrregularVerb[]) =>
  pool.filter((v) => v.id === verb.id || v.meanings.some((m) => verb.meanings.includes(m)))

function translationTyping(verb: IrregularVerb, pool: IrregularVerb[]): Question {
  return {
    type: 'text',
    prompt: `Jak jest po angielsku: „${meaning(verb)}”? (podaj bezokolicznik)`,
    explanation: summary(verb),
    points: 1,
    options: synonyms(verb, pool).map((v) => ({ text: v.base, isCorrect: true })),
  }
}

function translationChoice(verb: IrregularVerb, pool: IrregularVerb[]): Question {
  const same = synonyms(verb, pool).map((v) => v.base)
  return buildChoice(
    `Który czasownik oznacza: „${meaning(verb)}”?`,
    verb,
    verb.base,
    same,
    pool.map((v) => v.base),
  )
}

const VARIANT_LABEL: Record<GenerateOptions['variant'], string> = {
  mixed: 'losowy quiz',
  typing: 'wpisywanie odpowiedzi',
  choice: 'wybór odpowiedzi',
  translation: 'tłumaczenie',
}

export interface GeneratedQuiz {
  quiz: ParsedQuiz
  difficulty: DifficultyCode | null
}

/** Builds a quiz from a set of verbs. Distractors come from `pool` (wider than the quizzed set). */
export function buildVerbQuiz(
  verbs: IrregularVerb[],
  pool: IrregularVerb[],
  variant: GenerateOptions['variant'],
  title: string,
  description: string,
): ParsedQuiz {
  const questions = verbs.map((verb): Question => {
    const form = pick<Form>(['pastSimple', 'pastParticiple'])
    switch (variant) {
      case 'typing':
        return formTyping(verb, form)
      case 'choice':
        return formChoice(verb, form, pool)
      case 'translation':
        return Math.random() < 0.5 ? translationTyping(verb, pool) : translationChoice(verb, pool)
      default:
        return Math.random() < 0.5 ? formTyping(verb, form) : formChoice(verb, form, pool)
    }
  })
  return { title, description, questions }
}

export const randomSample = <T>(items: T[], count: number) => shuffled(items).slice(0, count)

/** Random quiz limited by difficulty / popularity group; distractors come from the whole catalog. */
export async function generateIrregularVerbsQuiz(options: GenerateOptions): Promise<GeneratedQuiz> {
  const pool = await listVerbs()
  const filtered = pool.filter(
    (v) =>
      (!options.difficulty || v.difficulty === options.difficulty) &&
      (!options.popularity || v.popularity === options.popularity),
  )
  const chosen = randomSample(filtered, options.count)

  const groups = [options.difficulty && `trudność: ${options.difficulty}`, options.popularity && `popularność: ${options.popularity}`]
    .filter(Boolean)
    .join(', ')
  const quiz = buildVerbQuiz(
    chosen,
    pool,
    options.variant,
    `Czasowniki nieregularne B2 – ${VARIANT_LABEL[options.variant]}`,
    `${chosen.length} pytań z czasowników nieregularnych (poziom B2${groups ? `; ${groups}` : ''}).`,
  )
  return { quiz, difficulty: options.difficulty ?? null }
}
