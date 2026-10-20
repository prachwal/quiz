import { api } from '../../app/api'
import type { MediaMap } from '../../shared/media/types'
import type { ProgressSummary, ReviewSummary, WeakVerb, QuizDetail } from '../../shared/quiz/types'

/** The weak verbs with the images of their verbs (`media` is empty when no verb has an illustration). */
export interface WeakVerbList {
  items: WeakVerb[]
  media: MediaMap
}

/** The server answers the plain array while no verb has an image, otherwise `{ items, media }`. */
export const toWeakVerbList = (body: unknown): WeakVerbList => {
  if (Array.isArray(body)) return { items: body as WeakVerb[], media: {} }
  const wrapped = body as Partial<WeakVerbList>
  return { items: wrapped.items ?? [], media: wrapped.media ?? {} }
}

export const progressApi = api.injectEndpoints({
  endpoints: (build) => ({
    getWeakVerbs: build.query<WeakVerbList, { limit?: number } | void>({
      query: (params) => ({ url: 'progress/weak-verbs', params: params ?? undefined }),
      transformResponse: toWeakVerbList,
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
