import { describe, it, expect, afterEach } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../../features/settings/settingsSlice'
import feedbackReducer from '../../features/feedback/feedbackSlice'
import ResultView from './ResultView'

const ID = '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b'
const media = { [ID]: { url: 'https://media.example.com/wyjasnienie.png', width: 320, height: 180 } }

const quiz: any = { id: 'q1', title: 'Quiz', source: null, difficulty: null, questions: [] }
const questions: any = [
  {
    id: 'q1',
    prompt: 'Co to jest?',
    type: 'single',
    points: 1,
    options: [
      { id: 'a', text: `![Kot](media:${ID})`, isCorrect: true },
      { id: 'b', text: 'Pies', isCorrect: false },
    ],
  },
]
const answers: any = { q1: { optionIds: ['b'] } }

const resultWith = (extra: object = {}): any => ({
  score: 0,
  maxScore: 1,
  percent: 0,
  results: [
    {
      questionId: 'q1',
      correct: false,
      earned: 0,
      points: 1,
      correctOptionIds: ['a'],
      correctAnswers: [`![Kot](media:${ID})`],
      explanation: `Kot wygląda tak: ![Kot na macie](media:${ID})`,
    },
  ],
  course: null,
  attemptId: 'a1',
  ...extra,
})

const renderResult = (props: Partial<ComponentProps<typeof ResultView>> = {}) => {
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
  return render(
    <Provider store={store}>
      <ConfigProvider>
        <MemoryRouter>
          <AntdApp>
            <ResultView quiz={quiz} questions={questions} answers={answers} result={resultWith({ media })} showExplanations onRestart={() => {}} {...props} />
          </AntdApp>
        </MemoryRouter>
      </ConfigProvider>
    </Provider>,
  )
}

describe('ResultView with images', () => {
  afterEach(() => cleanup())

  it('shows an explanation image from the result map', () => {
    renderResult()
    const img = screen.getByRole('img', { name: 'Kot na macie' })
    expect(img).toHaveAttribute('src', 'https://media.example.com/wyjasnienie.png')
  })

  it('shows the placeholder when the result map has no entry', () => {
    renderResult({ result: resultWith() })
    expect(screen.queryByRole('img', { name: 'Kot na macie' })).toHaveTextContent('Obraz niedostępny')
  })

  it('renders the choice answers with their images', () => {
    renderResult()
    // the correct answer is an image option: shown in the review as an image, not as raw syntax
    expect(screen.getAllByRole('img', { name: 'Kot' }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/media:/)).not.toBeInTheDocument()
  })
})
