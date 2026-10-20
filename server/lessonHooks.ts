import type { userOf } from './http'

/**
 * Event "a lesson was completed for the first time", import-free and without a DB so the order and the
 * error behaviour can be tested without a database. The lesson route runs the registry only when the
 * completion is new (`result.created`); the `progress` module subscribes in `server/progressHooks.ts`,
 * so the `learning` module never imports progress.
 *
 * Sequential and inside the same request (serverless functions may freeze once the response is sent).
 * Unlike the grade hooks, an error here PROPAGATES: the route answers 500, as it did before the hooks.
 */

export interface LessonCompletedContext {
  /** The value `userOf(req)` returns. */
  user: ReturnType<typeof userOf>
  lessonId: string
}

export type LessonCompletedHook = (ctx: LessonCompletedContext) => Promise<void>

export function createLessonRegistry() {
  const completed: LessonCompletedHook[] = []

  // registering the same function twice is a no-op, so a module evaluated twice cannot double the effects
  return {
    onCompleted(hook: LessonCompletedHook) {
      if (!completed.includes(hook)) completed.push(hook)
    },
    async runCompleted(ctx: LessonCompletedContext) {
      for (const hook of completed) await hook(ctx)
    },
  }
}

export type LessonRegistry = ReturnType<typeof createLessonRegistry>
