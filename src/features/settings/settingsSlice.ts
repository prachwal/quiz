import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export type ThemeMode = 'light' | 'dark' | 'system'
export type SpeechAccent = 'en-US' | 'en-GB'
export type SpeechRate = 0.8 | 1 | 1.2

export interface SettingsState {
  themeMode: ThemeMode
  compact: boolean
  showExplanations: boolean
  shuffleQuestions: boolean
  speechAccent: SpeechAccent
  speechRate: SpeechRate
  /** Read the verb aloud when a lesson slide changes (needs a user gesture on iOS). */
  autoSpeak: boolean
}

export const defaultSettings: SettingsState = {
  themeMode: 'system',
  compact: false,
  showExplanations: true,
  shuffleQuestions: false,
  speechAccent: 'en-US',
  speechRate: 1,
  autoSpeak: false,
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
    setSpeechAccent(state, action: PayloadAction<SpeechAccent>) {
      state.speechAccent = action.payload
    },
    setSpeechRate(state, action: PayloadAction<SpeechRate>) {
      state.speechRate = action.payload
    },
    setAutoSpeak(state, action: PayloadAction<boolean>) {
      state.autoSpeak = action.payload
    },
    resetSettings: () => defaultSettings,
    hydrateSettings: (_state, action: PayloadAction<SettingsState>) => action.payload,
  },
})

export const {
  setThemeMode,
  setCompact,
  setShowExplanations,
  setShuffleQuestions,
  setSpeechAccent,
  setSpeechRate,
  setAutoSpeak,
  resetSettings,
  hydrateSettings,
} = settingsSlice.actions
export default settingsSlice.reducer
