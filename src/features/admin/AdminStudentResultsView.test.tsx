import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../settings/settingsSlice'
import feedbackReducer from '../feedback/feedbackSlice'
import { server } from '../../test/msw'
import AdminStudentResultsView from './AdminStudentResultsView'

const day = (d: string, answered = 0) => ({ day: d, answered, correct: 0, lessons: 0 })

describe('AdminStudentResultsView', () => {
  afterEach(() => cleanup())

  it('shows every attempt (assigned or not) with answers, progress and classes', async () => {
    server.use(
      http.get('/api/admin/students/:id/results', ({ params }) =>
        HttpResponse.json({
          userId: params.id,
          name: 'Ala Kot',
          email: 'ala@x.pl',
          classes: [{ id: 'c1', name: '3A', ownerName: 'Ewa' }],
          progress: { timezone: 'UTC', dailyGoal: 10, currentStreak: 2, longestStreak: 5, today: day('2026-10-18', 4), last7: [day('2026-10-17', 3), day('2026-10-18', 4)] },
          lessonsCompleted: 3,
          weakVerbs: [],
          totals: { attempts: 2, averagePercent: 75, passedExams: 0 },
          attempts: [
            { id: 'a1', title: 'Pierwiastki', quizId: 'q1', courseId: null, source: 'manual', score: 1, maxScore: 2, percent: 50, passed: null, createdAt: '2026-10-18T10:00:00Z',
              questions: [{ questionId: 'x', prompt: 'Symbol tlenu?', correct: false, earned: 0, points: 1, answer: 'Ox', correctAnswers: ['O'] }] },
            { id: 'a2', title: 'Losowy quiz', quizId: 'q2', courseId: null, source: 'irregular-verbs', score: 10, maxScore: 10, percent: 100, passed: null, createdAt: '2026-10-17T10:00:00Z', questions: [] },
          ],
        }),
      ),
    )
    const store = configureStore({
      reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer },
      middleware: (g) => g().concat(api.middleware),
    })
    render(
      <Provider store={store}>
        <ConfigProvider>
          <MemoryRouter>
            <AntdApp>
              <AdminStudentResultsView userId="google-oauth2|1" />
            </AntdApp>
          </MemoryRouter>
        </ConfigProvider>
      </Provider>,
    )
    expect(await screen.findByText('Ala Kot')).toBeTruthy()
    expect(screen.getByText('google-oauth2|1')).toBeTruthy()
    expect(screen.getByText('3A · Ewa')).toBeTruthy()
    expect(screen.getByText('Wszystkie podejścia (2)')).toBeTruthy()
    expect(screen.getAllByText('Losowy quiz').length).toBe(2) // title and kind tag
    expect(screen.getByText('2 / 5')).toBeTruthy()
    // newest first by default; the row with answers expands to the questions
    const rows = document.querySelectorAll('.ant-table-tbody tr.ant-table-row')
    expect(rows[rows.length - 2].textContent).toContain('Pierwiastki')
    const expand = rows[rows.length - 2].querySelector('.ant-table-row-expand-icon') as HTMLElement
    fireEvent.click(expand)
    expect(await screen.findByText('1. Symbol tlenu?')).toBeTruthy()
    expect(screen.getByText(/Ox/)).toBeTruthy()
  })
})
