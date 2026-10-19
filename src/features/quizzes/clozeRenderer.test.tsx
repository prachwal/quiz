import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { questionRenderers } from './questionRenderers'

const question: any = {
  id: 'q1',
  type: 'cloze',
  options: [],
  prompt: 'He {{1}} to school and {{2}} it.',
  config: { gaps: 2 },
}

const renderCloze = (value?: any) => {
  const onChange = vi.fn()
  const Renderer = questionRenderers.cloze
  render(
    <ConfigProvider>
      <Renderer question={question} value={value} onChange={onChange} />
    </ConfigProvider>,
  )
  return onChange
}

describe('cloze renderer', () => {
  afterEach(() => cleanup())

  it('replaces both markers with labelled inputs', () => {
    renderCloze()
    expect(screen.getByLabelText('Luka 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Luka 2')).toBeInTheDocument()
    // the markers themselves never reach the player
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument()
  })

  it('keeps the surrounding text', () => {
    renderCloze()
    expect(screen.getByText(/He/)).toBeInTheDocument()
    expect(screen.getByText(/to school and/)).toBeInTheDocument()
  })

  it('does not print the gap numbers next to the inputs', () => {
    const { container } = render(
      <ConfigProvider>
        <questionRenderers.cloze question={question} value={undefined} onChange={vi.fn()} />
      </ConfigProvider>,
    )
    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(container.textContent).toContain('He  to school and  it.')
  })

  it('submits one gap without losing the others', () => {
    const onChange = renderCloze({ gaps: { 1: 'went' } })
    fireEvent.change(screen.getByLabelText('Luka 2'), { target: { value: 'learnt' } })
    expect(onChange).toHaveBeenCalledWith({ gaps: { 1: 'went', 2: 'learnt' } })
  })

  it('shows the submitted answers', () => {
    renderCloze({ gaps: { 1: 'went', 2: 'learnt' } })
    expect((screen.getByLabelText('Luka 1') as HTMLInputElement).value).toBe('went')
    expect((screen.getByLabelText('Luka 2') as HTMLInputElement).value).toBe('learnt')
  })
})
