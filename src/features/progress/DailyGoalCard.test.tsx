import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../../features/settings/settingsSlice'
import feedbackReducer from '../../features/feedback/feedbackSlice'
import DailyGoalCard from './DailyGoalCard'

describe('DailyGoalCard', () => {
  afterEach(() => cleanup())
  it('shows skeleton while loading', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <DailyGoalCard />
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(document.querySelector('.ant-skeleton')).not.toBeNull()
  })

  it('renders progress when data available', async () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <DailyGoalCard />
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(await screen.findByText('Cel dzienny')).toBeInTheDocument()
  })
})
