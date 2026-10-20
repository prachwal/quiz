import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../settings/settingsSlice'
import feedbackReducer from '../feedback/feedbackSlice'
import { courseBackLink, courseExamOutcome } from './courseExam'

const question = { id: 'q1' }
const quizWith = (courseId: string | null): any => ({ id: 'quiz-1', title: 'Egzamin', courseId, questions: [question] })
const resultWith = (course: unknown): any => ({ score: 1, maxScore: 2, percent: 50, results: [], course, attemptId: 'a1' })
const exam = (passed: boolean) => ({ id: 'course-1', title: 'Czasowniki A1', passPercent: 70, passed })

describe('courseBackLink', () => {
  it('links to the course when the quiz belongs to one', () => {
    expect(courseBackLink(quizWith('course-1'))).toEqual({ to: '/learn/course-1', label: 'Wróć do kursu' })
  })
  it('is undefined for a quiz without a course', () => {
    expect(courseBackLink(quizWith(null))).toBeUndefined()
  })
})

describe('courseExamOutcome', () => {
  it('is undefined when the attempt is not a course exam', () => {
    expect(courseExamOutcome(quizWith('course-1'), resultWith(null))).toBeUndefined()
  })
  it('reports a passed exam with success tone', () => {
    const outcome = courseExamOutcome(quizWith('course-1'), resultWith(exam(true)))
    expect(outcome?.tone).toBe('success')
    expect(outcome?.headline).toBe('Egzamin zaliczony!')
    expect(outcome?.subline).toBe('Czasowniki A1 · próg zaliczenia 70%')
  })
  it('reports a failed exam with error tone', () => {
    const outcome = courseExamOutcome(quizWith('course-1'), resultWith(exam(false)))
    expect(outcome?.tone).toBe('error')
    expect(outcome?.headline).toBe('Egzamin niezaliczony')
  })
})

describe('course exam actions', () => {
  afterEach(() => cleanup())
  it('render the link back to the course and the retry button', () => {
    const outcome = courseExamOutcome(quizWith('course-1'), resultWith(exam(true)))
    const store = configureStore({ reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer }, middleware: (g) => g().concat(api.middleware) })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <AntdApp>{outcome?.actions}</AntdApp>
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(screen.getByRole('link', { name: /Wróć do kursu/ })).toHaveAttribute('href', '/learn/course-1')
    expect(screen.getByRole('button', { name: /Nowe podejście/ })).toBeInTheDocument()
  })
})
