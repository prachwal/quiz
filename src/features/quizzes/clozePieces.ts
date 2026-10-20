import { CLOZE_MARKER, clozeParts } from '../../shared/quiz/engine'
import { parseRichText } from '../../shared/media/richText'

/** One piece of a cloze prompt, in reading order: text, an image, or a gap (its marker number). */
export type ClozePiece =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mediaId: string; alt: string }
  | { kind: 'gap'; gap: string }

/**
 * Splits a cloze prompt into pieces. Images are taken out first, so a `{{n}}` inside an image description
 * is never a gap; gaps are then found in the text segments only. Gap numbers stay the markers' own numbers,
 * so an image between two gaps does not shift them.
 */
export function clozePieces(prompt: string): ClozePiece[] {
  return parseRichText(prompt).flatMap((part): ClozePiece[] => {
    if (part.type === 'image') return [{ kind: 'image', mediaId: part.mediaId, alt: part.alt }]
    return clozeParts(part.text).flatMap((piece): ClozePiece[] => {
      // a marker is always a whole piece of clozeParts; anything else is text
      const marker = CLOZE_MARKER.exec(piece)
      if (marker && marker[0] === piece) return [{ kind: 'gap', gap: marker[1] }]
      return piece ? [{ kind: 'text', text: piece }] : []
    })
  })
}
