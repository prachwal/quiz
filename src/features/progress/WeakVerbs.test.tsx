import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../settings/settingsSlice'
import type { WeakVerb } from '../../shared/quiz/types'
import WeakVerbs from './WeakVerbs'

// the query result is set per test; the default is the loading state
let weakResult: Record<string, unknown> = { isLoading: true }
vi.mock('./api', () => ({ useGetWeakVerbsQuery: () => weakResult }))

const IMAGE = '0b9c2f7e-7a4e-4d55-9d0a-2f6f3c1a9e11'
const weakEntry = (imageMediaId?: string): WeakVerb => ({
  verb: {
    id: 1,
    base: 'go',
    cefrLevel: 'B2',
    difficulty: 'medium',
    popularity: 'common',
    pattern: 'ABC',
    pastSimple: ['went'],
    pastParticiple: ['gone'],
    meanings: ['iść'],
    exampleEn: 'ex',
    examplePl: 'przyklad',
    ...(imageMediaId ? { imageMediaId } : {}),
  },
  attempts: 4,
  correct: 1,
  accuracy: 0.25,
  lastWrongAt: null,
})

const renderWeak = () => {
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer }, middleware: (g) => g().concat(api.middleware) })
  return render(
    <Provider store={store}>
      <ConfigProvider>
        <MemoryRouter>
          <AntdApp>
            <WeakVerbs />
          </AntdApp>
        </MemoryRouter>
      </ConfigProvider>
    </Provider>,
  )
}

describe('WeakVerbs', () => {
  afterEach(() => {
    cleanup()
    weakResult = { isLoading: true }
  })

  it('shows skeleton while loading', () => {
    renderWeak()
    expect(document.querySelector('.ant-skeleton')).not.toBeNull()
  })

  it('renders no illustration for a verb without an image', () => {
    weakResult = { data: { items: [weakEntry()], media: {} } }
    const { container } = renderWeak()
    expect(container.textContent).toContain('go')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.media-placeholder')).toBeNull()
  })

  it('shows the illustration of a verb that has an image', () => {
    const url = `https://media.test/media/2026/${IMAGE}.webp`
    weakResult = { data: { items: [weakEntry(IMAGE)], media: { [IMAGE]: { url, width: 400, height: 300 } } } }
    const { container } = renderWeak()
    const img = container.querySelector('img.media-image')
    expect(img?.getAttribute('src')).toBe(url)
    expect(img?.getAttribute('alt')).toBe('go')
  })
})
