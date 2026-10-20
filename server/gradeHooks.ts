import type { Answer, QuizResult } from '../src/shared/quiz/engine'
import type { QuizDetail } from '../src/shared/quiz/types'

/**
 * Post-grade event of the quiz module, pure (types only, no DB) so the orchestration can be tested
 * without a database. The grade handler runs the registry; modules such as `learning` and `progress`
 * register their side effects in `server/learningGradeHooks.ts`, so `quizzes` never imports them.
 *
 * Two phases, both sequential and inside the same request (serverless functions may freeze as soon
 * as the response is sent, so fire-and-forget work is not an option):
 * - `beforeSave` may decide what is stored with the attempt (`courseId`, `passed`) and add fields
 *   to the response. An error here propagates: nothing has been saved yet.
 * - `afterSave` runs side effects once the attempt exists. An error here is reported through
 *   `onHookError` and does NOT fail the request or lose the saved attempt: a 500 would make the
 *   client retry and duplicate the attempt.
 */

export interface GradeContext {
  quiz: QuizDetail
  quizId: string
  /** Signed-in user, or null for an anonymous attempt of an ordinary quiz. */
  userId: string | null
  /** The value `userOf(req)` returns; same as `userId` at runtime, typed as a string by the helper. */
  user: string
  answers: Record<string, Answer>
  result: QuizResult
}

export interface BeforeSaveOutcome {
  courseId?: string | null
  passed?: boolean | null
  /** Extra fields merged into the response next to the grade result. */
  response?: Record<string, unknown>
}

export type BeforeSaveHook = (ctx: GradeContext) => Promise<BeforeSaveOutcome | void>
export type AfterSaveHook = (ctx: GradeContext & { attemptId: string }) => Promise<void>

export interface SavedAttempt {
  courseId: string | null
  passed: boolean | null
}

export interface GradeRunResult {
  attemptId: string
  response: Record<string, unknown>
}

export function createGradeRegistry() {
  const beforeSave: BeforeSaveHook[] = []
  const afterSave: AfterSaveHook[] = []

  // registering the same function twice is a no-op, so a module evaluated twice cannot double the effects
  return {
    onBeforeSave(hook: BeforeSaveHook) {
      if (!beforeSave.includes(hook)) beforeSave.push(hook)
    },
    onAfterSave(hook: AfterSaveHook) {
      if (!afterSave.includes(hook)) afterSave.push(hook)
    },
    async run(
      ctx: GradeContext,
      save: (outcome: SavedAttempt) => Promise<string>,
      onHookError: (error: unknown, hookIndex: number) => void | Promise<void>,
    ): Promise<GradeRunResult> {
      let courseId: string | null = null
      let passed: boolean | null = null
      let response: Record<string, unknown> = {}

      for (const hook of beforeSave) {
        const outcome = await hook(ctx)
        if (!outcome) continue
        if (outcome.courseId !== undefined) courseId = outcome.courseId
        if (outcome.passed !== undefined) passed = outcome.passed
        if (outcome.response) response = { ...response, ...outcome.response }
      }

      const attemptId = await save({ courseId, passed })

      for (const [index, hook] of afterSave.entries()) {
        try {
          await hook({ ...ctx, attemptId })
        } catch (error) {
          await onHookError(error, index)
        }
      }

      return { attemptId, response }
    },
  }
}

export type GradeRegistry = ReturnType<typeof createGradeRegistry>
