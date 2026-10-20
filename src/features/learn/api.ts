import { api } from '../../app/api'
import type { CourseDetail, CourseSummary, DifficultyCode, IrregularVerb, LessonDetail, PatternCode, PopularityCode, QuizDetail } from '../../shared/quiz/types'

export const learnApi = api.injectEndpoints({
  endpoints: (build) => ({
    listIrregularVerbs: build.query<
      IrregularVerb[],
      { difficulty?: DifficultyCode; popularity?: PopularityCode; pattern?: PatternCode } | void
    >({ query: (params) => ({ url: 'irregular-verbs', params: params ?? undefined }) }),
    listCourses: build.query<CourseSummary[], void>({
      query: () => 'courses',
      providesTags: ['Course'],
    }),
    getCourse: build.query<CourseDetail, string>({
      query: (id) => `courses/${id}`,
      providesTags: ['Course'],
    }),
    getLesson: build.query<LessonDetail, { courseId: string; lessonId: string }>({
      query: ({ courseId, lessonId }) => `courses/${courseId}/lessons/${lessonId}`,
      providesTags: ['Course'],
    }),
    completeLesson: build.mutation<void, { courseId: string; lessonId: string }>({
      query: ({ courseId, lessonId }) => ({
        url: `courses/${courseId}/lessons/${lessonId}/complete`,
        method: 'POST',
      }),
      invalidatesTags: ['Course', 'Progress', 'Review', 'Class', 'MyClass'],
    }),
    startExam: build.mutation<QuizDetail, { courseId: string; count?: number }>({
      query: ({ courseId, count }) => ({ url: `courses/${courseId}/exam`, method: 'POST', body: { count } }),
    }),
  }),
})

export const {
  useListIrregularVerbsQuery,
  useListCoursesQuery,
  useGetCourseQuery,
  useGetLessonQuery,
  useCompleteLessonMutation,
  useStartExamMutation,
} = learnApi
