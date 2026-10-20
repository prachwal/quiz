import { api } from '../../app/api'
import type { ProgressSummary, ReviewSummary, WeakVerb, QuizDetail } from '../../shared/quiz/types'

export const progressApi = api.injectEndpoints({
  endpoints: (build) => ({
    getWeakVerbs: build.query<WeakVerb[], { limit?: number } | void>({
      query: (params) => ({ url: 'progress/weak-verbs', params: params ?? undefined }),
      providesTags: ['Review'],
    }),
    getReviewSummary: build.query<ReviewSummary, void>({
      query: () => 'reviews/summary',
      providesTags: ['Review'],
    }),
    startReview: build.mutation<QuizDetail, { count?: number } | void>({
      query: (body) => ({ url: 'reviews/session', method: 'POST', body: body ?? {} }),
    }),
    getProgress: build.query<ProgressSummary, void>({
      query: () => 'progress/summary',
      providesTags: ['Progress'],
    }),
    updateProfile: build.mutation<ProgressSummary, { dailyGoal?: number; timezone?: string }>({
      query: (body) => ({ url: 'progress/profile', method: 'PATCH', body }),
      invalidatesTags: ['Progress'],
    }),
  }),
})

export const {
  useGetWeakVerbsQuery,
  useGetReviewSummaryQuery,
  useStartReviewMutation,
  useGetProgressQuery,
  useUpdateProfileMutation,
} = progressApi
