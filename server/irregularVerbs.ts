import type { IrregularVerb, DifficultyCode, PopularityCode, PatternCode } from '../src/shared/quiz/types'
import { pool } from './db'
import { buildVerbQuiz, randomSample, type GenerateOptions } from './verbQuizBuilder'
import { verbConditions, type VerbFilter } from './verbFilter'

type VerbRow = {
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
  (await pool().query(text, values)) as { rows: VerbRow[] }

export async function listVerbs(filter: VerbFilter = {}): Promise<IrregularVerb[]> {
  const { conditions, values } = verbConditions(filter)
  const { rows } = await query(`${VERB_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY v.base`, values)
  return rows.map(toVerb)
}

const VARIANT_LABEL: Record<GenerateOptions['variant'], string> = {
  mixed: 'losowy quiz',
  typing: 'wpisywanie odpowiedzi',
  choice: 'wybór odpowiedzi',
  translation: 'tłumaczenie',
}



/** Random quiz limited by difficulty / popularity group; distractors come from the whole catalog. */
export async function generateIrregularVerbsQuiz(options: GenerateOptions) {
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

export { buildVerbQuiz, randomSample } from './verbQuizBuilder'
