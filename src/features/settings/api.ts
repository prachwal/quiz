import { api } from '../../app/api'
import type { AppSettings } from '../../shared/quiz/types'

/** App-wide settings: read by everybody (score colours), changed by admins (`manage:users`). */
export const settingsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getAppSettings: build.query<AppSettings, void>({
      query: () => 'settings/app',
      providesTags: ['AppSettings'],
    }),
    updateAppSettings: build.mutation<AppSettings, AppSettings>({
      query: (body) => ({ url: 'admin/settings/app', method: 'PUT', body }),
      invalidatesTags: ['AppSettings', 'Audit'],
    }),
  }),
})

export const { useGetAppSettingsQuery, useUpdateAppSettingsMutation } = settingsApi
