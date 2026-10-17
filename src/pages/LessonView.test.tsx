import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { api } from '../app/api'
import settingsReducer from '../features/settings/settingsSlice'
import feedbackReducer from '../features/feedback/feedbackSlice'
import LessonView from './LessonView'

describe('LessonView', () => {
  afterEach(() => cleanup())
  it('shows skeleton while loading', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter initialEntries={['/learn/c/lessons/l']}>
            <Routes>
              <Route path="/learn/:courseId/lessons/:lessonId" element={<LessonView />} />
            </Routes>
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(document.querySelector('.ant-skeleton')).not.toBeNull()
  })
})
