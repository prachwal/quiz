import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import WeekStrip from './WeekStrip'
import type { ProgressSummary } from '../../shared/quiz/types'

describe('WeekStrip', () => {
  afterEach(() => cleanup())
  it('renders 7 days', () => {
    const summary: ProgressSummary = {
      timezone: 'UTC',
      dailyGoal: 10,
      currentStreak: 1,
      longestStreak: 1,
      today: { day: '2026-06-10', answered: 2, correct: 1, lessons: 0 },
      last7: Array.from({ length: 7 }, (_, i) => ({ day: `2026-06-0${i + 4}`, answered: i, correct: 0, lessons: 0 })),
    }
    render(<ConfigProvider><WeekStrip summary={summary} /></ConfigProvider>)
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
  })
})
