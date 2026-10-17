import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const handlers = [
  http.get('/api/progress/summary', () =>
    HttpResponse.json({
      timezone: 'UTC',
      dailyGoal: 10,
      currentStreak: 3,
      longestStreak: 5,
      today: { day: '2026-06-10', answered: 4, correct: 3, lessons: 1 },
      last7: Array.from({ length: 7 }, (_, i) => ({ day: `2026-06-0${i + 4}`, answered: i, correct: 0, lessons: 0 })),
    }),
  ),
  http.get('/api/reviews/summary', () =>
    HttpResponse.json({ dueCount: 5, newCount: 2, nextDueAt: null, trackedCount: 10 }),
  ),
  http.get('/api/irregular-verbs', () => HttpResponse.json([])),
  http.get('/api/quizzes', () => HttpResponse.json([])),
  http.get('/api/courses', () => HttpResponse.json([])),
  http.get('/api/my/assignments', () => HttpResponse.json([])),
  http.get('/api/my/classes', () => HttpResponse.json([])),
  http.get('/api/classes', () => HttpResponse.json([])),
  http.get('/api/admin/audit', () => HttpResponse.json([])),
  http.get('/api/admin/feedback', () => HttpResponse.json([])),
  http.get('/api/admin/users', () => HttpResponse.json({ users: [], total: 0, page: 0, perPage: 20 })),
  http.get('/api/progress/weak-verbs', () => HttpResponse.json([])),
]

export const server = setupServer(...handlers)
