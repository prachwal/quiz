import { describe, it, expect, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MediaProvider } from './MediaProvider'
import { RichText } from './RichText'
import { MediaImage } from './MediaImage'
import { useMedia } from './useMedia'

const ID = '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b'
const OTHER = '11111111-2222-4333-8444-555555555555'
const map = {
  [ID]: { url: 'https://media.example.com/a.png', width: 400, height: 200 },
}

const renderIn = (ui: ReactNode) => render(<ConfigProvider>{ui}</ConfigProvider>)

describe('RichText', () => {
  afterEach(() => cleanup())

  it('renders text-only text as one plain span', () => {
    const { container } = renderIn(<RichText text="Ile to jest 2 + 2?" />)
    expect(container.querySelectorAll('span')).toHaveLength(1)
    expect(container.textContent).toBe('Ile to jest 2 + 2?')
    expect(container.querySelector('img')).toBeNull()
  })

  it('does not interpret HTML in text', () => {
    const { container } = renderIn(<RichText text="<b>x</b>" />)
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toBe('<b>x</b>')
  })

  it('renders an image from the map with alt, size and safe loading attributes', () => {
    renderIn(
      <MediaProvider media={map}>
        <RichText text={`Co to jest? ![Mapa Polski](media:${ID})`} />
      </MediaProvider>,
    )
    const img = screen.getByRole('img', { name: 'Mapa Polski' })
    expect(img.tagName).toBe('IMG')
    expect(img).toHaveAttribute('src', 'https://media.example.com/a.png')
    expect(img).toHaveAttribute('width', '400')
    expect(img).toHaveAttribute('height', '200')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('decoding', 'async')
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.getByText('Co to jest?')).toBeInTheDocument()
  })

  it('renders a placeholder with the alt text when the map has no entry', () => {
    renderIn(
      <MediaProvider media={map}>
        <RichText text={`![Wykres](media:${OTHER})`} />
      </MediaProvider>,
    )
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: 'Wykres' })).toHaveTextContent('Obraz niedostępny')
  })

  it('renders a placeholder when there is no provider at all', () => {
    renderIn(<RichText text={`![Wykres](media:${ID})`} />)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: 'Wykres' })).toBeInTheDocument()
  })

  it('renders a placeholder for a javascript: address in the map', () => {
    renderIn(
      <MediaProvider media={{ [ID]: { url: 'javascript:alert(1)', width: null, height: null } }}>
        <MediaImage mediaId={ID} alt="Zły" />
      </MediaProvider>,
    )
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: 'Zły' })).toBeInTheDocument()
  })

  it('renders a placeholder for a data: address in the map', () => {
    renderIn(
      <MediaProvider media={{ [ID]: { url: 'data:image/svg+xml,<svg onload=alert(1)>', width: 10, height: 10 } }}>
        <MediaImage mediaId={ID} alt="Dane" />
      </MediaProvider>,
    )
    expect(document.querySelector('img')).toBeNull()
  })

  it('leaves out the image size when the map does not know it', () => {
    renderIn(
      <MediaProvider media={{ [ID]: { url: 'https://media.example.com/b.png', width: null, height: null } }}>
        <MediaImage mediaId={ID} alt="Bez wymiarów" />
      </MediaProvider>,
    )
    const img = screen.getByRole('img', { name: 'Bez wymiarów' })
    expect(img).not.toHaveAttribute('width')
    expect(img).not.toHaveAttribute('height')
  })

  it('shows the description as text for images beyond the limit', () => {
    renderIn(
      <MediaProvider media={map}>
        <RichText text={`![jeden](media:${ID})![dwa](media:${ID})`} imageMaxCount={1} />
      </MediaProvider>,
    )
    expect(document.querySelectorAll('img')).toHaveLength(1)
    expect(screen.getByText('dwa')).toBeInTheDocument()
  })
})

describe('MediaProvider', () => {
  afterEach(() => cleanup())

  const Probe = () => {
    const media = useMedia()
    return <span>{Object.keys(media).sort().join(',')}</span>
  }

  it('merges a nested map with the outer one, inner entries winning', () => {
    const inner = { [OTHER]: { url: 'https://media.example.com/c.png', width: 1, height: 1 }, [ID]: { url: 'https://media.example.com/inner.png', width: 2, height: 2 } }
    renderIn(
      <MediaProvider media={map}>
        <MediaProvider media={inner}>
          <MediaImage mediaId={ID} alt="Wewnątrz" />
          <Probe />
        </MediaProvider>
      </MediaProvider>,
    )
    expect(screen.getByRole('img', { name: 'Wewnątrz' })).toHaveAttribute('src', 'https://media.example.com/inner.png')
    expect(screen.getByText(`${ID},${OTHER}`)).toBeInTheDocument()
  })

  it('keeps the outer map when the inner provider has no map', () => {
    renderIn(
      <MediaProvider media={map}>
        <MediaProvider media={undefined}>
          <Probe />
        </MediaProvider>
      </MediaProvider>,
    )
    expect(screen.getByText(ID)).toBeInTheDocument()
  })

  it('is empty without a provider', () => {
    renderIn(<Probe />)
    expect(screen.getByText('', { selector: 'span' })).toBeInTheDocument()
  })
})
