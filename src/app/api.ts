import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { getAccessToken } from '../features/auth/token'

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
  tagTypes: ['Quiz', 'Attempt', 'Course', 'Token', 'AdminUsers', 'Feedback', 'Audit', 'Progress', 'Review', 'Class', 'MyClass', 'AppSettings'],
  endpoints: () => ({}),
})

/** Extracts a readable message from an RTK Query error (incl. server validation issues). */
export function errorMessage(error: unknown): string {
  const data = (error as { data?: { error?: string; issues?: { path: string; message: string }[] } })
    ?.data
  if (data?.issues?.length) return data.issues.map((i) => i.message).join('; ')
  return data?.error ?? 'Nie udało się połączyć z serwerem'
}
