import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { api } from './api'
import { loadSettings, saveSettings } from './persist'
import settingsReducer, { hydrateSettings } from '../features/settings/settingsSlice'

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    settings: settingsReducer,
  },
  preloadedState: { settings: loadSettings() },
  middleware: (getDefault) => getDefault().concat(api.middleware),
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
