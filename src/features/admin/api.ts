import { api } from '../../app/api'
import type { AdminUser, AdminStudentListItem, AppSettings, AdminStudentResults, AdminUsersPage, AuditEntry, FeedbackItem, FeedbackStatus, ManagedRole } from '../../shared/quiz/types'

export const adminApi = api.injectEndpoints({
  endpoints: (build) => ({
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
  useListAdminFeedbackQuery,
  useSetFeedbackStatusMutation,
  useListAdminUsersQuery,
  useSetUserRolesMutation,
  useSetUserBlockedMutation,
  useListAdminStudentsQuery,
  useGetAdminStudentResultsQuery,
  useGetAppSettingsQuery,
  useUpdateAppSettingsMutation,
  useListAuditQuery,
} = adminApi
