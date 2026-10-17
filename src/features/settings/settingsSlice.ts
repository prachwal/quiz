import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface SettingsState {
  themeMode: ThemeMode
  compact: boolean
  showShareBar: boolean
}

export const defaultSettings: SettingsState = {
  themeMode: 'system',
  compact: false,
  showShareBar: true,
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: defaultSettings,
  reducers: {
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload
    },
    setCompact(state, action: PayloadAction<boolean>) {
      state.compact = action.payload
    },
    setShowShareBar(state, action: PayloadAction<boolean>) {
      state.showShareBar = action.payload
    },
    resetSettings: () => defaultSettings,
    hydrateSettings: (_state, action: PayloadAction<SettingsState>) => action.payload,
  },
})

export const { setThemeMode, setCompact, setShowShareBar, resetSettings, hydrateSettings } = settingsSlice.actions
export default settingsSlice.reducer
