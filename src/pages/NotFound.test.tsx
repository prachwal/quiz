import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import NotFound from './NotFound'

describe('NotFound', () => {
  afterEach(() => cleanup())
  it('renders 404', () => {
    render(<ConfigProvider><MemoryRouter><NotFound /></MemoryRouter></ConfigProvider>)
    expect(screen.getByText('404')).toBeInTheDocument()
  })
})
