import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import NextReviewButton from './NextReviewButton'

const startReview = vi.fn()
const navigate = vi.fn()

vi.mock('./api', () => ({
  useStartReviewMutation: () => [startReview, { isLoading: false }],
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

const renderButton = () =>
  render(
    <ConfigProvider>
      <AntdApp>
        <MemoryRouter>
          <NextReviewButton questionCount={12} />
        </MemoryRouter>
      </AntdApp>
    </ConfigProvider>,
  )

describe('NextReviewButton', () => {
  beforeEach(() => {
    startReview.mockReset()
    navigate.mockReset()
  })
  afterEach(() => cleanup())

  it('starts a review session and opens its quiz', async () => {
    startReview.mockReturnValue({ unwrap: () => Promise.resolve({ id: 'review-2' }) })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: /Kolejna powtórka/ }))
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/quizzes/review-2/play'))
    // the question count is clamped to the review limits (1..30)
    expect(startReview).toHaveBeenCalledWith({ count: 12 })
  })

  it('shows the server message and goes home when nothing is due', async () => {
    startReview.mockReturnValue({ unwrap: () => Promise.reject({ data: { error: 'Nic do powtórki dziś' } }) })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: /Kolejna powtórka/ }))
    expect(await screen.findByText('Nic do powtórki dziś')).toBeInTheDocument()
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
  })
})
