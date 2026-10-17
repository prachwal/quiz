import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useFocusMode } from './useFocusMode'

describe('useFocusMode', () => {
  afterEach(() => {
    document.body.classList.remove('focus-mode')
    cleanup()
  })
  it('adds focus-mode class when enabled', () => {
    const { unmount } = renderHook(() => useFocusMode(true))
    expect(document.body.classList.contains('focus-mode')).toBe(true)
    unmount()
    expect(document.body.classList.contains('focus-mode')).toBe(false)
  })

  it('does nothing when disabled', () => {
    renderHook(() => useFocusMode(false))
    expect(document.body.classList.contains('focus-mode')).toBe(false)
  })
})
