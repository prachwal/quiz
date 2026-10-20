import { describe, it, expect } from 'vitest'
import { clozePieces } from './clozePieces'

const ID = '0b6f6c3e-3f5a-4d2e-9a7b-1c2d3e4f5a6b'

describe('clozePieces', () => {
  it('splits text and gaps', () => {
    expect(clozePieces('He {{1}} to {{2}}.')).toEqual([
      { kind: 'text', text: 'He ' },
      { kind: 'gap', gap: '1' },
      { kind: 'text', text: ' to ' },
      { kind: 'gap', gap: '2' },
      { kind: 'text', text: '.' },
    ])
  })
  it('keeps numbering across an image before the first gap and between gaps', () => {
    const pieces = clozePieces(`![Plan](media:${ID}) {{1}} ![Mapa](media:${ID}) {{2}}`)
    expect(pieces.filter((p) => p.kind === 'gap')).toEqual([
      { kind: 'gap', gap: '1' },
      { kind: 'gap', gap: '2' },
    ])
    expect(pieces.filter((p) => p.kind === 'image')).toHaveLength(2)
  })
  it('does not read a marker inside an image description as a gap', () => {
    const pieces = clozePieces(`![uwaga {{1}}](media:${ID}) {{2}}`)
    expect(pieces.some((p) => p.kind === 'gap' && p.gap === '1')).toBe(false)
    expect(pieces).toContainEqual({ kind: 'gap', gap: '2' })
  })
  it('keeps a non-canonical marker as text', () => {
    expect(clozePieces('x {{01}} y')).toEqual([{ kind: 'text', text: 'x {{01}} y' }])
  })
})
