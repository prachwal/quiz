import { describe, expect, it } from 'vitest'
import { insertImageMarkdown } from './imageInsert'

const markup = '![Kwadrat](media:5f0c8a1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b)'
const block = { block: true }

describe('insertImageMarkdown (block)', () => {
  it('inserts into an empty value without any line break', () => {
    expect(insertImageMarkdown('', 0, markup, block)).toEqual({ text: markup, caret: markup.length })
    expect(insertImageMarkdown('', null, markup, block)).toEqual({ text: markup, caret: markup.length })
  })

  it('puts the markup on its own line after text, caret at the end', () => {
    const result = insertImageMarkdown('Co widzisz na obrazku?', 22, markup, block)
    expect(result).toEqual({ text: `Co widzisz na obrazku?\n${markup}`, caret: 23 + markup.length })
  })

  it('appends on its own line when no caret is given', () => {
    expect(insertImageMarkdown('Pytanie', undefined, markup, block).text).toBe(`Pytanie\n${markup}`)
    expect(insertImageMarkdown('Pytanie', null, markup, block).text).toBe(`Pytanie\n${markup}`)
  })

  it('adds a line break on both sides when the caret is in the middle of text', () => {
    const result = insertImageMarkdown('przedpo', 5, markup, block)
    expect(result).toEqual({ text: `przed\n${markup}\npo`, caret: 6 + markup.length })
  })

  it('adds no second line break after an existing one', () => {
    expect(insertImageMarkdown('Pytanie\n', 8, markup, block).text).toBe(`Pytanie\n${markup}`)
    expect(insertImageMarkdown('a\nb', 2, markup, block).text).toBe(`a\n${markup}\nb`)
  })

  it('adds no line break at the very start of the value', () => {
    expect(insertImageMarkdown('tekst', 0, markup, block).text).toBe(`${markup}\ntekst`)
  })

  it('adds no line break at the very end of the value', () => {
    expect(insertImageMarkdown('tekst', 5, markup, block).text).toBe(`tekst\n${markup}`)
  })

  it('clamps an out-of-range caret to the value', () => {
    expect(insertImageMarkdown('ab', 99, markup, block)).toEqual({ text: `ab\n${markup}`, caret: 3 + markup.length })
    expect(insertImageMarkdown('ab', -4, markup, block)).toEqual({ text: `${markup}\nab`, caret: markup.length })
  })

  it('treats a non-finite caret as the end of the value', () => {
    expect(insertImageMarkdown('ab', Number.NaN, markup, block).text).toBe(`ab\n${markup}`)
  })

  it('replaces the selected range and keeps the line-break rules', () => {
    expect(insertImageMarkdown('abcdef', 2, 'X', { block: true, selectionEnd: 4 })).toEqual({ text: 'ab\nX\nef', caret: 4 })
  })

  it('clamps a selection end that is outside the text', () => {
    expect(insertImageMarkdown('ab', 1, 'X', { block: true, selectionEnd: 9 })).toEqual({ text: 'a\nX', caret: 3 })
  })
})

describe('insertImageMarkdown (block: false, single-line option)', () => {
  it('inserts the markup as it is, without a line break, into an empty option', () => {
    expect(insertImageMarkdown('', 0, markup, { block: false })).toEqual({ text: markup, caret: markup.length })
  })

  it('glues the markup to existing text at the caret, with no line break', () => {
    expect(insertImageMarkdown('Kot', 3, markup, { block: false })).toEqual({ text: `Kot${markup}`, caret: 3 + markup.length })
  })

  it('inserts in the middle of text without line breaks', () => {
    expect(insertImageMarkdown('ab', 1, 'X', { block: false })).toEqual({ text: 'aXb', caret: 2 })
  })

  it('appends without a line break when no caret is given', () => {
    expect(insertImageMarkdown('Kot', null, markup, { block: false }).text).toBe(`Kot${markup}`)
  })
})
