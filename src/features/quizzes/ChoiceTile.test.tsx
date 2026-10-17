import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import ChoiceTile from './ChoiceTile'

describe('ChoiceTile', () => {
  afterEach(() => cleanup())
  it('renders label and text', () => {
    render(
      <ConfigProvider>
        <ChoiceTile label="A" text="hello" selected={false} kind="radio" onClick={() => {}} />
      </ConfigProvider>,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByRole('radio')).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(
      <ConfigProvider>
        <ChoiceTile label="B" text="world" selected={true} kind="checkbox" onClick={onClick} />
      </ConfigProvider>,
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onClick).toHaveBeenCalled()
  })
})
