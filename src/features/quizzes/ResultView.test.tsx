import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../../features/settings/settingsSlice'
import feedbackReducer from '../../features/feedback/feedbackSlice'
import ResultView from './ResultView'

const quiz: any = { id: 'q1', title: 'Quiz', source: null, difficulty: null, questions: [] }
const questions: any = [{ id: 'q1', prompt: 'Pyt?', type: 'single', points: 1, options: [{ id: 'a', text: 'A', isCorrect: true }] }]
const answers: any = { q1: { optionIds: ['a'] } }
const result: any = {
  score: 1,
  maxScore: 1,
  percent: 100,
  results: [{ questionId: 'q1', correct: true, earned: 1, points: 1, correctOptionIds: ['a'], correctAnswers: ['A'], explanation: '' }],
  course: null,
  attemptId: 'a1',
}

describe('ResultView', () => {
  afterEach(() => cleanup())
  it('renders headline', () => {
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <AntdApp>
              <ResultView quiz={quiz} questions={questions} answers={answers} result={result} showExplanations={false} onRestart={() => {}} />
            </AntdApp>
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(screen.getByText('Znakomicie!')).toBeInTheDocument()
  })
})
