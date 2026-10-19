import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { orderingItems } from '../../shared/quiz/engine'
import { questionRenderers } from './questionRenderers'

const question: any = {
  id: 'q1',
  type: 'ordering',
  options: [],
  config: {
    items: [
      { id: 'c', text: 'Trzeci' },
      { id: 'a', text: 'Pierwszy' },
      { id: 'b', text: 'Drugi' },
    ],
  },
}

const renderOrdering = (value?: any) => {
  const onChange = vi.fn()
  const R = questionRenderers.ordering
  render(
    <ConfigProvider>
      <R question={question} value={value} onChange={onChange} />
    </ConfigProvider>,
  )
  return onChange
}

describe('ordering renderer', () => {
  afterEach(() => cleanup())

  it('shows the items in the order they arrived in (shuffled on the server)', () => {
    renderOrdering()
    const labels = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(labels[0]).toContain('Trzeci')
    expect(labels[1]).toContain('Pierwszy')
    expect(labels[2]).toContain('Drugi')
  })

  it('moves an item up and submits the whole order', () => {
    const onChange = renderOrdering()
    fireEvent.click(screen.getByLabelText('Przenieś wyżej: Drugi'))
    expect(onChange).toHaveBeenCalledWith({ order: ['c', 'b', 'a'] })
  })

  it('moves an item down', () => {
    const onChange = renderOrdering()
    fireEvent.click(screen.getByLabelText('Przenieś niżej: Trzeci'))
    expect(onChange).toHaveBeenCalledWith({ order: ['a', 'c', 'b'] })
  })

  it('does not move the first item up or the last item down', () => {
    const onChange = renderOrdering()
    expect(screen.getByLabelText('Przenieś wyżej: Trzeci')).toBeDisabled()
    expect(screen.getByLabelText('Przenieś niżej: Drugi')).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('follows the submitted order when the player already moved something', () => {
    renderOrdering({ order: ['a', 'b', 'c'] })
    const labels = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(labels[0]).toContain('Pierwszy')
    expect(labels[2]).toContain('Trzeci')
  })

  it('orderingItems returns the player payload', () => {
    expect(orderingItems(question.config).map((item) => item.id)).toEqual(['c', 'a', 'b'])
  })
})
