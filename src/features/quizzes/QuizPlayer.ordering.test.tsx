import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import settingsReducer from '../../features/settings/settingsSlice'
import feedbackReducer from '../../features/feedback/feedbackSlice'
import { api } from '../../app/api'
import QuizPlayer from './QuizPlayer'

const grade = vi.fn()

const quiz = {
  id: 'quiz-1',
  title: 'Kolejność',
  description: '',
  difficulty: 'easy',
  courseId: null,
  questions: [
    {
      id: 'o1',
      type: 'ordering',
      prompt: 'Ułóż',
      points: 1,
      options: [],
      config: {
        items: [
          { id: 'c', text: 'Trzeci' },
          { id: 'a', text: 'Pierwszy' },
          { id: 'b', text: 'Drugi' },
        ],
      },
    },
  ],
  shuffleQuestions: false,
  shuffleOptions: false,
  sampleSize: null,
}

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    useGetQuizQuery: () => ({ currentData: quiz, error: undefined }),
    useGradeQuizMutation: () => [grade, { data: undefined, isLoading: false, error: undefined }],
  }
})

describe('QuizPlayer with an untouched ordering question', () => {
  afterEach(() => {
    cleanup()
    grade.mockReset()
  })

  it('does not send the shown arrangement as an answer', () => {
    const store = configureStore({
      reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer },
      middleware: (g) => g().concat(api.middleware),
    })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <QuizPlayer id="quiz-1" />
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    // the only question: the button is "Zakończ i sprawdź" and nothing was touched
    fireEvent.click(screen.getByRole('button', { name: /Zakończ i sprawdź/ }))
    expect(grade).toHaveBeenCalledTimes(1)
    expect(grade.mock.calls[0][0].answers).toEqual({})
  })
})
