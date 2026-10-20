import type { BeforeSaveHook, GradeRegistry } from './gradeHooks'
import * as courses from './coursesRepo'

/**
 * What the `learning` module does after a quiz is graded. The `quizzes` route only runs the registry;
 * this handler is registered once in `server/app.ts`, so the quiz module never imports courses for grading.
 * The progress side effects (spaced repetition, streak) live in `server/progressHooks.ts`.
 */

// before the save: a quiz that belongs to a course (a course exam) gets its pass mark and `course` in the response
const coursePass: BeforeSaveHook = async ({ quiz, result }) => {
  if (!quiz.courseId) return { response: { course: null } }
  const course = await courses.coursePassInfo(quiz.courseId)
  const passed = course ? result.percent >= course.passPercent : null
  return {
    courseId: course?.id ?? null,
    passed,
    response: { course: course ? { ...course, passed: passed === true } : null },
  }
}

/** Idempotent: the hook is a module-level constant and the registry ignores repeated registrations. */
export function registerLearningGradeHooks(registry: GradeRegistry) {
  registry.onBeforeSave(coursePass)
}
