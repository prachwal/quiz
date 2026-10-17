import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../app/api'
import settingsReducer from '../features/settings/settingsSlice'
import feedbackReducer from '../features/feedback/feedbackSlice'
import QuizNew from './QuizNew'

describe('QuizNew', () => {
  afterEach(() => cleanup())
  it('renders page header', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <AntdApp>
              <QuizNew />
            </AntdApp>
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(screen.getByText('Nowy quiz')).toBeInTheDocument()
  })
})
