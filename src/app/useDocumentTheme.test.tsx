import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useDocumentTheme, THEME_COLORS } from './useDocumentTheme'

describe('useDocumentTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    cleanup()
  })
  it('sets data-theme on document', () => {
    renderHook(() => useDocumentTheme(true))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('THEME_COLORS has light and dark', () => {
    expect(THEME_COLORS.light).toBeDefined()
    expect(THEME_COLORS.dark).toBeDefined()
  })
})
