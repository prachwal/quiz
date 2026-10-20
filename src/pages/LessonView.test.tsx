import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../app/api'
import settingsReducer from '../features/settings/settingsSlice'
import feedbackReducer from '../features/feedback/feedbackSlice'
import LessonView from './LessonView'
import type { LessonDetail } from '../shared/quiz/types'

// the lesson query and the completion mutation are replaced; everything else (slides, media) is real
let mockLesson: LessonDetail | undefined
const complete = vi.fn((_args: unknown) => ({ unwrap: () => Promise.resolve({ ok: true }) }))

vi.mock('../features/learn/api', () => ({
  useGetLessonQuery: () => ({ data: mockLesson, error: undefined, isLoading: false }),
  useCompleteLessonMutation: () => [complete, { isLoading: false }],
}))

const ID = '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b'
const MISSING = '11111111-2222-4333-8444-555555555555'
const LONG = 'Lekcja o czasownikach nieregularnych. '.repeat(5) // > 140 characters, no image

const verb = (id: number, base: string) => ({
  id,
  base,
  cefrLevel: 'B2',
  difficulty: 'medium' as const,
  popularity: 'common' as const,
  pattern: 'ABC' as const,
  pastSimple: ['x'],
  pastParticiple: ['x'],
  meanings: ['znaczenie'],
  exampleEn: 'Example.',
  examplePl: 'Przykład.',
})

const lessonWith = (intro: string, media?: LessonDetail['media']): LessonDetail => ({
  id: 'l1',
  courseId: 'c1',
  courseTitle: 'Kurs testowy',
  position: 1,
  title: 'Lekcja 1',
  intro,
  completed: false,
  prevLessonId: null,
  nextLessonId: null,
  verbs: [verb(1, 'go'), verb(2, 'eat')],
  ...(media ? { media } : {}),
})

const renderLesson = () => {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer },
    middleware: (g) => g().concat(api.middleware),
  })
  return render(
    <Provider store={store}>
      <ConfigProvider>
        <MemoryRouter initialEntries={['/learn/c1/lessons/l1']}>
          <Routes>
            <Route path="/learn/:courseId/lessons/:lessonId" element={<LessonView />} />
          </Routes>
        </MemoryRouter>
      </ConfigProvider>
    </Provider>,
  )
}

const dalej = () => fireEvent.click(screen.getByRole('button', { name: /Dalej/ }))

describe('LessonView', () => {
  beforeEach(() => {
    complete.mockClear()
  })
  afterEach(() => cleanup())

  it('shows skeleton while loading', () => {
    mockLesson = undefined
    renderLesson()
    expect(document.querySelector('.ant-skeleton')).not.toBeNull()
  })

  it('a short intro without images stays the page subtitle and adds no slide', () => {
    mockLesson = lessonWith('Krótki wstęp.')
    renderLesson()
    expect(screen.getByText('Krótki wstęp.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Wstęp' })).toBeNull()
    expect(screen.getByText('go')).toBeInTheDocument()
    expect(document.body.textContent).toContain('1 / 2')
    expect(screen.getByRole('button', { name: /Cofnij/ })).toBeDisabled()
  })

  it('an intro with an image becomes the first slide and the page subtitle is dropped', () => {
    mockLesson = lessonWith(`Patrz ![Tabela form](media:${ID})`, {
      [ID]: { url: 'https://media.example.com/a.png', width: 400, height: 200 },
    })
    const { container } = renderLesson()
    expect(screen.getByRole('heading', { name: 'Wstęp' })).toBeInTheDocument()
    const img = screen.getByRole('img', { name: 'Tabela form' })
    expect(img.tagName).toBe('IMG')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://media.example.com/a.png')
    expect(screen.queryByText('go')).toBeNull()
    expect(document.body.textContent).toContain('1 / 3')
  })

  it('Dalej from the intro goes to the first verb, and Cofnij returns to the intro', () => {
    mockLesson = lessonWith(`Patrz ![Tabela](media:${ID})`, {
      [ID]: { url: 'https://media.example.com/a.png', width: 400, height: 200 },
    })
    renderLesson()
    dalej()
    expect(screen.queryByRole('heading', { name: 'Wstęp' })).toBeNull()
    expect(screen.getByText('go')).toBeInTheDocument()
    expect(document.body.textContent).toContain('2 / 3')
    fireEvent.click(screen.getByRole('button', { name: /Cofnij/ }))
    expect(screen.getByRole('heading', { name: 'Wstęp' })).toBeInTheDocument()
  })

  it('a long intro without images also gets the intro slide', () => {
    mockLesson = lessonWith(LONG)
    renderLesson()
    expect(screen.getByRole('heading', { name: 'Wstęp' })).toBeInTheDocument()
    expect(screen.getByText(/Lekcja o czasownikach/)).toBeInTheDocument()
  })

  it('completing happens only on the last verb slide, not on the intro', async () => {
    mockLesson = lessonWith(`Patrz ![Tabela](media:${ID})`, {
      [ID]: { url: 'https://media.example.com/a.png', width: 400, height: 200 },
    })
    renderLesson()
    expect(screen.getByRole('button', { name: /Dalej/ })).toBeInTheDocument()
    dalej() // intro -> go
    dalej() // go -> eat (last verb)
    expect(screen.queryByRole('button', { name: /Dalej/ })).toBeNull()
    expect(complete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Ukończ lekcję/ }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    expect(complete).toHaveBeenCalledWith({ courseId: 'c1', lessonId: 'l1' })
  })

  it('a missing media entry shows the placeholder with the alt text', () => {
    mockLesson = lessonWith(`Patrz ![Brakujący schemat](media:${MISSING})`, {})
    renderLesson()
    expect(screen.getByRole('heading', { name: 'Wstęp' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Brakujący schemat' })).toHaveTextContent('Obraz niedostępny')
    expect(document.querySelector('img')).toBeNull()
  })

  it('a lesson without verbs shows the alert and no slide navigation', () => {
    mockLesson = { ...lessonWith(`Patrz ![Tabela](media:${ID})`, {}), verbs: [] }
    renderLesson()
    expect(screen.getByText('Ta lekcja nie ma jeszcze czasowników')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ukończ lekcję/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Dalej/ })).toBeNull()
  })
})
