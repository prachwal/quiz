/**
 * Inserting a picture's markup into a text field (Media-Storage-Plan M6). The text is changed in one place: at the
 * caret when the field's selection is known, otherwise on a new line at the end. The caret is put back after the
 * insertion, so typing continues where the author expected.
 */
import type { FormInstance } from 'antd'

export interface Selection {
  start: number
  end: number
}

/** The insertion as a pure step: `text` is the new value, `caret` the position right after the inserted markup. */
export function insertAtSelection(text: string, selection: Selection | null, insertion: string): { text: string; caret: number } {
  if (selection === null) {
    const next = text === '' || text.endsWith('\n') ? `${text}${insertion}` : `${text}\n${insertion}`
    return { text: next, caret: next.length }
  }
  const start = Math.min(Math.max(selection.start, 0), text.length)
  const end = Math.min(Math.max(selection.end, start), text.length)
  return { text: `${text.slice(0, start)}${insertion}${text.slice(end)}`, caret: start + insertion.length }
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
 * validated, so the errors of its rules appear (and disappear) the same way as after typing.
 */
export function insertIntoFormField(
  form: FormInstance,
  path: (string | number)[],
  element: HTMLInputElement | HTMLTextAreaElement | null,
  markdown: string,
): void {
  const current = (form.getFieldValue(path) ?? '') as string
  const { text, caret } = insertAtSelection(current, selectionOf(element), markdown)
  form.setFields([{ name: path, value: text, touched: true }])
  void form.validateFields([path]).catch(() => undefined)
  restoreCaret(element, caret)
}
