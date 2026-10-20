import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import AttemptDetails from './AttemptDetails'
import type { StudentAttemptQuestion } from '../../shared/quiz/types'

const MEDIA = '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b'

const question = (prompt: string | null): StudentAttemptQuestion => ({
  questionId: 'q1',
  prompt,
  correct: true,
  earned: 1,
  points: 1,
  answer: 'tak',
  correctAnswers: [],
})

describe('AttemptDetails', () => {
  afterEach(() => cleanup())

  it('shows an image in a question as its description, never the media syntax', () => {
    const { container } = render(
      <ConfigProvider>
        <AttemptDetails questions={[question(`Co widzisz na ![kot na płocie](media:${MEDIA})?`)]} />
      </ConfigProvider>,
    )
    expect(container.textContent).toContain('1. Co widzisz na [obraz: kot na płocie]?')
    expect(container.textContent).not.toContain('media:')
    expect(container.textContent).not.toContain(MEDIA)
  })

  it('shows cloze gaps as blanks', () => {
    const { container } = render(
      <ConfigProvider>
        <AttemptDetails questions={[question('Stolica to {{1}}.')]} />
      </ConfigProvider>,
    )
    expect(container.textContent).toContain('1. Stolica to ___.')
  })

  it('marks a question removed from the quiz', () => {
    const { container } = render(
      <ConfigProvider>
        <AttemptDetails questions={[question(null)]} />
      </ConfigProvider>,
    )
    expect(container.textContent).toContain('Pytanie usunięte z quizu')
  })
})
