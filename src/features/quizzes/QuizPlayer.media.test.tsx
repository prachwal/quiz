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

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    useGetQuizQuery: () => ({ currentData: mockQuiz, error: undefined }),
  }
})

const ID = '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b'

const quizWith = (prompt: string, media?: unknown) => ({
  id: 'quiz-1',
  title: 'Quiz z obrazem',
  description: '',
  difficulty: null,
  courseId: null,
  questions: [{ id: 'q1', type: 'single', prompt, points: 1, options: [] }],
  shuffleQuestions: false,
  shuffleOptions: false,
  sampleSize: null,
  media,
})

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

describe('QuizPlayer with images', () => {
  afterEach(() => cleanup())

  it('shows the prompt image when the quiz carries its media entry', () => {
    mockQuiz = quizWith(`Co widzisz? ![Mapa Polski](media:${ID})`, {
      [ID]: { url: 'https://media.example.com/mapa.png', width: 640, height: 480 },
    })
    renderPlayer()
    const img = screen.getByRole('img', { name: 'Mapa Polski' })
    expect(img.tagName).toBe('IMG')
    expect(img).toHaveAttribute('src', 'https://media.example.com/mapa.png')
    expect(screen.getByRole('heading', { name: /Co widzisz\?/ })).toBeInTheDocument()
  })

  it('shows the placeholder when the map has no entry for the image', () => {
    mockQuiz = quizWith(`Co widzisz? ![Mapa Polski](media:${ID})`, undefined)
    const { container } = renderPlayer()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: 'Mapa Polski' })).toHaveTextContent('Obraz niedostępny')
  })
})
