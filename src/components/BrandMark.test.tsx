import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import BrandMark from './BrandMark'

describe('BrandMark', () => {
  afterEach(() => cleanup())
  it('shows name by default', () => {
    render(<ConfigProvider><BrandMark /></ConfigProvider>)
    expect(screen.getByText('Quiz')).toBeInTheDocument()
  })

  it('hides name when showName false', () => {
    render(<ConfigProvider><BrandMark showName={false} /></ConfigProvider>)
    expect(screen.queryByText('Quiz')).toBeNull()
  })
})
