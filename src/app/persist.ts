import { defaultSettings } from '../features/settings/settingsSlice'
import type { SettingsState } from '../features/settings/settingsSlice'

const STORAGE_KEY = 'quiz:settings'

/** Loads persisted settings, falling back to defaults for missing or invalid values. */
export const loadSettings = (): SettingsState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings
    const saved = JSON.parse(raw) as Partial<SettingsState>
    return {
      themeMode: ['light', 'dark', 'system'].includes(saved.themeMode as string)
        ? saved.themeMode!
        : defaultSettings.themeMode,
      compact: typeof saved.compact === 'boolean' ? saved.compact : defaultSettings.compact,
      showExplanations:
        typeof saved.showExplanations === 'boolean'
          ? saved.showExplanations
          : defaultSettings.showExplanations,
      shuffleQuestions:
        typeof saved.shuffleQuestions === 'boolean'
          ? saved.shuffleQuestions
          : defaultSettings.shuffleQuestions,
      speechAccent: ['en-US', 'en-GB'].includes(saved.speechAccent as string)
        ? saved.speechAccent!
        : defaultSettings.speechAccent,
      speechRate: [0.8, 1, 1.2].includes(saved.speechRate as number) ? saved.speechRate! : defaultSettings.speechRate,
      autoSpeak: typeof saved.autoSpeak === 'boolean' ? saved.autoSpeak : defaultSettings.autoSpeak,
    }
  } catch {
    return defaultSettings
  }
}

export const saveSettings = (settings: SettingsState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable (private mode / quota) - settings just won't persist
  }
}
