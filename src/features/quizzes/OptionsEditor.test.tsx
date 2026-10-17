import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import OptionsEditor from './OptionsEditor'

describe('OptionsEditor', () => {
  afterEach(() => cleanup())
  it('renders options for single', () => {
    const onChange = vi.fn()
    render(<ConfigProvider><OptionsEditor type="single" value={[{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }]} onChange={onChange} /></ConfigProvider>)
    expect(screen.getByDisplayValue('a')).toBeInTheDocument()
    expect(screen.getByDisplayValue('b')).toBeInTheDocument()
  })

  it('adds option on button click', () => {
    const onChange = vi.fn()
    render(<ConfigProvider><OptionsEditor type="single" value={[{ text: 'a', isCorrect: true }]} onChange={onChange} /></ConfigProvider>)
    fireEvent.click(screen.getByRole('button', { name: /Dodaj opcję/i }))
    expect(onChange).toHaveBeenCalled()
  })
})
