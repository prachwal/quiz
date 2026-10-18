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
    /** Irregular verb the question is about (set by quiz generators; feeds spaced repetition). */
    verbId: z.number().int().positive().optional(),
  })
  .superRefine((question, ctx) => {
    const error = questionTypes[question.type].validate(question)
    if (error) ctx.addIssue({ code: 'custom', message: error, path: ['options'] })
  })

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export const POPULARITIES = ['core', 'common', 'rare'] as const
export const QUIZ_VARIANTS = ['mixed', 'typing', 'choice', 'translation'] as const

/** How many questions are drawn from the whole pool on each play (null = all). */
export const SAMPLE_SIZES = [10, 20, 30] as const

export const quizInput = z.object({
  difficulty: z.enum(DIFFICULTIES).nullish(),
  /** null = follow the player's setting, true/false = override it */
  shuffleQuestions: z.boolean().nullish(),
  shuffleOptions: z.boolean().default(false),
  sampleSize: z
    .union([z.literal(10), z.literal(20), z.literal(30)])
    .nullish(),
  title: z.string().trim().min(1, 'Tytuł jest wymagany').max(200),
  description: z.string().trim().max(2000).default(''),
  questions: z.array(questionInput).min(1, 'Dodaj co najmniej jedno pytanie').max(100),
})

export const answerInput = z.object({
  optionIds: z.array(z.string()).max(20).optional(),
  text: z.string().max(2000).optional(),
})

export const gradeInput = z.object({
  answers: z.record(z.string(), answerInput),
  /** The questions the player was shown (quizzes that draw a sample from a larger pool). */
  questionIds: z.array(z.string()).max(100).optional(),
})

export type QuizInput = z.input<typeof quizInput>

export const generateInput = z.object({
  count: z.number().int().min(5).max(50).default(10),
  difficulty: z.enum(DIFFICULTIES).optional(),
  popularity: z.enum(POPULARITIES).optional(),
  /** mixed: typing + choice, typing: all open, choice: all multiple choice, translation: PL -> EN base form */
  variant: z.enum(QUIZ_VARIANTS).default('mixed'),
  /** Practice only the verbs the user struggles with (difficulty/popularity filters are ignored). */
  onlyWeak: z.boolean().default(false),
})

export type GenerateInput = z.input<typeof generateInput>

export const tokenInput = z.object({
  name: z.string().trim().min(1, 'Nazwa tokenu jest wymagana').max(80),
  /** null = never expires */
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).default(90),
  /** Token may write quizzes (only if its creator is allowed to). */
  write: z.boolean().default(false),
  /** Token may use the teacher's classes and student results (only if its creator is a teacher). */
  classes: z.boolean().default(false),
})

export type TokenInput = z.input<typeof tokenInput>

const shortText = (max: number) => z.string().trim().max(max).optional()

export const feedbackInput = z.object({
  kind: z.enum(['bug', 'idea', 'other']),
  message: z.string().trim().min(3, 'Opisz uwagę (min. 3 znaki)').max(2000),
  userLabel: shortText(120),
  /** Diagnostics attached by the app; every field is optional and length-limited. */
  context: z
    .object({
      route: shortText(300),
      appVersion: shortText(80),
      userAgent: shortText(300),
      viewport: shortText(40),
      theme: shortText(20),
      sentryEventId: shortText(64),
      requestId: shortText(80),
    })
    .default({}),
})

export type FeedbackInput = z.input<typeof feedbackInput>

export const feedbackStatusInput = z.object({ status: z.enum(['new', 'in_progress', 'done']) })

export const rolesInput = z.object({ roles: z.array(z.enum(['admin', 'teacher', 'student'])).max(3) })
export const blockedInput = z.object({ blocked: z.boolean() })

export const profileInput = z
  .object({
    dailyGoal: z.number().int().min(1).max(200).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .refine((v) => v.dailyGoal !== undefined || v.timezone !== undefined, 'Podaj cel dzienny lub strefę czasową')

export const reviewSessionInput = z.object({ count: z.number().int().min(1).max(30).default(10) })

export const retryWrongInput = z.object({ questionIds: z.array(z.string().uuid()).min(1).max(60) })

export const classInput = z.object({ name: z.string().trim().min(2, 'Nazwa klasy (min. 2 znaki)').max(80) })

export const classPatchInput = z
  .object({ name: classInput.shape.name.optional(), joiningOpen: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.joiningOpen !== undefined, 'Podaj nazwę lub stan zapisów')

export const assignmentPatchInput = z.object({ dueAt: z.string().datetime().nullable() })

export const joinInput = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, 'Kod klasy ma 6 znaków'),
})

export const assignmentInput = z
  .object({
    kind: z.enum(['course', 'quiz']),
    courseId: z.string().uuid().optional(),
    quizId: z.string().uuid().optional(),
    dueAt: z.string().datetime().nullish(),
  })
  .refine((v) => (v.kind === 'course' ? Boolean(v.courseId) : Boolean(v.quizId)), 'Wybierz kurs lub quiz')
