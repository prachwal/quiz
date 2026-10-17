import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { api } from '../../app/api'
import { useTimezoneSync } from './useTimezoneSync'

describe('useTimezoneSync', () => {
  afterEach(() => cleanup())
  it('does not crash without data', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: (g) => g().concat(api.middleware) })
    const { result } = renderHook(() => useTimezoneSync(), { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> })
    expect(result).toBeDefined()
  })
})
