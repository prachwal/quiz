import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import PublicShell from './PublicShell'

describe('PublicShell', () => {
  afterEach(() => cleanup())
  it('renders children', () => {
    render(<PublicShell><span>hello</span></PublicShell>)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})
