import { api } from '../../app/api'
import type { TokenInput } from '../../shared/platform/schema'
import type { ApiTokenSummary, CreatedApiToken } from '../../shared/quiz/types'

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
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
  }),
})

export const {
  useListTokensQuery,
  useCreateTokenMutation,
  useRevokeTokenMutation,
} = authApi
