import { describe, it, expect, afterEach } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { Button } from 'antd'
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

const renderResult = (props: Partial<ComponentProps<typeof ResultView>> = {}) => {
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
  return render(
    <Provider store={store}>
      <ConfigProvider>
        <MemoryRouter>
          <AntdApp>
            <ResultView quiz={quiz} questions={questions} answers={answers} result={result} showExplanations={false} onRestart={() => {}} {...props} />
          </AntdApp>
        </MemoryRouter>
      </ConfigProvider>
    </Provider>,
  )
}

describe('ResultView', () => {
  afterEach(() => cleanup())
  it('renders headline', () => {
    renderResult()
    expect(screen.getByText('Znakomicie!')).toBeInTheDocument()
  })
  it('without an outcome keeps the default restart button', () => {
    renderResult()
    expect(screen.getByRole('button', { name: /Zagraj ponownie/  })).toBeInTheDocument()
  })
  it('with an outcome shows its headline, subline and actions instead of the defaults', () => {
    renderResult({
      outcome: {
        tone: 'error',
        headline: 'Wynik testowy',
        subline: 'Podtytuł testowy',
        actions: <Button>Akcja testowa</Button>,
      },
    })
    expect(screen.getByText('Wynik testowy')).toBeInTheDocument()
    expect(screen.getByText('Podtytuł testowy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Akcja testowa/  })).toBeInTheDocument()
    expect(screen.queryByText('Znakomicie!')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Zagraj ponownie/  })).not.toBeInTheDocument()
    // shared buttons stay for every result
    expect(screen.getByRole('link', { name: /Wszystkie quizy/ })).toBeInTheDocument()
  })
  it('renders the footer slot under the hero when given', () => {
    renderResult({ footer: <div>Stopka testowa</div> })
    expect(screen.getByText('Stopka testowa')).toBeInTheDocument()
  })
  it('renders nothing extra without a footer', () => {
    renderResult()
    expect(screen.queryByText('Stopka testowa')).not.toBeInTheDocument()
  })
  it('a review quiz shows the review action slot instead of the restart button', () => {
    renderResult({ quiz: { ...quiz, source: 'review' }, reviewAction: <Button>Akcja powtórki</Button> })
    expect(screen.getByRole('button', { name: /Akcja powtórki/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Zagraj ponownie/ })).not.toBeInTheDocument()
  })
  it('a review quiz without the review action slot falls back to the restart button', () => {
    renderResult({ quiz: { ...quiz, source: 'review' } })
    expect(screen.getByRole('button', { name: /Zagraj ponownie/ })).toBeInTheDocument()
  })
  it('the review action slot is ignored for other quizzes', () => {
    renderResult({ reviewAction: <Button>Akcja powtórki</Button> })
    expect(screen.queryByRole('button', { name: /Akcja powtórki/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Zagraj ponownie/ })).toBeInTheDocument()
  })
})
