import { describe, it, expect, afterEach } from 'vitest'
import { loadSettings, saveSettings } from './persist'
import { defaultSettings } from '../features/settings/settingsSlice'

describe('persist', () => {
  afterEach(() => localStorage.clear())
  it('loads defaults when empty', () => {
    expect(loadSettings()).toEqual(defaultSettings)
  })

  it('saves and loads settings', () => {
    const s = { ...defaultSettings, compact: true, themeMode: 'dark' as const }
    saveSettings(s)
    expect(loadSettings()).toEqual(s)
  })

  it('falls back on invalid JSON', () => {
    localStorage.setItem('quiz:settings', '{bad')
    expect(loadSettings()).toEqual(defaultSettings)
  })

  it('falls back on invalid fields', () => {
    localStorage.setItem('quiz:settings', JSON.stringify({ themeMode: 'nope', compact: 'x' }))
    const loaded = loadSettings()
    expect(loaded.themeMode).toBe(defaultSettings.themeMode)
    expect(loaded.compact).toBe(defaultSettings.compact)
  })
})
