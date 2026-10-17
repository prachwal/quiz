import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { emptyQuiz } from './quizDefaults'
import QuizEditor from './QuizEditor'

describe('QuizEditor', () => {
  afterEach(() => cleanup())
  it('renders title field', () => {
    render(
      <ConfigProvider>
        <AntdApp>
          <QuizEditor initialValues={emptyQuiz()} submitting={false} submitLabel="Zapisz" onSubmit={vi.fn()} />
        </AntdApp>
      </ConfigProvider>,
    )
    expect(screen.getByText('Tytuł')).toBeInTheDocument()
  })
})
