import { isAnswered } from '../src/shared/quiz/engine'
import type { AfterSaveHook, BeforeSaveHook, GradeRegistry } from './gradeHooks'
import * as courses from './coursesRepo'
import * as progress from './progressRepo'
import * as repo from './quizRepo'
import * as reviews from './reviewsRepo'

/**
 * What the `learning` and `progress` modules do after a quiz is graded. The `quizzes` route only
 * runs the registry; these handlers are registered once in `server/app.ts`, so the quiz module
 * never imports courses, reviews or progress for grading.
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

// after the save: a verb question answered right or wrong moves its spaced-repetition box
const spacedRepetition: AfterSaveHook = async ({ quizId, user, result }) => {
  const verbOfQuestion = await repo.getQuestionVerbs(quizId)
  await reviews.applyResults(
    user,
    result.results.flatMap((r) => {
      const verbId = verbOfQuestion.get(r.questionId)
      return verbId === undefined ? [] : [{ verbId, correct: r.correct }]
    }),
  )
}

// after the save: today's answered/correct counters for the streak and the daily goal
const dailyActivity: AfterSaveHook = async ({ user, answers, result }) => {
  await progress.recordActivity(user, {
    answered: Object.values(answers).filter((a) => isAnswered(a)).length,
    correct: result.results.filter((r) => r.correct).length,
  })
}

/** Idempotent: the hooks are module-level constants and the registry ignores repeated registrations. */
export function registerLearningGradeHooks(registry: GradeRegistry) {
  registry.onBeforeSave(coursePass)
  registry.onAfterSave(spacedRepetition)
  registry.onAfterSave(dailyActivity)
}
