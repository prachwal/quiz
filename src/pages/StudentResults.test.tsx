import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { api } from '../app/api'
import settingsReducer from '../features/settings/settingsSlice'
import feedbackReducer from '../features/feedback/feedbackSlice'
import StudentResults from './StudentResults'

describe('StudentResults', () => {
  afterEach(() => cleanup())
  it('shows skeleton while loading', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter initialEntries={['/classes/00000000-0000-0000-0000-000000000000/students/u1']}>
            <Routes>
              <Route path="/classes/:id/students/:userId" element={<AntdApp><StudentResults /></AntdApp>} />
            </Routes>
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(document.querySelector('.ant-skeleton')).not.toBeNull()
  })
})
