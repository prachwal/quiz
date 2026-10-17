import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useMediaQuery, PHONE_QUERY } from './useMediaQuery'

describe('useMediaQuery', () => {
  afterEach(() => cleanup())
  it('returns a boolean', () => {
    const { result } = renderHook(() => useMediaQuery(PHONE_QUERY))
    expect(typeof result.current).toBe('boolean')
  })
})
