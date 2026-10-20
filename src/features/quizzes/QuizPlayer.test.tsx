import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../../features/settings/settingsSlice'
import feedbackReducer from '../../features/feedback/feedbackSlice'
import QuizPlayer from './QuizPlayer'

let mockQuiz: unknown = undefined

vi.mock('../../app/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/api')>()
  return {
    ...actual,
    useGetQuizQuery: () => ({ currentData: mockQuiz, error: undefined }),
  }
})

const quiz = {
  id: 'quiz-1',
  title: 'Quiz testowy',
  description: '',
  difficulty: null,
  courseId: 'course-1',
  questions: [{ id: 'q1', type: 'single', prompt: 'Pytanie?', points: 1, options: [] }],
  shuffleQuestions: false,
  shuffleOptions: false,
  sampleSize: null,
}

const renderPlayer = (props: Partial<ComponentProps<typeof QuizPlayer>> = {}) => {
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
  return render(
    <Provider store={store}>
      <ConfigProvider>
        <MemoryRouter>
          <QuizPlayer id="quiz-1" {...props} />
        </MemoryRouter>
      </ConfigProvider>
    </Provider>,
  )
}

describe('QuizPlayer', () => {
  afterEach(() => cleanup())
  it('shows skeleton while loading', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <QuizPlayer id="00000000-0000-0000-0000-000000000000" />
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(document.querySelector('.ant-skeleton')).not.toBeNull()
  })
  it('header back link comes from backLinkFor', () => {
    mockQuiz = quiz
    renderPlayer({ backLinkFor: () => ({ to: '/somewhere', label: 'Wróć testowo' }) })
    expect(screen.getByRole('link', { name: /Wróć testowo/ })).toHaveAttribute('href', '/somewhere')
    expect(screen.queryByText('Wszystkie quizy')).not.toBeInTheDocument()
  })
  it('without backLinkFor the header links to the quiz list', () => {
    mockQuiz = quiz
    renderPlayer()
    expect(screen.getByRole('link', { name: /Wszystkie quizy/ })).toHaveAttribute('href', '/')
  })
})
