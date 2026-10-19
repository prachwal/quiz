import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { questionRenderers } from './questionRenderers'

// the shape the server sends: lefts in the author order, rights shuffled, nothing linking them
const question: any = {
  id: 'q1',
  type: 'matching',
  options: [],
  config: {
    lefts: [
      { id: 'p1', text: 'kot' },
      { id: 'p2', text: 'pies' },
    ],
    rights: [
      { id: 'r2', text: 'dog' },
      { id: 'r1', text: 'cat' },
    ],
  },
}

const renderMatching = (value?: any) => {
  const onChange = vi.fn()
  const Renderer = questionRenderers.matching
  render(
    <ConfigProvider>
      <Renderer question={question} value={value} onChange={onChange} />
    </ConfigProvider>,
  )
  return onChange
}

const left = (text: string) => within(screen.getByRole('group', { name: 'Elementy do dopasowania' })).getByText(text)
const right = (text: string) => within(screen.getByRole('group', { name: 'Dopasowania' })).getByText(text)

describe('matching renderer', () => {
  afterEach(() => cleanup())

  it('shows both columns without linking them', () => {
    renderMatching()
    expect(left('kot')).toBeInTheDocument()
    expect(left('pies')).toBeInTheDocument()
    expect(right('cat')).toBeInTheDocument()
    expect(right('dog')).toBeInTheDocument()
  })

  it('assigns a right tile to the selected left tile', () => {
    const onChange = renderMatching()
    fireEvent.click(left('kot'))
    fireEvent.click(right('cat'))
    expect(onChange).toHaveBeenCalledWith({ pairs: { p1: 'r1' } })
  })

  it('keeps the previous assignment when another left is matched', () => {
    const onChange = renderMatching({ pairs: { p1: 'r1' } })
    fireEvent.click(left('pies'))
    fireEvent.click(right('dog'))
    expect(onChange).toHaveBeenCalledWith({ pairs: { p1: 'r1', p2: 'r2' } })
  })

  it('moves a tile that was already taken by another left', () => {
    const onChange = renderMatching({ pairs: { p1: 'r1' } })
    fireEvent.click(left('pies'))
    fireEvent.click(right('cat'))
    expect(onChange).toHaveBeenCalledWith({ pairs: { p2: 'r1' } })
  })

  it('clears a match', () => {
    const onChange = renderMatching({ pairs: { p1: 'r1' } })
    fireEvent.click(screen.getByLabelText('Usuń dopasowanie: kot'))
    expect(onChange).toHaveBeenCalledWith({ pairs: {} })
  })

  it('does nothing when a right tile is clicked without a selection', () => {
    const onChange = renderMatching({ pairs: { p1: 'r1' } })
    fireEvent.click(right('dog'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
