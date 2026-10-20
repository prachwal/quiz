import { describe, it, expect, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../app/api'
import settingsReducer from '../settings/settingsSlice'
import feedbackReducer from '../feedback/feedbackSlice'
import { MediaProvider } from '../media/MediaProvider'
import type { MediaMap } from '../../shared/media/types'
import type { IrregularVerb } from '../../shared/quiz/types'
import VerbSlide from './VerbSlide'
import VerbTable from './VerbTable'
import { toVerbList } from './api'

const IMAGE = '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b'
const MISSING = '11111111-2222-4333-8444-555555555555'
const media: MediaMap = { [IMAGE]: { url: 'https://media.example.com/go.webp', width: 400, height: 300 } }

const verb: IrregularVerb = {
  id: 1,
  base: 'go',
  cefrLevel: 'B2',
  difficulty: 'medium',
  popularity: 'common',
  pattern: 'ABC',
  pastSimple: ['went'],
  pastParticiple: ['gone'],
  meanings: ['iść'],
  exampleEn: 'Go now.',
  examplePl: 'Idź teraz.',
}
const withImage = (imageMediaId: string): IrregularVerb => ({ ...verb, imageMediaId })

const store = () =>
  configureStore({
    reducer: { [api.reducerPath]: api.reducer, settings: settingsReducer, feedbackUi: feedbackReducer },
    middleware: (g) => g().concat(api.middleware),
  })

const wrap = (ui: ReactNode, mediaMap: MediaMap | undefined) => (
  <Provider store={store()}>
    <ConfigProvider>
      <MemoryRouter>
        <MediaProvider media={mediaMap}>{ui}</MediaProvider>
      </MemoryRouter>
    </ConfigProvider>
  </Provider>
)

describe('VerbSlide with an illustration', () => {
  afterEach(() => cleanup())

  it('renders no picture for a verb without an image', () => {
    const { container } = render(wrap(<VerbSlide verb={verb} index={0} total={3} />, media))
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.verb-illustration')).toBeNull()
  })

  it('shows the image with the base form as alt text', () => {
    render(wrap(<VerbSlide verb={withImage(IMAGE)} index={0} total={3} />, media))
    const img = screen.getByRole('img', { name: 'go' })
    expect(img.tagName).toBe('IMG')
    expect(img.getAttribute('src')).toBe('https://media.example.com/go.webp')
  })

  it('shows a placeholder when the map has no entry for the image', () => {
    const { container } = render(wrap(<VerbSlide verb={withImage(MISSING)} index={0} total={3} />, media))
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: 'go' })).toHaveTextContent('Obraz niedostępny')
  })
})

describe('VerbTable with illustrations', () => {
  afterEach(() => cleanup())

  it('adds no picture column and no image for an image-free list', () => {
    const { container } = render(wrap(<VerbTable verbs={[verb]} pageSize={10} />, undefined))
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.verb-table-thumb')).toBeNull()
  })

  it('shows a thumbnail with the base form as alt text', () => {
    const { container } = render(wrap(<VerbTable verbs={[withImage(IMAGE), verb]} pageSize={10} />, media))
    const img = screen.getByRole('img', { name: 'go' })
    expect(img.tagName).toBe('IMG')
    expect(container.querySelectorAll('.verb-table-thumb')).toHaveLength(1)
  })

  it('shows a placeholder thumbnail when the map has no entry', () => {
    render(wrap(<VerbTable verbs={[withImage(MISSING)]} pageSize={10} />, media))
    expect(screen.getByRole('img', { name: 'go' })).toHaveTextContent('Obraz niedostępny')
  })
})

describe('verb list response', () => {
  it('accepts the plain array (no image in the catalog)', () => {
    expect(toVerbList([verb])).toEqual({ verbs: [verb], media: {} })
  })

  it('accepts { verbs, media } when a verb has an image', () => {
    expect(toVerbList({ verbs: [withImage(IMAGE)], media })).toEqual({ verbs: [withImage(IMAGE)], media })
  })
})
