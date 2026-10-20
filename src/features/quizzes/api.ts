import { api } from '../../app/api'
import type { Answer } from '../../shared/quiz/engine'
import type { QuizInput } from '../../shared/quiz/schema'
import type { GenerateInput } from '../../shared/quiz/schema'
import type { DifficultyCode, SubjectCode, GradedAttempt, QuizDetail, QuizSummary } from '../../shared/quiz/types'

export const quizzesApi = api.injectEndpoints({
  endpoints: (build) => ({
    listQuizzes: build.query<QuizSummary[], { difficulty?: DifficultyCode; subject?: SubjectCode | 'none'; sort?: 'recent' | 'popular' } | void>({
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
    gradeQuiz: build.mutation<GradedAttempt, { id: string; answers: Record<string, Answer>; questionIds?: string[] }>({
      query: ({ id, answers, questionIds }) => ({ url: `quizzes/${id}/grade`, method: 'POST', body: { answers, questionIds } }),
      invalidatesTags: ['Attempt', 'Course', 'Progress', 'Review', { type: 'Quiz', id: 'LIST' }],
    }),
    generateIrregularVerbsQuiz: build.mutation<QuizDetail, GenerateInput>({
      query: (body) => ({ url: 'quizzes/generate/irregular-verbs', method: 'POST', body }),
    }),
    retryWrong: build.mutation<QuizDetail, { quizId: string; questionIds: string[] }>({
      query: ({ quizId, questionIds }) => ({
        url: `quizzes/${quizId}/retry-wrong`,
        method: 'POST',
        body: { questionIds },
      }),
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
  useRetryWrongMutation,
} = quizzesApi
