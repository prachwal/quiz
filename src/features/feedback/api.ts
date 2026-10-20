import { api } from '../../app/api'
import type { FeedbackInput } from '../../shared/quiz/schema'

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
