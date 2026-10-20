import { api } from '../../app/api'
import type { FeedbackInput } from '../../shared/platform/schema'

export const feedbackApi = api.injectEndpoints({
  endpoints: (build) => ({
    sendFeedback: build.mutation<{ id: string }, FeedbackInput>({
      query: (body) => ({ url: 'feedback', method: 'POST', body }),
      invalidatesTags: ['Feedback'],
    }),
  }),
})

export const {
  useSendFeedbackMutation,
} = feedbackApi
