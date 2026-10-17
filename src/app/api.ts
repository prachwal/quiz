import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { Answer } from '../shared/quiz/engine'
import type { QuizInput } from '../shared/quiz/schema'
import type { GenerateInput } from '../shared/quiz/schema'
import type {
  AttemptSummary,
  CourseDetail,
  CourseSummary,
  DifficultyCode,
  GradedAttempt,
  IrregularVerb,
  LessonDetail,
  PatternCode,
  PopularityCode,
  QuizDetail,
  QuizSummary,
} from '../shared/quiz/types'

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Quiz', 'Attempt', 'Course'],
  endpoints: (build) => ({
    listQuizzes: build.query<QuizSummary[], { difficulty?: DifficultyCode; sort?: 'recent' | 'popular' } | void>({
      query: (params) => ({ url: 'quizzes', params: params ?? undefined }),
      providesTags: (result) => [
        { type: 'Quiz', id: 'LIST' },
        ...(result ?? []).map(({ id }) => ({ type: 'Quiz' as const, id })),
      ],
    }),
    /** `withAnswers` returns the editor view (correct answers included). */
    getQuiz: build.query<QuizDetail, { id: string; withAnswers?: boolean }>({
      query: ({ id, withAnswers }) => `quizzes/${id}${withAnswers ? '?include=answers' : ''}`,
      providesTags: (_result, _error, { id }) => [{ type: 'Quiz', id }],
    }),
    createQuiz: build.mutation<QuizDetail, QuizInput>({
      query: (body) => ({ url: 'quizzes', method: 'POST', body }),
      invalidatesTags: [{ type: 'Quiz', id: 'LIST' }],
    }),
    updateQuiz: build.mutation<QuizDetail, { id: string; body: QuizInput }>({
      query: ({ id, body }) => ({ url: `quizzes/${id}`, method: 'PUT', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Quiz', id },
        { type: 'Quiz', id: 'LIST' },
      ],
    }),
    deleteQuiz: build.mutation<void, string>({
      query: (id) => ({ url: `quizzes/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Quiz', id },
        { type: 'Quiz', id: 'LIST' },
      ],
    }),
    gradeQuiz: build.mutation<GradedAttempt, { id: string; answers: Record<string, Answer> }>({
      query: ({ id, answers }) => ({ url: `quizzes/${id}/grade`, method: 'POST', body: { answers } }),
      invalidatesTags: ['Attempt', 'Course', { type: 'Quiz', id: 'LIST' }],
    }),
    generateIrregularVerbsQuiz: build.mutation<QuizDetail, GenerateInput>({
      query: (body) => ({ url: 'quizzes/generate/irregular-verbs', method: 'POST', body }),
    }),
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
      invalidatesTags: ['Course'],
    }),
    startExam: build.mutation<QuizDetail, { courseId: string; count?: number }>({
      query: ({ courseId, count }) => ({ url: `courses/${courseId}/exam`, method: 'POST', body: { count } }),
    }),
    listAttempts: build.query<AttemptSummary[], void>({
      query: () => 'attempts',
      providesTags: ['Attempt'],
    }),
  }),
})

export const {
  useListQuizzesQuery,
  useGetQuizQuery,
  useCreateQuizMutation,
  useUpdateQuizMutation,
  useDeleteQuizMutation,
  useGradeQuizMutation,
  useGenerateIrregularVerbsQuizMutation,
  useListIrregularVerbsQuery,
  useListAttemptsQuery,
  useListCoursesQuery,
  useGetCourseQuery,
  useGetLessonQuery,
  useCompleteLessonMutation,
  useStartExamMutation,
} = api

/** Extracts a readable message from an RTK Query error (incl. server validation issues). */
export function errorMessage(error: unknown): string {
  const data = (error as { data?: { error?: string; issues?: { path: string; message: string }[] } })
    ?.data
  if (data?.issues?.length) return data.issues.map((i) => i.message).join('; ')
  return data?.error ?? 'Nie udało się połączyć z serwerem'
}
