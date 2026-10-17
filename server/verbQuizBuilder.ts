import type { DraftOption } from '../src/shared/quiz/engine'
import type { IrregularVerb } from '../src/shared/quiz/types'
import type { z } from 'zod'
import type { generateInput, quizInput } from '../src/shared/quiz/schema'

type ParsedQuiz = z.output<typeof quizInput>
type Question = ParsedQuiz['questions'][number]
export type GenerateOptions = z.output<typeof generateInput>

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
export const regularForm = (base: string) =>
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
    const question = (() => {
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
    })()
    return { ...question, verbId: verb.id }
  })
  return { title, description, questions }
}

export const randomSample = <T>(items: T[], count: number) => shuffled(items).slice(0, count)
