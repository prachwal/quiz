import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import PageHeader from './PageHeader'

describe('PageHeader', () => {
  afterEach(() => cleanup())
  it('renders title and subtitle', () => {
    render(
      <ConfigProvider>
        <MemoryRouter>
          <PageHeader title="Tytuł" subtitle="Opis" />
        </MemoryRouter>
      </ConfigProvider>,
    )
    expect(screen.getByText('Tytuł')).toBeInTheDocument()
    expect(screen.getByText('Opis')).toBeInTheDocument()
  })

  it('renders back link when provided', () => {
    render(
      <ConfigProvider>
        <MemoryRouter>
          <PageHeader title="T" back={{ to: '/', label: 'Wstecz' }} />
        </MemoryRouter>
      </ConfigProvider>,
    )
    expect(screen.getByText('Wstecz')).toBeInTheDocument()
  })

  it('renders eyebrow when no back link', () => {
    render(
      <ConfigProvider>
        <MemoryRouter>
          <PageHeader title="T" eyebrow="Sekcja" />
        </MemoryRouter>
      </ConfigProvider>,
    )
    expect(screen.getByText('Sekcja')).toBeInTheDocument()
  })
})
