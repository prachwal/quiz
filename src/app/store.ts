import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { api } from './api'
import { apiErrorMiddleware } from './errorTracking'
import feedbackUiReducer from '../features/feedback/feedbackSlice'
import { loadSettings, saveSettings } from './persist'
import settingsReducer, { hydrateSettings } from '../features/settings/settingsSlice'

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    settings: settingsReducer,
    feedbackUi: feedbackUiReducer,
  },
  preloadedState: { settings: loadSettings() },
  middleware: (getDefault) => getDefault().concat(api.middleware, apiErrorMiddleware),
})

setupListeners(store.dispatch)

let lastSettings = store.getState().settings
store.subscribe(() => {
  const current = store.getState().settings
  if (current !== lastSettings) {
    lastSettings = current
    saveSettings(current)
  }
})

// keep multiple tabs in sync
window.addEventListener('storage', (event) => {
  if (event.key === 'quiz:settings') {
    store.dispatch(hydrateSettings(loadSettings()))
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
