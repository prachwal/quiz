import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import About from './About'

describe('About', () => {
  afterEach(() => cleanup())
  it('renders title', () => {
    render(<ConfigProvider><About /></ConfigProvider>)
    expect(screen.getByText('O aplikacji')).toBeInTheDocument()
  })
})
