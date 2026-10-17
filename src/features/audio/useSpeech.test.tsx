import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import settingsReducer from '../../features/settings/settingsSlice'
import { useSpeech } from './useSpeech'

describe('useSpeech', () => {
  afterEach(() => cleanup())
  it('returns available false in jsdom', () => {
    const store = configureStore({ reducer: { settings: settingsReducer } })
    const { result } = renderHook(() => useSpeech(), { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> })
    expect(result.current.available).toBe(false)
    expect(typeof result.current.speak).toBe('function')
    result.current.speak('k', ['a'])
    result.current.stop()
  })
})
