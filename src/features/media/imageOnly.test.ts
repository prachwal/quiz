import { describe, it, expect } from 'vitest'
import { imageOnlyOption } from './imageOnly'

const ID = '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b'

describe('imageOnlyOption', () => {
  it('returns the image of an option made only of one image', () => {
    expect(imageOnlyOption(`![Kot](media:${ID})`)).toEqual({ mediaId: ID, alt: 'Kot' })
  })
  it('ignores whitespace around the image', () => {
    expect(imageOnlyOption(`  ![Kot](media:${ID}) `)).toEqual({ mediaId: ID, alt: 'Kot' })
  })
  it('is null for plain text', () => {
    expect(imageOnlyOption('kot')).toBeNull()
    expect(imageOnlyOption('')).toBeNull()
  })
  it('is null for text next to the image', () => {
    expect(imageOnlyOption(`Kot ![Kot](media:${ID})`)).toBeNull()
  })
  it('is null for two images', () => {
    expect(imageOnlyOption(`![a](media:${ID})![b](media:${ID})`)).toBeNull()
  })
})
