import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { StatusTag } from './statusTags'

describe('StatusTag', () => {
  afterEach(() => cleanup())
  it('renders labels', () => {
    render(<ConfigProvider><StatusTag status="todo" /></ConfigProvider>)
    expect(screen.getByText('Do zrobienia')).toBeInTheDocument()
    render(<ConfigProvider><StatusTag status="done" /></ConfigProvider>)
    expect(screen.getByText('Zrobione')).toBeInTheDocument()
  })
})
