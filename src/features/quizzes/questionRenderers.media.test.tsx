import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MediaProvider } from '../media/MediaProvider'
import { questionRenderers } from './questionRenderers'
import ChoiceTile from './ChoiceTile'

const ID = '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b'
const ID2 = '11111111-2222-4333-8444-555555555555'
const media = {
  [ID]: { url: 'https://media.example.com/kot.png', width: 300, height: 200 },
  [ID2]: { url: 'https://media.example.com/mapa.png', width: 300, height: 200 },
}

describe('question renderers with images', () => {
  afterEach(() => cleanup())

  it('an option made only of an image renders as an image tile and stays selectable', () => {
    const onChange = vi.fn()
    const question: any = {
      id: 'q1',
      type: 'single',
      prompt: 'Które zwierzę?',
      points: 1,
      options: [
        { id: 'a', text: `![Kot](media:${ID})`, isCorrect: true },
        { id: 'b', text: 'Pies', isCorrect: false },
      ],
    }
    const Renderer = questionRenderers.single
    const { container } = render(
      <ConfigProvider>
        <MediaProvider media={media}>
          <Renderer question={question} value={{ optionIds: ['a'] }} onChange={onChange} />
        </MediaProvider>
      </ConfigProvider>,
    )
    const tile = screen.getByRole('radio', { name: /Kot/ })
    expect(tile).toHaveClass('choice-tile--image')
    expect(tile).toHaveAttribute('aria-checked', 'true')
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://media.example.com/kot.png')
    // the letter label stays
    expect(tile).toHaveTextContent('A')

    fireEvent.click(screen.getByRole('radio', { name: 'Pies' }))
    expect(onChange).toHaveBeenCalledWith({ optionIds: ['b'] })
    fireEvent.click(tile)
    expect(onChange).toHaveBeenLastCalledWith({ optionIds: ['a'] })
  })

  it('a text option with an image keeps its text', () => {
    render(
      <ConfigProvider>
        <MediaProvider media={media}>
          <ChoiceTile label="B" text={`Ssak ![Kot](media:${ID})`} selected={false} kind="radio" onClick={() => {}} />
        </MediaProvider>
      </ConfigProvider>,
    )
    expect(screen.getByRole('radio')).not.toHaveClass('choice-tile--image')
    expect(screen.getByText('Ssak')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Kot' })).toBeInTheDocument()
  })

  it('a missing image option shows the placeholder inside the tile', () => {
    render(
      <ConfigProvider>
        <ChoiceTile label="A" text={`![Wykres](media:${ID2})`} selected={false} kind="checkbox" onClick={() => {}} />
      </ConfigProvider>,
    )
    expect(screen.getByRole('checkbox', { name: 'Wykres' })).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('cloze keeps gaps 1..n usable when images sit before the first gap and between gaps', () => {
    const onChange = vi.fn()
    const question: any = {
      id: 'c1',
      type: 'cloze',
      options: [],
      prompt: `![Plan](media:${ID}) On {{1}} to ![Mapa](media:${ID2}) {{2}} it.`,
      config: { gaps: [{ answers: ['went'] }, { answers: ['learnt'] }] },
    }
    const Renderer = questionRenderers.cloze
    const { container } = render(
      <ConfigProvider>
        <MediaProvider media={media}>
          <Renderer question={question} value={undefined} onChange={onChange} />
        </MediaProvider>
      </ConfigProvider>,
    )
    expect(container.querySelectorAll('img')).toHaveLength(2)
    expect(screen.getByLabelText('Luka 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Luka 2')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Luka 2'), { target: { value: 'learnt' } })
    expect(onChange).toHaveBeenCalledWith({ gaps: { 2: 'learnt' } })
    // the marker text never shows, the image description is not a gap
    expect(container.textContent).not.toContain('{{')
  })
})
