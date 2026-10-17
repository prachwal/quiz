import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BottomNav from './BottomNav'

describe('BottomNav', () => {
  afterEach(() => cleanup())
  it('renders tab items', () => {
    render(<MemoryRouter><BottomNav selected="/" /></MemoryRouter>)
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0)
  })
})
