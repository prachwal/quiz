import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../../features/settings/settingsSlice'
import feedbackReducer from '../../features/feedback/feedbackSlice'
import VerbSlide from './VerbSlide'

const verb = {
  id: 1,
  base: 'go',
  cefrLevel: 'B2',
  difficulty: 'medium' as const,
  popularity: 'common' as const,
  pattern: 'ABC' as const,
  pastSimple: ['went'],
  pastParticiple: ['gone'],
  meanings: ['iść'],
  exampleEn: 'Go now.',
  examplePl: 'Idź teraz.',
}

describe('VerbSlide', () => {
  afterEach(() => cleanup())
  it('renders verb base and meaning', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <VerbSlide verb={verb as any} index={0} total={3} />
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(screen.getByText('go')).toBeInTheDocument()
    expect(screen.getByText('iść')).toBeInTheDocument()
  })
  it('renders the badge supplied through renderBadge with the verb id', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <VerbSlide verb={verb as any} index={0} total={3} renderBadge={(id) => <span>odznaka {id}</span>} />
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(screen.getByText('odznaka 1')).toBeInTheDocument()
  })
  it('renders no badge without renderBadge', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <VerbSlide verb={verb as any} index={0} total={3} />
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(screen.queryByText(/odznaka/)).not.toBeInTheDocument()
  })
})
