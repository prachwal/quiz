import { z } from 'zod'
import { AUTH0_ID_PATTERN } from '../quiz/auth0Id'

/** Request schemas of the platform features (API tokens, feedback, Auth0 user ids), not of the quiz domain. */

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

/** Auth0 user ids, see ../quiz/auth0Id.ts (`google-oauth2|1234`, `oauth2|discord|99`...). */
export const auth0UserId = z.string().trim().min(3).max(200).regex(AUTH0_ID_PATTERN, 'Niepoprawny identyfikator Auth0')
