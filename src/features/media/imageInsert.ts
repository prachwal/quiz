/**
 * Where an image's markup lands in a text. The syntax `![alt](media:<uuid>)` has to stand on its own line in prompts and
 * explanations (Media-Storage-Plan: "w jednym wierszu"), so a block insertion gets a line break on each side that has
 * text next to it. Option texts are single-line inputs: there the markup is inserted as it is. Pure, no imports.
 */

export interface ImageInsertOptions {
  /** true for textareas (prompt, explanation): the markup gets its own line. false for single-line option inputs. */
  block: boolean
  /** End of the selection; the text between `caret` and `selectionEnd` is replaced. Defaults to `caret` (no selection). */
  selectionEnd?: number | null
}

export interface ImageInsertResult {
  text: string
  /** The position right after the inserted markup (the line break after it is not counted). */
  caret: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * Inserts `markdown` into `value`. A missing or non-finite caret appends to the end. An out-of-range caret is clamped
 * to the value. With `block`, a line break is added before the markup when the character before it is text (not
 * `\n`), and after it when the character after it is text. Nothing is added at the very start or end of the value.
 */
export function insertImageMarkdown(value: string, caret: number | null | undefined, markdown: string, options: ImageInsertOptions): ImageInsertResult {
  const length = value.length
  const start = caret === null || caret === undefined || !Number.isFinite(caret) ? length : clamp(caret, 0, length)
  const end = options.selectionEnd === null || options.selectionEnd === undefined || !Number.isFinite(options.selectionEnd)
    ? start
    : clamp(options.selectionEnd, start, length)

  const before = value.slice(0, start)
  const after = value.slice(end)
  const leading = options.block && start > 0 && value[start - 1] !== '\n' ? '\n' : ''
  const trailing = options.block && end < length && value[end] !== '\n' ? '\n' : ''

  return { text: `${before}${leading}${markdown}${trailing}${after}`, caret: before.length + leading.length + markdown.length }
}
