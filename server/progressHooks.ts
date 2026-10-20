import { isAnswered } from '../src/shared/quiz/engine'
import type { AfterSaveHook, GradeRegistry } from './gradeHooks'
import type { LessonCompletedHook, LessonRegistry } from './lessonHooks'
import * as progress from './progressRepo'
import * as repo from './quizRepo'
import * as reviews from './reviewsRepo'

/**
 * What the `progress` module does after a quiz is graded and when a lesson is completed: spaced
 * repetition, the streak and the daily goal, and the lesson's verbs entering the review queue.
 * Registered once in `server/app.ts`, so `learning` and `quizzes` never import progress.
 */

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

// the first completion of a lesson: today's lesson counter, then its verbs join the review queue
const lessonCompleted: LessonCompletedHook = async ({ user, lessonId }) => {
  await progress.recordActivity(user, { lessons: 1 })
  await reviews.enqueueLessonVerbs(user, lessonId)
}

/** Idempotent: the hooks are module-level constants and the registries ignore repeated registrations. */
export function registerProgressHooks({ grade, lesson }: { grade: GradeRegistry; lesson: LessonRegistry }) {
  grade.onAfterSave(spacedRepetition)
  grade.onAfterSave(dailyActivity)
  lesson.onCompleted(lessonCompleted)
}
