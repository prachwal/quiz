import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { emptyQuestion, emptyQuiz } from './quizDefaults'
import QuizEditor from './QuizEditor'

const renderEditor = (initialValues = emptyQuiz()) =>
  render(
    <ConfigProvider>
      <AntdApp>
        <QuizEditor initialValues={initialValues} submitting={false} submitLabel="Zapisz" onSubmit={vi.fn()} />
      </AntdApp>
    </ConfigProvider>,
  )

describe('quizDefaults', () => {
  it('gives option-based types options and no config', () => {
    const question = emptyQuestion('single')
    expect(question.options?.length ?? 0).toBeGreaterThan(0)
    expect(question.config).toBeUndefined()
  })

  it('gives numeric a config and no options', () => {
    const question = emptyQuestion('numeric')
    expect(question.options).toEqual([])
    expect(question.config).toEqual({ answer: 0 })
  })
})

describe('QuizEditor config handling', () => {
  afterEach(() => cleanup())

  it('renders the numeric answer editor instead of an options list', () => {
    renderEditor({ ...emptyQuiz(), questions: [emptyQuestion('numeric')] })
    expect(screen.getByText('Poprawna odpowiedź')).toBeInTheDocument()
    expect(screen.getByText('Tolerancja')).toBeInTheDocument()
    expect(screen.queryByText('Dodaj opcję')).not.toBeInTheDocument()
  })

  it('keeps a config that was loaded from an existing quiz', () => {
    renderEditor({
      ...emptyQuiz(),
      questions: [{ ...emptyQuestion('numeric'), config: { answer: 42 } }],
    })
    // the loaded value is rendered in the answer input rather than reset to the default
    // (index 0 is the points field, then the numeric answer, then the tolerance)
    const [, answerInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(answerInput.value).toBe('42')
  })

  it('shows the options editor for option-based types', () => {
    renderEditor()
    expect(screen.getByText('Dodaj opcję')).toBeInTheDocument()
    expect(screen.queryByText('Poprawna odpowiedź')).not.toBeInTheDocument()
  })

  it('switching the type swaps the payload editors', async () => {
    renderEditor()
    const typeSelect = screen.getByText('Jednokrotny wybór')
    fireEvent.mouseDown(typeSelect)
    const option = await screen.findByText('Odpowiedź liczbowa')
    fireEvent.click(option)
    expect(await screen.findByText('Poprawna odpowiedź')).toBeInTheDocument()
  })
})
