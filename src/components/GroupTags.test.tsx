import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { DifficultyTag, PopularityTag } from './GroupTags'

describe('GroupTags', () => {
  afterEach(() => cleanup())
  it('renders difficulty tag', () => {
    render(<ConfigProvider><DifficultyTag value="easy" /></ConfigProvider>)
    expect(screen.getByText('Łatwy')).toBeInTheDocument()
  })

  it('renders nothing for null difficulty', () => {
    const { container } = render(<ConfigProvider><DifficultyTag value={null} /></ConfigProvider>)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders popularity tag', () => {
    render(<ConfigProvider><PopularityTag value="core" /></ConfigProvider>)
    expect(screen.getByText('Bardzo popularny')).toBeInTheDocument()
  })
})
