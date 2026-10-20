import { api } from '../../app/api'
import type { AttemptSummary } from '../../shared/quiz/types'

export const resultsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listAttempts: build.query<AttemptSummary[], void>({
      query: () => 'attempts',
      providesTags: ['Attempt'],
    }),
  }),
})

export const {
  useListAttemptsQuery,
} = resultsApi
