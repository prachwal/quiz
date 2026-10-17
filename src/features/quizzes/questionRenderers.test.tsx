import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { questionRenderers, isAnswered } from './questionRenderers'

describe('questionRenderers', () => {
  afterEach(() => cleanup())
  it('renders single options', () => {
    const q: any = { id: 'q1', type: 'single', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }
    const onChange = vi.fn()
    const R = questionRenderers.single
    render(<ConfigProvider><R question={q} value={undefined} onChange={onChange} /></ConfigProvider>)
    expect(screen.getAllByText('A').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByText('A')[1])
    expect(onChange).toHaveBeenCalled()
  })

  it('isAnswered works', () => {
    expect(isAnswered({ optionIds: ['a'] })).toBe(true)
    expect(isAnswered({ text: '  ' })).toBe(false)
    expect(isAnswered({ text: 'x' })).toBe(true)
    expect(isAnswered(undefined)).toBe(false)
  })
})
