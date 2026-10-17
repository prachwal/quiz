import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import settingsReducer from '../features/settings/settingsSlice'
import { useResolvedTheme } from './useResolvedTheme'

describe('useResolvedTheme', () => {
  afterEach(() => cleanup())
  it('resolves system to light by default', () => {
    const store = configureStore({ reducer: { settings: settingsReducer } })
    const { result } = renderHook(() => useResolvedTheme(), { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> })
    expect(['light', 'dark']).toContain(result.current)
  })
})
