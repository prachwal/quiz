/**
 * Inserting a picture's markup into a text field (Media-Storage-Plan M6). The text is changed in one place: at the
 * caret (or over the selection) when the field's selection is known, otherwise at the end. The line-break rules are
 * in `imageInsert.ts`. The caret is put back after the insertion, so typing continues where the author expected.
 */
import type { FormInstance } from 'antd'
import { insertImageMarkdown } from './imageInsert'

export interface Selection {
  start: number
  end: number
}

/** The selection of a text input or textarea; null when the element is missing or has no selection (not a text field). */
export function selectionOf(element: Pick<HTMLInputElement, 'selectionStart' | 'selectionEnd'> | null | undefined): Selection | null {
  if (!element || typeof element.selectionStart !== 'number' || typeof element.selectionEnd !== 'number') return null
  return { start: element.selectionStart, end: element.selectionEnd }
}

/** Puts the caret back after an insertion (on the next tick, once React has written the new value). */
export function restoreCaret(element: HTMLInputElement | HTMLTextAreaElement | null | undefined, caret: number): void {
  if (!element) return
  setTimeout(() => {
    if (!element.isConnected) return
    element.focus()
    element.setSelectionRange(caret, caret)
  }, 0)
}

/**
 * Inserts into a field of an antd form. `setFields` writes the value and marks the field touched; the field is then
 * validated, so the errors of its rules appear (and disappear) the same way as after typing. `block` is true for
 * textareas (the markup gets its own line) and false for single-line inputs.
 */
export function insertIntoFormField(
  form: FormInstance,
  path: (string | number)[],
  element: HTMLInputElement | HTMLTextAreaElement | null,
  markdown: string,
  block: boolean,
): void {
  const current = (form.getFieldValue(path) ?? '') as string
  const selection = selectionOf(element)
  const { text, caret } = insertImageMarkdown(current, selection?.start ?? null, markdown, { block, selectionEnd: selection?.end ?? null })
  form.setFields([{ name: path, value: text, touched: true }])
  void form.validateFields([path]).catch(() => undefined)
  restoreCaret(element, caret)
}
