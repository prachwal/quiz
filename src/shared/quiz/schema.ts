import { z } from 'zod'
import { QUESTION_TYPES, questionTypes } from './engine'

export const optionInput = z.object({
  text: z.string().trim().min(1, 'Treść opcji jest wymagana').max(500),
  isCorrect: z.boolean(),
})

export const questionInput = z
  .object({
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(1, 'Treść pytania jest wymagana').max(2000),
    explanation: z.string().trim().max(2000).default(''),
    points: z.number().int().min(1).max(100).default(1),
    options: z.array(optionInput).max(20),
  })
  .superRefine((question, ctx) => {
    const error = questionTypes[question.type].validate(question)
    if (error) ctx.addIssue({ code: 'custom', message: error, path: ['options'] })
  })

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export const POPULARITIES = ['core', 'common', 'rare'] as const
export const QUIZ_VARIANTS = ['mixed', 'typing', 'choice', 'translation'] as const

export const quizInput = z.object({
  difficulty: z.enum(DIFFICULTIES).nullish(),
  title: z.string().trim().min(1, 'Tytuł jest wymagany').max(200),
  description: z.string().trim().max(2000).default(''),
  questions: z.array(questionInput).min(1, 'Dodaj co najmniej jedno pytanie').max(100),
})

export const answerInput = z.object({
  optionIds: z.array(z.string()).max(20).optional(),
  text: z.string().max(2000).optional(),
})

export const gradeInput = z.object({ answers: z.record(z.string(), answerInput) })

export type QuizInput = z.input<typeof quizInput>

export const generateInput = z.object({
  count: z.number().int().min(5).max(50).default(10),
  difficulty: z.enum(DIFFICULTIES).optional(),
  popularity: z.enum(POPULARITIES).optional(),
  /** mixed: typing + choice, typing: all open, choice: all multiple choice, translation: PL -> EN base form */
  variant: z.enum(QUIZ_VARIANTS).default('mixed'),
})

export type GenerateInput = z.input<typeof generateInput>

export const tokenInput = z.object({
  name: z.string().trim().min(1, 'Nazwa tokenu jest wymagana').max(80),
  /** null = never expires */
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).default(90),
  /** Token may write quizzes (only if its creator is allowed to). */
  write: z.boolean().default(false),
})

export type TokenInput = z.input<typeof tokenInput>
