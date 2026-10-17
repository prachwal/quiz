import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { getAccessToken } from '../features/auth/token'
import type { Answer } from '../shared/quiz/engine'
import type { QuizInput } from '../shared/quiz/schema'
import type { FeedbackInput, GenerateInput, TokenInput } from '../shared/quiz/schema'
import type {
  AdminUser,
  AdminUsersPage,
  ApiTokenSummary,
  AuditEntry,
  FeedbackItem,
  FeedbackStatus,
  ManagedRole,
  AttemptSummary,
  CreatedApiToken,
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
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    prepareHeaders: async (headers) => {
      const token = await getAccessToken()
      if (token) headers.set('authorization', `Bearer ${token}`)
      return headers
    },
  }),
  tagTypes: ['Quiz', 'Attempt', 'Course', 'Token', 'AdminUsers', 'Feedback', 'Audit'],
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
    listTokens: build.query<ApiTokenSummary[], void>({
      query: () => 'tokens',
      providesTags: ['Token'],
    }),
    createToken: build.mutation<CreatedApiToken, TokenInput>({
      query: (body) => ({ url: 'tokens', method: 'POST', body }),
      invalidatesTags: ['Token'],
    }),
    revokeToken: build.mutation<void, string>({
      query: (id) => ({ url: `tokens/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Token'],
    }),
    sendFeedback: build.mutation<{ id: string }, FeedbackInput>({
      query: (body) => ({ url: 'feedback', method: 'POST', body }),
      invalidatesTags: ['Feedback'],
    }),
    listAdminFeedback: build.query<FeedbackItem[], FeedbackStatus | void>({
      query: (status) => ({ url: 'admin/feedback', params: status ? { status } : undefined }),
      providesTags: ['Feedback'],
    }),
    setFeedbackStatus: build.mutation<FeedbackItem, { id: string; status: FeedbackStatus }>({
      query: ({ id, status }) => ({ url: `admin/feedback/${id}`, method: 'PATCH', body: { status } }),
      invalidatesTags: ['Feedback', 'Audit'],
    }),
    listAdminUsers: build.query<AdminUsersPage, { q: string; page: number }>({
      query: (params) => ({ url: 'admin/users', params }),
      providesTags: ['AdminUsers'],
    }),
    setUserRoles: build.mutation<AdminUser, { id: string; roles: ManagedRole[] }>({
      query: ({ id, roles }) => ({
        url: `admin/users/${encodeURIComponent(id)}/roles`,
        method: 'PUT',
        body: { roles },
      }),
      invalidatesTags: ['AdminUsers', 'Audit'],
    }),
    setUserBlocked: build.mutation<AdminUser, { id: string; blocked: boolean }>({
      query: ({ id, blocked }) => ({
        url: `admin/users/${encodeURIComponent(id)}/blocked`,
        method: 'PATCH',
        body: { blocked },
      }),
      invalidatesTags: ['AdminUsers', 'Audit'],
    }),
    listAudit: build.query<AuditEntry[], void>({
      query: () => 'admin/audit',
      providesTags: ['Audit'],
    }),
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
  useListTokensQuery,
  useCreateTokenMutation,
  useRevokeTokenMutation,
  useSendFeedbackMutation,
  useListAdminFeedbackQuery,
  useSetFeedbackStatusMutation,
  useListAdminUsersQuery,
  useSetUserRolesMutation,
  useSetUserBlockedMutation,
  useListAuditQuery,
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
