import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface SettingsState {
  themeMode: ThemeMode
  compact: boolean
  showExplanations: boolean
  shuffleQuestions: boolean
}

export const defaultSettings: SettingsState = {
  themeMode: 'system',
  compact: false,
  showExplanations: true,
  shuffleQuestions: false,
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
    setShowExplanations(state, action: PayloadAction<boolean>) {
      state.showExplanations = action.payload
    },
    setShuffleQuestions(state, action: PayloadAction<boolean>) {
      state.shuffleQuestions = action.payload
    },
    resetSettings: () => defaultSettings,
    hydrateSettings: (_state, action: PayloadAction<SettingsState>) => action.payload,
  },
})

export const { setThemeMode, setCompact, setShowExplanations, setShuffleQuestions, resetSettings, hydrateSettings } = settingsSlice.actions
export default settingsSlice.reducer
