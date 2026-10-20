import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { getAccessToken } from '../features/auth/token'
import type { FeedbackInput, TokenInput } from '../shared/quiz/schema'
import type { AdminUser, AdminStudentListItem, AppSettings, AdminStudentResults, AdminUsersPage, ApiTokenSummary, AuditEntry, FeedbackItem, FeedbackStatus, ManagedRole, CreatedApiToken } from '../shared/quiz/types'

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
    listAdminStudents: build.query<AdminStudentListItem[], { q?: string } | void>({
      query: (params) => ({ url: 'admin/students', params: params ?? undefined }),
      providesTags: ['AdminUsers'],
    }),
    getAdminStudentResults: build.query<AdminStudentResults, string>({
      query: (userId) => `admin/students/${encodeURIComponent(userId)}/results`,
      providesTags: ['AdminUsers', 'Attempt'],
    }),
    getAppSettings: build.query<AppSettings, void>({
      query: () => 'settings/app',
      providesTags: ['AppSettings'],
    }),
    updateAppSettings: build.mutation<AppSettings, AppSettings>({
      query: (body) => ({ url: 'admin/settings/app', method: 'PUT', body }),
      invalidatesTags: ['AppSettings', 'Audit'],
    }),
    listAudit: build.query<AuditEntry[], void>({
      query: () => 'admin/audit',
      providesTags: ['Audit'],
    }),
  }),
})

export const {
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
  useGetAppSettingsQuery,
  useUpdateAppSettingsMutation,
  useListAdminStudentsQuery,
  useGetAdminStudentResultsQuery,
} = api

/** Extracts a readable message from an RTK Query error (incl. server validation issues). */
export function errorMessage(error: unknown): string {
  const data = (error as { data?: { error?: string; issues?: { path: string; message: string }[] } })
    ?.data
  if (data?.issues?.length) return data.issues.map((i) => i.message).join('; ')
  return data?.error ?? 'Nie udało się połączyć z serwerem'
}
